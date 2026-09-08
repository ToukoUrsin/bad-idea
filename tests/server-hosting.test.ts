import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {beginGenerationStream, createHosting} from '../server-hosting.mjs';
import {readBuildResponse} from '../src/build-stream.ts';

const origin = 'https://bad-idea.example';
const authorization = `Basic ${Buffer.from('player:invite-only-password').toString('base64')}`;
const productionEnv = {NODE_ENV: 'production', APP_ORIGIN: origin, GAME_PASSWORD: 'invite-only-password'};

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bad-idea-hosting-'));
  const dist = path.join(root, 'dist');
  await fs.mkdir(path.join(dist, 'assets'), {recursive: true});
  await fs.mkdir(path.join(root, 'src'));
  await fs.mkdir(path.join(root, 'runtime'));
  await Promise.all([
    fs.writeFile(path.join(dist, 'index.html'), '<!doctype html><title>Game fixture</title>'),
    fs.writeFile(path.join(dist, 'assets/game.js'), 'globalThis.gameFixture = true;'),
    fs.writeFile(path.join(dist, '.env'), 'SECRET_INSIDE_DIST'),
    fs.writeFile(path.join(root, '.env'), 'SECRET_OUTSIDE_DIST'),
    fs.writeFile(path.join(root, 'server.mjs'), 'PRIVATE_SERVER_SOURCE'),
    fs.writeFile(path.join(root, 'src/main.ts'), 'PRIVATE_SOURCE'),
    fs.writeFile(path.join(root, 'runtime/invention.json'), 'PRIVATE_INVENTION'),
  ]);
  return {root, dist};
}

function request(port: number, pathname: string, options: {method?: string; headers?: http.OutgoingHttpHeaders} = {}) {
  return new Promise<{status: number; headers: http.IncomingHttpHeaders; body: string}>((resolve, reject) => {
    const req = http.request({host: '127.0.0.1', port, path: pathname, method: options.method || 'GET', headers: options.headers}, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString()}));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

test('production hosting serves the built game and protects generation access', async t => {
  const files = await fixture();
  const server = http.createServer();
  let apiCalls = 0;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await fs.rm(files.root, {recursive: true, force: true});
  });
  const hosting = await createHosting(server, {port: 0, env: productionEnv, distDirectory: files.dist});
  server.on('request', (req, res) => {
    if (!hosting.authorize(req, res)) return;
    if (req.url === '/api/health') {
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify({ready: true}));
      return;
    }
    if (req.url === '/api/invent' && req.method === 'POST') {
      if (!hosting.isAllowedOrigin(req.headers.origin)) {
        res.writeHead(403);
        res.end('Origin not allowed');
        return;
      }
      apiCalls++;
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify({generated: true}));
      return;
    }
    hosting.middlewares(req, res);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as import('node:net').AddressInfo).port;

  await t.test('binds publicly by default and leaves optional artifacts disabled', () => {
    assert.equal(hosting.host, '0.0.0.0');
    assert.equal(hosting.saveArtifacts, false);
  });

  await t.test('health remains available without credentials', async () => {
    const response = await request(port, '/api/health');
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), {ready: true});
  });

  await t.test('rejects missing or incorrect credentials before entering the API', async () => {
    for (const credentials of [undefined, 'Basic invalid', `Basic ${Buffer.from('wrong:invite-only-password').toString('base64')}`, `Basic ${Buffer.from('player:wrong').toString('base64')}`]) {
      const response = await request(port, '/api/invent', {method: 'POST', headers: credentials ? {authorization: credentials, origin} : {origin}});
      assert.equal(response.status, 401);
      assert.match(String(response.headers['www-authenticate']), /^Basic /);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    assert.equal(apiCalls, 0);
    assert.equal((await request(port, '/')).status, 401);
    assert.equal((await request(port, '/assets/game.js')).status, 401);
  });

  await t.test('accepts the configured origin and rejects lookalikes and scheme changes', async () => {
    const accepted = await request(port, '/api/invent', {method: 'POST', headers: {authorization, origin}});
    assert.equal(accepted.status, 200);
    assert.equal(apiCalls, 1);
    for (const rejected of ['https://bad-idea.example.evil.example', 'http://bad-idea.example', 'https://evil.example', 'null', 'http://localhost:0']) {
      const response = await request(port, '/api/invent', {method: 'POST', headers: {authorization, origin: rejected}});
      assert.equal(response.status, 403, rejected);
    }
    assert.equal(apiCalls, 1);
  });

  await t.test('serves the built HTML and JavaScript, including HEAD', async () => {
    const page = await request(port, '/', {headers: {authorization}});
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type']!, /^text\/html/);
    assert.match(page.body, /Game fixture/);
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    const asset = await request(port, '/assets/game.js', {headers: {authorization}});
    assert.equal(asset.status, 200);
    assert.match(asset.headers['content-type']!, /javascript/);
    assert.equal(asset.body, 'globalThis.gameFixture = true;');
    const head = await request(port, '/assets/game.js', {method: 'HEAD', headers: {authorization}});
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
  });

  await t.test('does not expose source, runtime artifacts, dotfiles, or sibling traversal', async () => {
    for (const pathname of ['/src/main.ts', '/runtime/invention.json', '/.env', '/server.mjs', '/../server.mjs', '/%2e%2e/server.mjs', '/%2e%2e%2fserver.mjs', '/assets/../../server.mjs']) {
      const response = await request(port, pathname, {headers: {authorization}});
      assert.equal(response.status, 404, pathname);
      assert.equal(response.body, 'Not found', pathname);
    }
  });

  await t.test('unknown pages and API paths return 404 instead of the SPA shell', async () => {
    for (const pathname of ['/unknown-page', '/api/unknown', '/assets/missing.js']) {
      const response = await request(port, pathname, {headers: {authorization}});
      assert.equal(response.status, 404, pathname);
      assert.equal(response.body, 'Not found', pathname);
      assert.doesNotMatch(response.body, /Game fixture/);
    }
  });
});

