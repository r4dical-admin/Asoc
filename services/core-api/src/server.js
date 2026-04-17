import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const webRoot = join(repoRoot, 'apps/web');
const demoRoot = join(repoRoot, 'demo-data');
const port = Number(process.env.ASOC_PORT || 8080);

const tenant = {
  id: process.env.ASOC_DEMO_TENANT_ID || 'tenant-demo',
  name: process.env.ASOC_DEMO_TENANT_NAME || 'Demo Security Org',
  roles: ['analyst', 'manager', 'automation'],
};

const v1Decisions = {
  frontend: 'SPA hosted on Cloudflare Pages',
  controlPlane: 'Supabase Auth + Postgres metadata + RLS, with Core API as policy enforcement point',
  queue: 'Supabase/Postgres-native queue first',
  objects: 'S3-compatible artifact and document store',
  runtime: 'Google Cloud Run Jobs for Pi-powered agent containers',
  profiles: ['triage', 'analysis', 'chat'],
};

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.yaml': 'application/yaml; charset=utf-8',
  '.yml': 'application/yaml; charset=utf-8',
};

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
  });
  if (typeof body === 'string' || body instanceof Uint8Array) {
    res.end(body);
    return;
  }
  res.end(JSON.stringify(body, null, 2));
}

function requireTenant(req, res) {
  const requestedTenant = req.headers['x-tenant-id'] || tenant.id;
  if (requestedTenant !== tenant.id) {
    send(res, 403, {
      error: 'tenant_forbidden',
      message: 'Request tenant does not match the active demo tenant.',
    });
    return false;
  }
  return true;
}

function safeJoin(root, requestedPath) {
  const target = normalize(requestedPath || '')
    .replace(/^[/\\]+/, '')
    .replace(/^(\.\.[/\\])+/, '');
  const resolved = resolve(root, target);
  if (!resolved.startsWith(resolve(root))) {
    throw new Error('Path escapes allowed root.');
  }
  return resolved;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function toObjectKey(path) {
  return `tenants/${tenant.id}/${path.replace(/^demo-data\//, '')}`;
}

async function buildManifest() {
  const manifest = await readJson(join(demoRoot, 'manifest.json'));
  return {
    tenant,
    source: 'demo-data/manifest.json',
    incidents: (manifest.incidents || []).map((incident) => ({
      ...incident,
      objectPrefix: `tenants/${tenant.id}/incidents/${incident.id}`,
      pointers: (incident.files || []).map((file) => ({
        section: file.replace(/\.(md|yaml|json)$/i, ''),
        objectKey: toObjectKey(`demo-data/incidents/${incident.id}/${file}`),
      })),
    })),
    backgroundTasks: manifest.backgroundTasks || [],
    oldIncidents: manifest.oldIncidents || [],
    resources: manifest.resources || {},
  };
}

async function handleApi(req, res, url) {
  if (!requireTenant(req, res)) return;

  if (url.pathname === '/api/platform') {
    send(res, 200, {
      tenant,
      v1Decisions,
      implementationMode: 'local-dev-core-api',
      policy: {
        objectAccess: 'Core API mediates demo object reads; production issues tenant-scoped S3 presigned URLs.',
        templatePermissions: 'Template/workflow frontmatter is parsed at ingest and pinned to task metadata.',
      },
    });
    return;
  }

  if (url.pathname === '/api/manifest') {
    send(res, 200, await buildManifest());
    return;
  }

  if (url.pathname === '/api/specs') {
    send(res, 200, await readFile(join(repoRoot, 'SPECS.md'), 'utf8'), 'text/markdown; charset=utf-8');
    return;
  }

  if (url.pathname === '/api/document') {
    const path = url.searchParams.get('path');
    if (!path || !path.startsWith('demo-data/')) {
      send(res, 400, { error: 'invalid_path', message: 'Only demo-data paths are available in local dev.' });
      return;
    }

    try {
      const filePath = safeJoin(repoRoot, path);
      send(res, 200, {
        path,
        objectKey: toObjectKey(path),
        content: await readFile(filePath, 'utf8'),
      });
    } catch (error) {
      send(res, 404, { error: 'document_not_found', message: error.message });
    }
    return;
  }

  send(res, 404, { error: 'not_found' });
}

async function handleStatic(req, res, url) {
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = safeJoin(webRoot, decodeURIComponent(requestedPath));
  try {
    const body = await readFile(filePath);
    send(res, 200, body, mimeTypes[extname(filePath)] || 'application/octet-stream');
  } catch {
    send(res, 200, await readFile(join(webRoot, 'index.html')), 'text/html; charset=utf-8');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname === '/health/live' || url.pathname === '/health/ready') {
      send(res, 200, { status: 'ok' });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    await handleStatic(req, res, url);
  } catch (error) {
    send(res, 500, { error: 'internal_error', message: error.message });
  }
});

server.listen(port, () => {
  console.log(`Asoc core platform listening on http://localhost:${port}`);
});
