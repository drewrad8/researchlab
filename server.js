const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./lib/project-store');
const sourcesLib = require('./lib/sources');
const researchIndex = require('./lib/research-index');

const PORT = process.env.RESEARCHLAB_PORT || 3700;
const PUBLIC_DIR = path.join(__dirname, 'public');

// --- SSE client registry (keyed by project id) ---

const sseClients = new Map(); // projectId -> Set<res>

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
        const project = store.create(body.topic);
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
