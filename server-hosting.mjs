import {createHash, timingSafeEqual} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const digest = value => createHash('sha256').update(value).digest();

export function beginGenerationStream(res, intervalMs = 15000) {
  res.writeHead(200, {'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no'});
  res.flushHeaders();
  // Empty NDJSON lines keep the connection active while the model is reasoning.
  res.write('\n');
  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) res.write('\n');
  }, intervalMs);
  heartbeat.unref();
  const stop = () => clearInterval(heartbeat);
  res.once('close', stop);
  return stop;
}

export async function createHosting(server, {port, env = process.env, distDirectory = fileURLToPath(new URL('./dist/', import.meta.url))} = {}) {
  const production = env.NODE_ENV === 'production';
  const host = env.HOST || (production ? '0.0.0.0' : '127.0.0.1');
  const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
  if (production) origins.clear();
  for (const value of (env.APP_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean)) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('APP_ORIGIN must contain complete http(s) origins, separated by commas.');
    }
    origins.add(url.origin);
  }
  if (production && !origins.size) throw new Error('Set APP_ORIGIN to the public HTTPS origin before starting production.');
  const password = env.GAME_PASSWORD || '';
  if (production && !password && env.ALLOW_PUBLIC_ACCESS !== 'true') {
    throw new Error('Set GAME_PASSWORD for invited players, or ALLOW_PUBLIC_ACCESS=true for a public game.');
  }
  const expectedAuth = digest(`Basic ${Buffer.from(`player:${password}`).toString('base64')}`);
  let middlewares;
  if (production) {
    const directory = distDirectory;
    await fs.access(path.join(directory, 'index.html'));
    const {default: sirv} = await import('sirv');
    const serve = sirv(directory, {etag: true, maxAge: 0, dotfiles: false});
    middlewares = (req, res) => {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405, {allow: 'GET, HEAD'});
        return res.end();
      }
      serve(req, res, () => {
        res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
        res.end('Not found');
      });
    };
  } else {
    const {createServer} = await import('vite');
    const vite = await createServer({server: {port, middlewareMode: true, hmr: {server}}, appType: 'spa'});
    middlewares = vite.middlewares;
  }
  return {
    host,
    middlewares,
    isAllowedOrigin: origin => !origin || origins.has(origin),
    authorize(req, res) {
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('referrer-policy', 'same-origin');
      if (req.url === '/api/health' || !password || timingSafeEqual(digest(req.headers.authorization || ''), expectedAuth)) return true;
      res.writeHead(401, {'www-authenticate': 'Basic realm="Bad Idea", charset="UTF-8"', 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8'});
      res.end('Enter the shared game password. Username: player.');
      return false;
    },
    saveArtifacts: env.SAVE_GENERATION_ARTIFACTS ? env.SAVE_GENERATION_ARTIFACTS === 'true' : !production,
  };
}

export async function saveGenerationArtifact(kind, artifactId, data) {
  try {
    const directory = new URL(`./runtime/${kind}/`, import.meta.url);
    await fs.mkdir(directory, {recursive: true});
    await fs.writeFile(new URL(`${artifactId}.json`, directory), JSON.stringify(data, null, 2));
  } catch {
    // Diagnostic files are optional; a storage failure must not discard a generated room.
    console.warn('Could not save the optional generation artifact.');
  }
}
