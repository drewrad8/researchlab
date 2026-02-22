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
async function spawn(template, label, projectPath, parentWorkerId, taskDescription) {
  const MAX_RETRIES = 3;
  const BASE_DELAY = 3000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let result;
    try {
      result = await request('POST', '/api/workers/spawn-from-template', {
        template,
        label,
        projectPath,
        parentWorkerId,
        task: { description: taskDescription }
      });
    } catch (err) {
      // Network error (connection refused, timeout, etc.)
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, attempt);
        console.log(`[strategos.spawn] network error: ${err.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }

    // Parse string responses
    if (typeof result === 'string') {
      try { result = JSON.parse(result); } catch { /* not JSON, fall through */ }
    }

    // Success: result has a worker id
    if (result?.id || result?.workerId) {
      return result;
    }

    // Non-transient errors: don't retry validation failures
    const errMsg = result?.error || '';
    if (/must be under|must be \d|label must be|invalid template|missing required|must not contain|control character/i.test(errMsg)) {
      throw new Error(`Spawn rejected (non-transient): ${errMsg}`);
    }

    // Transient errors (rate limiting, missing id): retry with backoff
    if (attempt < MAX_RETRIES) {
      const reason = errMsg || 'no worker id in response';
      const delay = BASE_DELAY * Math.pow(2, attempt);
      console.log(`[strategos.spawn] ${reason}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    // Exhausted retries — include error details for callers
    const detail = errMsg || 'no worker id in response';
    throw new Error(`Spawn failed after ${MAX_RETRIES} retries: ${detail}`);
  }
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
