const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./lib/project-store');
const sourcesLib = require('./lib/sources');
const researchIndex = require('./lib/research-index');
const strategos = require('./lib/strategos');

const PORT = process.env.RESEARCHLAB_PORT || 3700;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SUGGESTIONS_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE,
  '.researchlab',
  'suggestions.json'
);

// --- SSE client registry (keyed by project id) ---

const sseClients = new Map(); // projectId -> Set<res>

// --- Deploy status tracking (in-memory) ---
const deployStatus = new Map(); // projectId -> { status, workerId, updatedAt, error? }

function addSSEClient(projectId, res) {
  if (!sseClients.has(projectId)) sseClients.set(projectId, new Set());
  sseClients.get(projectId).add(res);
  res.on('close', () => {
    const clients = sseClients.get(projectId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) sseClients.delete(projectId);
    }
  });
}

function emitEvent(projectId, event, data) {
  const clients = sseClients.get(projectId);
  if (!clients) return;
  const payload =
    (event ? `event: ${event}\n` : '') +
    `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch (_) { /* client gone */ }
  }
}

// --- Pipeline (graceful if missing) ---

let pipeline = null;
try {
  pipeline = require('./lib/pipeline');
} catch (_) {
  // pipeline.js not yet implemented -- that's fine
}

// --- MIME types ---

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
};

// --- Helpers ---

function sendJSON(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function send404(res) {
  sendJSON(res, 404, { error: 'not found' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, filePath) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) { send404(res); return; }
  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) { send404(res); return; }
    const ext = path.extname(resolved).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
    });
    fs.createReadStream(resolved).pipe(res);
  });
}

// --- Route matching ---

function matchRoute(method, url) {
  const [pathname] = url.split('?');

  // Static: GET /
  if (method === 'GET' && pathname === '/') {
    return { handler: 'index' };
  }

  // Static: GET /public/* or /css/* or /js/*
  if (method === 'GET' && pathname.startsWith('/public/')) {
    return { handler: 'static', filePath: pathname.slice(1) }; // strip leading /
  }
  if (method === 'GET' && (pathname.startsWith('/css/') || pathname.startsWith('/js/'))) {
    return { handler: 'static', filePath: 'public' + pathname };
  }

  // API routes
  const apiMatch = pathname.match(/^\/api\/projects(?:\/([^/]+))?(?:\/(.+))?$/);
  if (apiMatch) {
    const id = apiMatch[1];
    const sub = apiMatch[2];

    if (!id) {
      if (method === 'GET') return { handler: 'listProjects' };
      if (method === 'POST') return { handler: 'createProject' };
    } else if (!sub) {
      if (method === 'GET') return { handler: 'getProject', id };
      if (method === 'DELETE') return { handler: 'deleteProject', id };
    } else if (sub === 'graph' && method === 'GET') {
      return { handler: 'getGraph', id };
    } else if (sub === 'events' && method === 'GET') {
      return { handler: 'sse', id };
    } else if (sub === 'pause' && method === 'POST') {
      return { handler: 'pauseProject', id };
    } else if (sub === 'unpause' && method === 'POST') {
      return { handler: 'unpauseProject', id };
    } else if (sub === 'resume' && method === 'POST') {
      return { handler: 'resumeProject', id };
    } else if (sub === 'deploy-fartmart' && method === 'POST') {
      return { handler: 'deployFartmart', id };
    } else if (sub === 'deploy-status' && method === 'GET') {
      return { handler: 'getDeployStatus', id };
    }
  }

  // Sources API
  if (pathname === '/api/sources') {
    if (method === 'GET') return { handler: 'listSources' };
    if (method === 'POST') return { handler: 'upsertSource' };
  }
  const sourceMatch = pathname.match(/^\/api\/sources\/([^/]+)$/);
  if (sourceMatch) {
    if (method === 'GET') return { handler: 'getSource', sourceId: sourceMatch[1] };
    if (method === 'DELETE') return { handler: 'deleteSource', sourceId: sourceMatch[1] };
  }

  // Research index API
  if (pathname === '/api/index') {
    if (method === 'GET') return { handler: 'getIndex' };
  }
  if (pathname === '/api/index/rebuild' && method === 'POST') {
    return { handler: 'rebuildIndex' };
  }

  // Suggestions API
  if (pathname === '/api/suggest-research' && method === 'POST') {
    return { handler: 'suggestResearch' };
  }
  if (pathname === '/api/suggestions' && method === 'GET') {
    return { handler: 'getSuggestions' };
  }

  return null;
}

// --- Request handler ---

async function handleRequest(req, res) {
  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const route = matchRoute(req.method, req.url);
  if (!route) { send404(res); return; }

  try {
    switch (route.handler) {
      case 'index':
        serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
        break;

      case 'static':
        serveStatic(res, path.join(__dirname, route.filePath));
        break;

      case 'listProjects':
        sendJSON(res, 200, store.getAll());
        break;

      case 'createProject': {
        const body = await readBody(req);
        if (!body || !body.topic) {
          sendJSON(res, 400, { error: 'missing topic' });
          return;
        }
        const investigationBudget = body.investigationBudget != null
          ? Math.max(0, Math.min(50, parseInt(body.investigationBudget, 10) || 10))
          : 10;
        const project = store.create(body.topic, { investigationBudget });
        // Kick off pipeline (fire-and-forget with proper error handling)
        if (pipeline && typeof pipeline.start === 'function') {
          pipeline.start(project, (event, data) => emitEvent(project.id, event, data))
            .catch((e) => {
              console.error(`[pipeline error] project=${project.id}: ${e.message}`);
              // pipeline.start already sets status to 'error' in its catch block,
              // but emit an SSE event so any connected clients know
              emitEvent(project.id, 'error_event', {
                status: 'error',
                projectId: project.id,
                error: e.message,
              });
            });
        }
        sendJSON(res, 201, project);
        break;
      }

      case 'resumeProject': {
        const body = await readBody(req);
        if (!body || !body.fromPhase) {
          sendJSON(res, 400, { error: 'missing fromPhase' });
          return;
        }
        const project = store.get(route.id);
        if (!project) { send404(res); return; }
        // Kick off pipeline resume (fire-and-forget with proper error handling)
        if (pipeline && typeof pipeline.resume === 'function') {
          pipeline.resume(project, body.fromPhase, (event, data) => emitEvent(project.id, event, data))
            .catch((e) => {
              console.error(`[pipeline resume error] project=${project.id}: ${e.message}`);
              emitEvent(project.id, 'error_event', {
                status: 'error',
                projectId: project.id,
                error: e.message,
              });
            });
        }
        sendJSON(res, 200, { ok: true, projectId: project.id, resumingFrom: body.fromPhase });
        break;
      }

      case 'pauseProject': {
        const project = store.get(route.id);
        if (!project) { send404(res); return; }
        store.pause(route.id);
        // Kill running Strategos workers for this project (best-effort)
        strategos.listWorkers('running').then(function (workers) {
          for (const w of workers) {
            const wProject = w.projectPath || w.project || '';
            const wLabel = w.label || '';
            if (wProject.includes(route.id) || wLabel.includes(project.topic?.slice(0, 40))) {
              strategos.deleteWorker(w.id).catch(function () {});
            }
          }
        }).catch(function () {});
        emitEvent(route.id, 'phase', { phase: 'paused', status: 'paused' });
        sendJSON(res, 200, { ok: true, paused: true });
        break;
      }

      case 'unpauseProject': {
        const project = store.get(route.id);
        if (!project) { send404(res); return; }
        store.unpause(route.id);
        emitEvent(route.id, 'phase', { phase: 'unpaused', status: 'unpaused' });
        sendJSON(res, 200, { ok: true, paused: false });
        break;
      }

      case 'getProject': {
        const project = store.get(route.id);
        if (!project) { send404(res); return; }
        sendJSON(res, 200, project);
        break;
      }

      case 'deleteProject': {
        const removed = store.remove(route.id);
        if (!removed) { send404(res); return; }
        sendJSON(res, 200, { ok: true });
        break;
      }

      case 'getGraph': {
        const graph = store.getGraph(route.id);
        if (!graph) { send404(res); return; }
        sendJSON(res, 200, graph);
        break;
      }

      case 'sse': {
        const project = store.get(route.id);
        if (!project) { send404(res); return; }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', projectId: route.id })}\n\n`);
        addSSEClient(route.id, res);
        break;
      }

      // --- Deploy to Fartmart ---
      case 'deployFartmart': {
        const project = store.get(route.id);
        if (!project) { send404(res); return; }
        if (project.status !== 'complete') {
          sendJSON(res, 400, { error: 'Project must be complete before deploying' });
          return;
        }
        // Check if already deploying
        const existing = deployStatus.get(route.id);
        if (existing && existing.status === 'deploying') {
          sendJSON(res, 200, { ok: true, status: 'deploying', workerId: existing.workerId });
          return;
        }

        const FARTMART_DIR = '/home/druzy/thea/fartmart';
        const projectDir = path.join(
          process.env.HOME || process.env.USERPROFILE,
          '.researchlab', 'projects', route.id
        );
        const taskDesc = [
          'Deploy a completed research project to fartmart.net.',
          '',
          'Steps:',
          '1. Read the knowledge graph from: ' + path.join(projectDir, 'graph.json'),
          '2. Read the project metadata from: ' + path.join(projectDir, 'project.json'),
          '3. Create the fartmart research directory if it does not exist: mkdir -p ' + FARTMART_DIR + '/research/',
          '4. Transform the graph into a standalone HTML page with:',
          '   - The project topic as the page title',
          '   - A summary section listing key findings (from nodes with type "finding" or high-confidence nodes)',
          '   - A knowledge graph section listing all nodes grouped by type, with their summaries and confidence levels',
          '   - A sources/references section listing all edges and their evidence',
          '   - Clean, readable styling suitable for fartmart.net',
          '5. Write the HTML file to: ' + FARTMART_DIR + '/research/' + route.id + '.html',
          '6. Create or update an index file at ' + FARTMART_DIR + '/research/index.json that lists all deployed research pages',
          '7. Verify the output file exists and is valid HTML',
          '',
          'Project ID: ' + route.id,
          'Topic: ' + (project.topic || 'Unknown'),
        ].join('\n');

        const label = 'IMPL: deploy research "' + (project.topic || route.id).slice(0, 80) + '" to fartmart';

        deployStatus.set(route.id, { status: 'deploying', workerId: null, updatedAt: new Date().toISOString() });

        strategos.spawn('impl', label, __dirname, null, taskDesc)
          .then(result => {
            const wid = result?.id || result?.workerId || null;
            deployStatus.set(route.id, { status: 'deploying', workerId: wid, updatedAt: new Date().toISOString() });
            // Poll for completion
            if (wid) {
              strategos.waitForDone(wid, 600000)
                .then(() => {
                  deployStatus.set(route.id, { status: 'deployed', workerId: wid, updatedAt: new Date().toISOString() });
                })
                .catch(err => {
                  deployStatus.set(route.id, { status: 'error', workerId: wid, updatedAt: new Date().toISOString(), error: err.message });
                });
            }
          })
          .catch(err => {
            console.error('[deploy-fartmart] spawn failed:', err.message);
            deployStatus.set(route.id, { status: 'error', workerId: null, updatedAt: new Date().toISOString(), error: err.message });
          });

        sendJSON(res, 200, { ok: true, status: 'deploying' });
        break;
      }

      case 'getDeployStatus': {
        const status = deployStatus.get(route.id);
        if (!status) {
          sendJSON(res, 200, { status: 'none' });
          return;
        }
        sendJSON(res, 200, status);
        break;
      }

      // --- Sources ---
      case 'listSources': {
        const allSources = sourcesLib.loadAll();
        const query = new URL(req.url, 'http://localhost').searchParams.get('topic');
        if (query) {
          sendJSON(res, 200, sourcesLib.matchSources(query));
        } else {
          sendJSON(res, 200, allSources);
        }
        break;
      }

      case 'getSource': {
        const src = sourcesLib.getById(route.sourceId);
        if (!src) { send404(res); return; }
        sendJSON(res, 200, src);
        break;
      }

      case 'upsertSource': {
        const body = await readBody(req);
        if (!body || !body.id) {
          sendJSON(res, 400, { error: 'source must have an id' });
          return;
        }
        const saved = sourcesLib.upsert(body);
        sendJSON(res, 200, saved);
        break;
      }

      case 'deleteSource': {
        const removed = sourcesLib.remove(route.sourceId);
        if (!removed) { send404(res); return; }
        sendJSON(res, 200, { ok: true });
        break;
      }

      // --- Research Index ---
      case 'getIndex': {
        const entries = researchIndex.getAll();
        const query = new URL(req.url, 'http://localhost').searchParams.get('q');
        if (query) {
          sendJSON(res, 200, researchIndex.search(query));
        } else {
          sendJSON(res, 200, entries);
        }
        break;
      }

      case 'rebuildIndex': {
        const rebuilt = researchIndex.rebuild();
        sendJSON(res, 200, rebuilt);
        break;
      }

      // --- Suggestions ---
      case 'suggestResearch': {
        // Load all completed project graphs
        const allProjects = store.getAll();
        const graphSummaries = [];
        for (const p of allProjects) {
          const graph = store.getGraph(p.id);
          if (!graph || !graph.nodes) continue;
          const nodes = graph.nodes.map(n => ({
            label: n.label,
            type: n.type,
            summary: n.summary || ''
          }));
          graphSummaries.push({
            topic: p.topic,
            projectId: p.id,
            status: p.status,
            nodeCount: nodes.length,
            nodes: nodes.slice(0, 60) // cap per-project to keep prompt manageable
          });
        }

        if (graphSummaries.length < 1) {
          sendJSON(res, 400, { error: 'Need at least 1 completed project with a graph to analyze.' });
          break;
        }

        // Write a status marker so UI knows analysis is in progress
        const statusMarker = { status: 'analyzing', startedAt: new Date().toISOString(), suggestions: [] };
        fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(statusMarker, null, 2));

        // Build task description for the Strategos worker
        const sanitize = s => (s || '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ').replace(/[\r\n\t]/g, ' ').replace(/ +/g, ' ').trim();
        // Budget: keep total task description under 9500 chars for Strategos 10K limit
        const preambleLen = 600; // rough estimate for the static text below
        const budgetPerProject = Math.max(400, Math.floor((9500 - preambleLen) / Math.max(graphSummaries.length, 1)));

        const graphSummaryText = graphSummaries.map(g => {
          const topicClean = sanitize(g.topic);
          const topicShort = topicClean.length > 120 ? topicClean.slice(0, 120) + '...' : topicClean;
          let header = 'PROJECT: ' + topicShort + ' (' + g.nodeCount + ' nodes). ';
          let nodeList = 'Key nodes: ';
          const maxNodes = Math.min(g.nodes.length, 12);
          const items = [];
          for (let i = 0; i < maxNodes; i++) {
            const n = g.nodes[i];
            const item = sanitize(n.label);
            if (header.length + nodeList.length + items.join(', ').length + item.length + 4 > budgetPerProject) break;
            items.push(item);
          }
          return header + nodeList + items.join(', ') + '.';
        }).join(' | ');

        const taskDesc = 'Cross-domain research analyst task. Analyze these project knowledge graphs and identify: (1) CROSS-CONNECTIONS between projects (2) KNOWLEDGE GAPS (3) CONTRADICTIONS (4) NOVEL TOPICS. Write valid JSON to ' + SUGGESTIONS_FILE + ' with structure: {"status":"complete","completedAt":"<ISO>","suggestions":[{"title":"...","type":"cross-connection|gap|contradiction|novel-topic","rationale":"...","relatedProjects":["..."],"suggestedTopic":"..."}]}. Generate 5-10 specific suggestions citing project findings. --- PROJECTS --- ' + graphSummaryText;

        // Spawn worker (fire-and-forget)
        strategos.spawn(
          'research',
          'RESEARCH: cross-project analysis and research suggestions',
          __dirname,
          null,
          taskDesc
        ).catch(err => {
          console.error('[suggest-research] Failed to spawn Strategos worker:', err.message);
          // Write error to suggestions file so UI can display it
          const errResult = { status: 'error', error: err.message, completedAt: new Date().toISOString(), suggestions: [] };
          try { fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(errResult, null, 2)); } catch (_) {}
        });

        sendJSON(res, 200, { ok: true, status: 'analyzing' });
        break;
      }

      case 'getSuggestions': {
        if (!fs.existsSync(SUGGESTIONS_FILE)) {
          sendJSON(res, 200, { status: 'none', suggestions: [] });
          break;
        }
        try {
          const data = JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8'));
          sendJSON(res, 200, data);
        } catch (_) {
          sendJSON(res, 200, { status: 'none', suggestions: [] });
        }
        break;
      }

      default:
        send404(res);
    }
  } catch (e) {
    console.error('[request error]', e);
    sendJSON(res, 500, { error: 'internal server error' });
  }
}

// --- Startup: check research index freshness ---

(function checkIndex() {
  try {
    const index = researchIndex.load();
    if (index.needsRebuild) {
      console.log('[researchlab] research index has stale entries (missing searchTerms), rebuilding...');
      researchIndex.rebuild();
    }
  } catch (e) {
    console.error('[researchlab] index startup check failed:', e.message);
  }
})();

// --- Start ---

const server = http.createServer(handleRequest);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[researchlab] server listening on http://0.0.0.0:${PORT}`);
});

// Export emitEvent so pipeline.js can require('../server') to push events
module.exports = { emitEvent, sseClients };