test('production configuration requires an origin and an explicit access policy', async t => {
  const server = http.createServer();
  await assert.rejects(createHosting(server, {port: 0, env: {NODE_ENV: 'production', GAME_PASSWORD: 'password'}}), /Set APP_ORIGIN/);
  await assert.rejects(createHosting(server, {port: 0, env: {NODE_ENV: 'production', APP_ORIGIN: origin}}), /Set GAME_PASSWORD/);
  await assert.rejects(createHosting(server, {port: 0, env: {NODE_ENV: 'production', APP_ORIGIN: origin, ALLOW_PUBLIC_ACCESS: 'false'}}), /Set GAME_PASSWORD/);
  for (const APP_ORIGIN of [`${origin}/some/path`, `${origin}?query=1`, `https://user:password@bad-idea.example`, 'file:///tmp/game']) {
    await assert.rejects(createHosting(server, {port: 0, env: {...productionEnv, APP_ORIGIN}}), /APP_ORIGIN/);
  }
  const files = await fixture();
  t.after(() => fs.rm(files.root, {recursive: true, force: true}));
  const hosting = await createHosting(server, {
    port: 0,
    env: {NODE_ENV: 'production', APP_ORIGIN: `${origin}, https://preview.example`, ALLOW_PUBLIC_ACCESS: 'true'},
    distDirectory: files.dist,
  });
  assert.equal(hosting.isAllowedOrigin(origin), true);
  assert.equal(hosting.isAllowedOrigin('https://preview.example'), true);
  const headers = new Map();
  assert.equal(hosting.authorize({url: '/', headers: {}}, {setHeader: (name: string, value: string) => headers.set(name, value)}), true);
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
});

async function streamServer(t: TestContext, handler: http.RequestListener) {
  const server = http.createServer(handler);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
}

test('generation streams flush immediately and keep pending requests active until cleanup', {timeout: 3000}, async t => {
  let outgoing!: http.ServerResponse;
  let stop!: () => void;
  let writes = 0;
  const url = await streamServer(t, (_req, res) => {
    outgoing = res;
    const write = res.write.bind(res);
    res.write = ((...args: Parameters<typeof res.write>) => {
      writes++;
      return write(...args);
    }) as typeof res.write;
    stop = beginGenerationStream(res, 20);
  });
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/x-ndjson; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store, no-transform');
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  assert.equal(outgoing.writableEnded, false, 'headers arrive before generation finishes');
  const reader = response.body!.getReader();
  t.after(() => reader.cancel().catch(() => {}));
  const initial = await reader.read();
  assert.equal(initial.done, false);
  assert.match(new TextDecoder().decode(initial.value), /^\n+$/, 'the initial payload is blank NDJSON, not a generated result');
  const heartbeat = await reader.read();
  assert.equal(heartbeat.done, false);
  assert.match(new TextDecoder().decode(heartbeat.value), /^\n+$/, 'another blank line arrives while generation is still pending');
  assert.ok(writes >= 2);
  stop();
  const writesAfterCleanup = writes;
  await delay(80);
  assert.equal(writes, writesAfterCleanup, 'cleanup stops heartbeats even while the response remains open');
  assert.equal(outgoing.writableEnded, false);
  outgoing.end(JSON.stringify({type: 'complete', result: {finished: true}}) + '\n');
  let final = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    final += new TextDecoder().decode(chunk.value);
  }
  assert.deepEqual(JSON.parse(final.trim()), {type: 'complete', result: {finished: true}});
});

test('disconnecting a real HTTP client clears its generation heartbeat timer', {timeout: 3000}, async t => {
  const intervals = t.mock.method(globalThis, 'setInterval');
  const clears = t.mock.method(globalThis, 'clearInterval');
  let closed!: Promise<void>;
  const url = await streamServer(t, (_req, res) => {
    closed = new Promise(resolve => res.once('close', resolve));
    beginGenerationStream(res, 20);
  });
  const response = await fetch(url);
  const heartbeat = intervals.mock.calls.find(call => call.arguments[1] === 20)?.result;
  assert.ok(heartbeat, 'a pending generation owns a heartbeat timer');
  await response.body!.cancel();
  await closed;
  assert.ok(clears.mock.calls.some(call => call.arguments[0] === heartbeat), 'disconnect clears the timer rather than leaving it running');
});

test('the build reader consumes complete and error frames after real HTTP heartbeats', {timeout: 3000}, async t => {
  const result = {arena: {title: 'A new room'}, verdicts: [{key: 'ladder', allowed: true}]};
  const url = await streamServer(t, (req, res) => {
    const stop = beginGenerationStream(res, 20);
    const finish = setTimeout(() => {
      stop();
      const frame = req.url === '/error'
        ? {type: 'error', error: 'Generation quota exhausted'}
        : {type: 'complete', result};
      res.end(JSON.stringify(frame) + '\n');
    }, 65);
    res.once('close', () => clearTimeout(finish));
  });
  const unexpectedOutline = () => assert.fail('heartbeat lines must never become outline events');
  const complete = await fetch(url + '/complete');
  assert.deepEqual(await readBuildResponse(complete, unexpectedOutline), result);
  assert.equal(complete.body!.locked, false);
  const error = await fetch(url + '/error');
  await assert.rejects(readBuildResponse(error, unexpectedOutline), /Generation quota exhausted/);
  assert.equal(error.body!.locked, false);
});
