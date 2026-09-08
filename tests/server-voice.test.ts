import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createVoiceTranscriber} from '../server-voice.mjs';

const origin = 'https://bad-idea.example';
const audio = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 255, 17, 129]);
const success = () => Response.json({text: 'A ladder made of balloons.'});
type FetchCall = {url: string; init: RequestInit};
type Options = {
  env?: {OPENAI_API_KEY?: string; ESCAPE_TRANSCRIBE_MODEL?: string};
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  maxAudioBytes?: number;
  maxConcurrent?: number;
  timeoutMs?: number;
};

async function fixture(t: TestContext, options: Options = {}) {
  const calls: FetchCall[] = [];
  const transcribe = createVoiceTranscriber({
    env: {OPENAI_API_KEY: 'test-key-never-sent-over-the-network'},
    isAllowedOrigin: (value: string | undefined) => value === origin,
    ...options,
    fetchImpl: async (url: string, init: RequestInit) => {
      calls.push({url, init});
      return options.fetchImpl ? options.fetchImpl(url, init) : success();
    },
  });
  const server = http.createServer((req, res) => { void transcribe(req, res); });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api/transcribe`;
  const post = (headers: Record<string, string> = {}, body: BodyInit = audio) => fetch(url, {
    method: 'POST', headers: {origin, 'content-type': 'audio/webm;codecs=opus', ...headers}, body,
  });
  return {url, post, calls, server};
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return {promise, resolve, reject};
}

function rawRequest(url: string, headers: http.OutgoingHttpHeaders = {}) {
  const result = deferred<{status: number; body: {error?: string; text?: string}}>();
  const req = http.request(url, {method: 'POST', headers: {origin, 'content-type': 'audio/webm', ...headers}}, res => {
    const chunks: Buffer[] = [];
    res.on('data', chunk => chunks.push(chunk));
    res.once('end', () => result.resolve({status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString())}));
    res.once('error', result.reject);
  });
  req.on('error', result.reject);
  return {req, result: result.promise};
}

test('voice input forwards binary audio with model and format, returning only normalized text', async t => {
  const app = await fixture(t, {fetchImpl: async () => Response.json({text: '  A ladder\n made\t of balloons.  ', usage: {total_tokens: 9}})});
  const response = await app.post();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-type')!, /^application\/json/);
  assert.deepEqual(await response.json(), {text: 'A ladder made of balloons.'});
  assert.equal(app.calls.length, 1);
  const {url, init} = app.calls[0];
  assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, {authorization: 'Bearer test-key-never-sent-over-the-network'});
  assert.ok(init.signal instanceof AbortSignal);
  const form = init.body as FormData;
  assert.equal(form.get('model'), 'gpt-4o-mini-transcribe');
  assert.equal(form.get('response_format'), 'json');
  const file = form.get('file') as File;
  assert.equal(file.name, 'invention.webm');
  assert.equal(file.type, 'audio/webm');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), audio);
});

test('voice input accepts browser audio containers and respects the server model override', async t => {
  const app = await fixture(t, {env: {OPENAI_API_KEY: 'test-key', ESCAPE_TRANSCRIBE_MODEL: 'test-transcribe-model'}});
  for (const [mime, extension] of [['audio/mp4;codecs=mp4a.40.2', 'mp4'], ['audio/ogg;codecs=opus', 'ogg'], ['audio/x-wav', 'wav'], ['Audio/WAV', 'wav'], ['audio/mpeg', 'mp3'], ['audio/x-m4a', 'm4a'], ['audio/flac', 'flac']]) {
    const response = await app.post({'content-type': mime});
    assert.equal(response.status, 200, mime);
    await response.json();
    const form = app.calls.at(-1)!.init.body as FormData;
    assert.equal((form.get('file') as File).name, `invention.${extension}`);
    assert.equal(form.get('model'), 'test-transcribe-model');
  }
});

test('voice input rejects disallowed origins, methods, unsupported media and missing connection before upstream work', async t => {
  const app = await fixture(t);
  for (const value of ['https://evil.example', `${origin}.evil.example`, 'null', '']) {
    const response = await app.post({origin: value});
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {error: 'Origin not allowed'});
  }
  const get = await fetch(app.url);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  await get.json();
  for (const headers of [{'content-type': 'application/json'}, {'content-type': ''}, {'content-encoding': 'gzip'}]) {
    const response = await app.post(headers);
    assert.equal(response.status, 415);
    assert.match((await response.json()).error, /format is not supported/);
  }
  assert.equal(app.calls.length, 0);
  const disconnected = await fixture(t, {env: {}});
  const response = await disconnected.post();
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /still type/);
  assert.equal(disconnected.calls.length, 0);
});

test('voice uploads enforce advertised and streamed byte limits and recover capacity after rejection', async t => {
  const app = await fixture(t, {maxConcurrent: 1});
  const declared = rawRequest(app.url, {'content-length': 8 * 1024 * 1024 + 1});
  declared.req.flushHeaders();
  assert.equal((await declared.result).status, 413);
  declared.req.destroy();
  assert.equal(app.calls.length, 0);

  const bounded = await fixture(t, {maxAudioBytes: 1024, maxConcurrent: 1});
  const chunked = rawRequest(bounded.url);
  chunked.req.write(Buffer.alloc(600));
  chunked.req.write(Buffer.alloc(600));
  assert.equal((await chunked.result).status, 413);
  chunked.req.destroy();
  assert.equal(bounded.calls.length, 0, 'a chunked upload cannot bypass the size cap');
  const empty = await bounded.post({}, Buffer.alloc(0));
  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error, /No audio/);
  const exact = await bounded.post({}, Buffer.alloc(1024));
  assert.equal(exact.status, 200, 'rejected uploads release their concurrency slot');
  await exact.json();
  assert.equal(bounded.calls.length, 1);
});

test('voice input reports upstream failures and unusable transcripts without leaking server details', async t => {
  const responses = [
    {response: () => Response.json({error: {message: 'SECRET upstream credentials and account details'}}, {status: 401}), status: 503, message: /not connected/},
    {response: () => Response.json({error: {message: 'SECRET quota'}}, {status: 429}), status: 429, message: /busy/},
    {response: () => new Response('SECRET decoding detail', {status: 400}), status: 422, message: /could not be understood/},
    {response: () => new Response('SECRET internal error', {status: 500}), status: 502, message: /Could not transcribe/},
    {response: () => new Response('invalid json'), status: 502, message: /Could not transcribe/},
    {response: () => Response.json({text: 5}), status: 502, message: /Could not transcribe/},
    {response: () => Response.json({text: '\n\t '}), status: 422, message: /No speech was heard/},
  ];
  const app = await fixture(t, {maxConcurrent: 1, fetchImpl: async () => responses[app.calls.length - 1].response()});
  for (const expected of responses) {
    const response = await app.post();
    assert.equal(response.status, expected.status);
    const body = await response.text();
    assert.match(JSON.parse(body).error, expected.message);
    assert.doesNotMatch(body, /SECRET|test-key/);
  }
  const failed = await fixture(t, {fetchImpl: async () => { throw Error('SECRET network exception'); }});
  const failure = await failed.post();
  assert.equal(failure.status, 502);
  assert.doesNotMatch(await failure.text(), /SECRET/);
});

test('voice concurrency includes pending upstream requests and releases slots on completion', {timeout: 3000}, async t => {
  const entered = deferred<void>(), upstream = deferred<Response>();
  const app = await fixture(t, {maxConcurrent: 1, fetchImpl: async () => {
    if (app.calls.length === 1) { entered.resolve(); return upstream.promise; }
    return success();
  }});
  const first = app.post();
  await entered.promise;
  const busy = await app.post();
  assert.equal(busy.status, 429);
  await busy.json();
  assert.equal(app.calls.length, 1);
  upstream.resolve(success());
  assert.equal((await first).status, 200);
  await (await first).json();
  const next = await app.post();
  assert.equal(next.status, 200);
  await next.json();
});

test('voice upload timeouts cover slow bodies, release capacity, and never start transcription', {timeout: 3000}, async t => {
  const app = await fixture(t, {maxConcurrent: 1, timeoutMs: 150});
  const incoming = once(app.server, 'request');
  const slow = rawRequest(app.url);
  slow.req.write(audio);
  await incoming;
  const busy = await app.post();
  assert.equal(busy.status, 429, 'the in-progress body reserves capacity');
  await busy.json();
  const result = await slow.result;
  assert.equal(result.status, 504);
  assert.match(result.body.error!, /timed out/);
  slow.req.destroy();
  assert.equal(app.calls.length, 0);
  const next = await app.post();
  assert.equal(next.status, 200);
  await next.json();
});

test('voice upstream timeouts abort the request and release capacity for the next recording', {timeout: 3000}, async t => {
  let aborted = false;
  const app = await fixture(t, {maxConcurrent: 1, timeoutMs: 50, fetchImpl: async (_url, init) => {
    if (app.calls.length > 1) return success();
    return new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => { aborted = true; reject(init.signal!.reason); }, {once: true});
    });
  }});
  const response = await app.post();
  assert.equal(response.status, 504);
  assert.match((await response.json()).error, /timed out/);
  assert.equal(aborted, true);
  const next = await app.post();
  assert.equal(next.status, 200);
  await next.json();
});

test('cancelling voice input aborts upstream transcription and releases its slot', {timeout: 3000}, async t => {
  const entered = deferred<void>(), aborted = deferred<void>();
  const app = await fixture(t, {maxConcurrent: 1, fetchImpl: async (_url, init) => {
    if (app.calls.length > 1) return success();
    return new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => { aborted.resolve(); reject(init.signal!.reason); }, {once: true});
      entered.resolve();
    });
  }});
  const cancel = new AbortController();
  const pending = fetch(app.url, {method: 'POST', headers: {origin, 'content-type': 'audio/webm'}, body: audio, signal: cancel.signal});
  const rejected = assert.rejects(pending, {name: 'AbortError'});
  await entered.promise;
  cancel.abort();
  await Promise.all([rejected, aborted.promise]);
  const next = await app.post();
  assert.equal(next.status, 200);
  await next.json();
});

test('abandoning a partial voice upload frees capacity without calling the transcription API', {timeout: 3000}, async t => {
  const app = await fixture(t, {maxConcurrent: 1});
  const incoming = once(app.server, 'request');
  const partial = rawRequest(app.url);
  const rejected = assert.rejects(partial.result);
  partial.req.write(audio);
  const [serverRequest] = await incoming as [http.IncomingMessage];
  const closed = once(serverRequest, 'close').catch(() => {});
  partial.req.destroy(new Error('User cancelled'));
  await Promise.all([rejected, closed]);
  assert.equal(app.calls.length, 0);
  const next = await app.post();
  assert.equal(next.status, 200);
  await next.json();
});
