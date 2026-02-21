'use strict';

const http = require('http');

const BASE_URL = process.env.STRATEGOS_URL || 'http://localhost:38007';
const POLL_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// Low-level HTTP helper
// ---------------------------------------------------------------------------

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {}
    };

    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        // Plain-text endpoints (e.g. /status) won't parse as JSON
        if (res.headers['content-type']?.includes('application/json')) {
          try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
        } else {
          resolve(raw);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('Request timeout'));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Spawn a new Strategos worker.
 * @returns {Promise<{id: string, ...}>} Spawn result including worker id.
 */
function spawn(template, label, projectPath, parentWorkerId, taskDescription) {
  return request('POST', '/api/workers/spawn-from-template', {
    template,
    label,
    projectPath,
    parentWorkerId,
    task: { description: taskDescription }
  });
}

/**
 * Get worker status (plain text: "status health progress% step").
 * @returns {Promise<string>}
 */
function getStatus(workerId) {
  return request('GET', `/api/workers/${workerId}/status`);
}

/**
 * Get worker output with ANSI stripped.
 * @param {string} workerId
 * @param {number} [lines] - Optional: only return last N lines.
 * @returns {Promise<string>}
 */
function getOutput(workerId, lines) {
  let path = `/api/workers/${workerId}/output?strip_ansi=true`;
  if (lines) path += `&lines=${lines}`;
  return request('GET', path);
}

/**
 * Send a Ralph signal for a worker.
 * @param {string} workerId
 * @param {string} status - "in_progress" | "done" | "blocked"
 * @param {object} data   - Additional fields (progress, currentStep, learnings, etc.)
 * @returns {Promise<object>}
 */
function signal(workerId, status, data) {
  return request('POST', `/api/ralph/signal/by-worker/${workerId}`, {
    status,
    ...data
  });
}

/**
 * Delete a worker.
 * @returns {Promise<object>}
 */
function deleteWorker(workerId) {
  return request('DELETE', `/api/workers/${workerId}`);
}

/**
 * Poll getStatus every 5s until worker reaches "done" or "error".
 * @param {string} workerId
 * @param {number} [timeoutMs=1800000] - Default 30 minutes.
 * @returns {Promise<string>} Final status string.
 */
function waitForDone(workerId, timeoutMs = 1800000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Worker ${workerId} timed out after ${timeoutMs}ms`));
      }
      try {
        const status = await getStatus(workerId);
        const statusStr = String(status).trim();
        const firstWord = statusStr.split(/\s+/)[0].toLowerCase();
        if (firstWord === 'done' || firstWord === 'completed' || firstWord === 'awaiting_review') {
          return resolve(statusStr);
        }
        if (firstWord === 'not_found' || firstWord === 'not found') {
          // Worker was deleted (possibly auto-cleaned) -- treat as done
          return resolve('not_found');
        }
        if (firstWord === 'error' || firstWord === 'failed' || firstWord === 'blocked') {
          return reject(new Error(`Worker ${workerId} ended with status: ${statusStr}`));
        }
        setTimeout(check, POLL_INTERVAL_MS);
      } catch (err) {
        // Network blip — retry once more
        setTimeout(check, POLL_INTERVAL_MS);
      }
    };
    check();
  });
}

module.exports = {
  spawn,
  getStatus,
  getOutput,
  signal,
  deleteWorker,
  waitForDone
};
