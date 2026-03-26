const http = require('http');
const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;
const DATA_ROOT = path.join(ROOT, 'demo-data');

const RESOURCE_SECTION_MAP = {
  workflows: 'workflows',
  'knowledge-base': 'knowledge-base',
  'historic-rcas-sev1s': 'historic-rcas-sev1s',
  skills: 'skills',
  'data-sources': 'data-sources',
  'mcps-integrations': 'mcps-integrations',
  intakes: 'intakes',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, payload, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'Content-Type': contentType });
  res.end(payload);
}

function safeJoin(basePath, ...segments) {
  const resolved = path.resolve(basePath, ...segments);
  const normalizedBase = path.resolve(basePath) + path.sep;
  if (!resolved.startsWith(normalizedBase)) {
    throw new Error('Invalid path');
  }
  return resolved;
}

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
}

async function getIncidents() {
  const incidentsRoot = path.join(DATA_ROOT, 'incidents');
  const entries = await fs.readdir(incidentsRoot, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

  const incidents = [];
  for (const id of directories) {
    const files = await listFiles(path.join(incidentsRoot, id));
    incidents.push({ id, files });
  }

  return incidents;
}

async function getResourceSections() {
  const base = path.join(DATA_ROOT, 'resources');
  const sections = {};

  for (const [key, folderName] of Object.entries(RESOURCE_SECTION_MAP)) {
    const dir = path.join(base, folderName);
    sections[key] = await listFiles(dir);
  }

  return sections;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/api/incidents') {
      const incidents = await getIncidents();
      return sendJson(res, 200, { incidents });
    }

    if (url.pathname === '/api/resources') {
      const sections = await getResourceSections();
      return sendJson(res, 200, { sections });
    }

    if (url.pathname === '/api/file') {
      const scope = url.searchParams.get('scope');
      const section = url.searchParams.get('section');
      const name = url.searchParams.get('name');

      if (!scope || !section || !name) {
        return sendJson(res, 400, { error: 'Missing scope, section, or name.' });
      }

      let baseDir;
      if (scope === 'incident') {
        baseDir = safeJoin(DATA_ROOT, 'incidents', section);
      } else if (scope === 'resource') {
        const mapped = RESOURCE_SECTION_MAP[section];
        if (!mapped) {
          return sendJson(res, 404, { error: 'Unknown resource section.' });
        }
        baseDir = safeJoin(DATA_ROOT, 'resources', mapped);
      } else {
        return sendJson(res, 400, { error: 'Unknown scope.' });
      }

      const filePath = safeJoin(baseDir, name);
      const content = await fs.readFile(filePath, 'utf8');
      return sendText(res, 200, content);
    }

    if (url.pathname === '/' || url.pathname === '/interface-example.html') {
      const html = await fs.readFile(path.join(ROOT, 'interface-example.html'), 'utf8');
      return sendText(res, 200, html, 'text/html; charset=utf-8');
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return sendJson(res, 404, { error: 'File not found' });
    }

    return sendJson(res, 500, { error: error.message || 'Internal server error' });
  }
});

if (!fssync.existsSync(DATA_ROOT)) {
  throw new Error('demo-data directory is missing.');
}

server.listen(PORT, () => {
  console.log(`Demo server running on http://localhost:${PORT}`);
});
