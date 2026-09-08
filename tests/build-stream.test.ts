import test from 'node:test';
import assert from 'node:assert/strict';
import {createOutlineReader, readBuildResponse, readOpenAIResponse, type InventionOutline} from '../src/build-stream.ts';
import {inventionSchema} from '../src/spec.ts';

const part = (x = 0) => ({shape:'box' as const, position:[x,0,0], rotation:[0,0,0], scale:[1,1,1], color:'#37aB91', animation:'none' as const, solid:false});
const outline = {name:'Café rocket 🚀', mount:'free' as const, spawn:[-4,1,2], parts:[part()]};
const encoder = new TextEncoder();

function byteResponse(text:string, contentType:string, chunkSize = 1) {
  const bytes = encoder.encode(text);
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for(let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i,i + chunkSize));
      controller.close();
    },
  }), {headers:{'content-type':contentType}});
}

function collectOutline() {
  const snapshots:InventionOutline[] = [];
  return {snapshots, push:createOutlineReader(value => snapshots.push(structuredClone(value)))};
}

test('outline reader ignores fake keys and brackets inside escaped JSON strings', () => {
  const {snapshots,push} = collectOutline();
  const json = JSON.stringify({
    description:'A \\"quoted\\" idea: "parts":[{"shape":"sphere"}], "mount":"player", "spawn":[9,9,9] } ]',
    name:outline.name,
    mount:outline.mount,
    spawn:outline.spawn,
    parts:[part(), part(2)],
    code:'const misleading = {parts: [{shape: "cone"}]}; /* \\ " [ ] } */',
  });
  for(const character of json) push(character);
  assert.deepEqual(snapshots.at(-1), {...outline,parts:[part(),part(2)]});
  assert.ok(snapshots.every(value => value.mount === 'free' && value.spawn?.[0] === -4));
  assert.equal(new Set(snapshots.map(value => JSON.stringify(value))).size,snapshots.length,'unchanged snapshots must not be emitted again');
});

test('outline reader emits each completed part before the invention JSON finishes', () => {
  const {snapshots,push} = collectOutline();
  const first = JSON.stringify(part());
  push('{"name":"Early rocket","mount":"player","spawn":[0,1,0],"parts":[');
  push(first.slice(0,-1));
  assert.equal(snapshots.length,0,'a part whose object is unfinished must not reach the renderer');
  push('}');
  assert.deepEqual(snapshots.at(-1),{name:'Early rocket',mount:'player',spawn:[0,1,0],parts:[part()]});
  const count = snapshots.length;
  push(',');
  push(JSON.stringify(part(2)).slice(0,-1));
  assert.equal(snapshots.length,count);
  push('}');
  assert.deepEqual(snapshots.at(-1)?.parts,[part(),part(2)]);
  const completeCount = snapshots.length;
  push('],"code":"the program is still being generated');
  push('"}');
  push('');
  assert.equal(snapshots.length,completeCount);
});

test('outline reader validates parts before emitting and applies schema defaults', () => {
  const {snapshots,push} = collectOutline();
  const {animation:_,solid:__,...withDefaults} = part();
  push(JSON.stringify({mount:'free',spawn:[0,0,0],parts:[
    withDefaults,
    {...part(),shape:'spaceship'},
    {...part(),scale:[0,1,1]},
    {...part(),color:'red'},
    {...part(),position:[1,2]},
  ]}));
  assert.ok(snapshots.length > 0);
  assert.deepEqual(snapshots.at(-1)?.parts,[part()]);
  const partSchema = inventionSchema.shape.parts.element;
  for(const snapshot of snapshots) for(const value of snapshot.parts) assert.ok(partSchema.safeParse(value).success);
});

test('outline reader never emits more than the 24 supported parts', () => {
  const {snapshots,push} = collectOutline();
  const parts = Array.from({length:26},(_,index) => part(index / 2));
  const json = JSON.stringify({name:'Too many boxes',mount:'free',spawn:[0,0,0],parts});
  for(let i = 0; i < json.length; i += 13) push(json.slice(i,i + 13));
  assert.ok(snapshots.length > 0);
  assert.ok(snapshots.every(value => value.parts.length <= 24));
  assert.deepEqual(snapshots.at(-1)?.parts,parts.slice(0,24));
});

const ndjson = (event:unknown) => JSON.stringify(event) + '\n';

test('build response streams outlines and decodes a final result split across UTF-8 bytes', async () => {
  const result = {invention:{...outline,code:'return "déjà 🚀";'},requestId:'test-build'};
  const received:InventionOutline[] = [];
  const response = byteResponse(
    ndjson({type:'outline',outline}) + '\n' + JSON.stringify({type:'complete',result}),
    'application/x-ndjson; charset=utf-8',
  );
  assert.deepEqual(await readBuildResponse(response,value => received.push(value)),result);
  assert.deepEqual(received,[outline]);
  assert.equal(response.body?.locked,false);
});

test('build response preserves the legacy JSON response format', async () => {
  const result = {invention:{...outline,code:'legacy generated program'},mode:'code'};
  let emitted = false;
  assert.deepEqual(await readBuildResponse(byteResponse(JSON.stringify(result),'application/json'),() => {emitted = true;}),result);
  assert.equal(emitted,false);
});

test('build response surfaces errors and refuses truncated NDJSON', async () => {
  const errors = [
    {body:ndjson({type:'error',error:'Could not construct the invention'}),pattern:/Could not construct the invention/},
    {body:ndjson({type:'outline',outline}),pattern:/end|complet|finish|interrupt/i},
    {body:ndjson({type:'outline',outline}) + '{"type":"complete","result":',pattern:/JSON|end|complet|finish|interrupt|invalid/i},
  ];
  for(const {body,pattern} of errors) {
    const response = byteResponse(body,'application/x-ndjson');
    await assert.rejects(readBuildResponse(response,() => {}),pattern);
    assert.equal(response.body?.locked,false);
  }
});

test('build response cancels unread data after completion and delivers no later outlines', async () => {
  let cancelled = false;
  let emitted = false;
  const result = {invention:outline};
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(ndjson({type:'complete',result})));
      controller.enqueue(encoder.encode(ndjson({type:'outline',outline})));
    },
    cancel() {cancelled = true;},
  }),{headers:{'content-type':'application/x-ndjson'}});
  assert.deepEqual(await readBuildResponse(response,() => {emitted = true;}),result);
  assert.equal(cancelled,true);
  assert.equal(emitted,false);
  assert.equal(response.body?.locked,false);
});

test('build response cancels its reader if outline rendering throws', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {controller.enqueue(encoder.encode(ndjson({type:'outline',outline})));},
    cancel() {cancelled = true;},
  }),{headers:{'content-type':'application/x-ndjson'}});
  const renderError = new Error('outline renderer failed');
  await assert.rejects(readBuildResponse(response,() => {throw renderError;}),error => error === renderError);
  assert.equal(cancelled,true);
  assert.equal(response.body?.locked,false);
});

test('build response propagates body cancellation after delivering the current outline', async () => {
  let controller!:ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(new ReadableStream<Uint8Array>({start(value) {controller = value;}}),{headers:{'content-type':'application/x-ndjson'}});
  const received:InventionOutline[] = [];
  const abortError = new DOMException('Generation cancelled','AbortError');
  const pending = readBuildResponse(response,value => {
    received.push(value);
    controller.error(abortError);
  });
  controller.enqueue(encoder.encode(ndjson({type:'outline',outline})));
  await assert.rejects(pending,error => error === abortError);
  assert.deepEqual(received,[outline]);
  assert.equal(response.body?.locked,false);
});

const sse = (event:unknown) => `data: ${JSON.stringify(event)}\r\n\r\n`;
const delta = (value:string) => ({type:'response.output_text.delta',delta:value});
const completed = (text:string) => ({type:'response.completed',response:{status:'completed',service_tier:'priority',output:[{type:'message',content:[{type:'output_text',text}]}]}});

test('OpenAI SSE reader preserves UTF-8 over byte boundaries and parses accumulated deltas', async () => {
  const expected = {name:'Café rocket 🚀',parts:[part()]};
  const json = JSON.stringify(expected);
  const chunks = [json.slice(0,12),json.slice(12,24),json.slice(24)];
  const received:string[] = [];
  const response = byteResponse(': keep-alive\r\n\r\n' + chunks.map(text => sse(delta(text))).join('') + sse(completed(json)) + 'data: [DONE]\r\n\r\n','text/event-stream');
  const result = await readOpenAIResponse(response,text => received.push(text));
  assert.deepEqual(received,chunks);
  assert.deepEqual(result,{output:expected,serviceTier:'priority'});
});

test('OpenAI SSE reader surfaces response errors and refuses incomplete generations', async () => {
  for(const event of [
    {type:'error',message:'provider quota exhausted'},
    {type:'response.failed',response:{status:'failed',error:{message:'provider quota exhausted'}}},
  ]) {
    await assert.rejects(readOpenAIResponse(byteResponse(sse(event),'text/event-stream'),() => {}),/provider quota exhausted/);
  }
  const incomplete = {type:'response.incomplete',response:{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}};
  await assert.rejects(readOpenAIResponse(byteResponse(sse(delta('{"name":"cut off')) + sse(incomplete),'text/event-stream'),() => {}),/incomplete|max_output_tokens|finish/i);
});

test('OpenAI SSE reader rejects EOF without a completed response and malformed completed JSON', async () => {
  await assert.rejects(readOpenAIResponse(byteResponse(sse(delta('{"name":"never completed"}')),'text/event-stream'),() => {}),/end|complet|finish|interrupt/i);
  const invalid = '{"name":';
  await assert.rejects(readOpenAIResponse(byteResponse(sse(delta(invalid)) + sse(completed(invalid)),'text/event-stream'),() => {}));
});

test('OpenAI SSE reader cancels a pending body read when its signal aborts', {timeout:2000}, async () => {
  const abort = new AbortController();
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({cancel() {cancelled = true;}}),{headers:{'content-type':'text/event-stream'}});
  const result = readOpenAIResponse(response,() => {},abort.signal);
  const rejection = assert.rejects(result,error => (error as Error).name === 'AbortError');
  abort.abort();
  await rejection;
  assert.equal(cancelled,true);
});

test('OpenAI SSE reader rejects an already aborted request without delivering deltas', async () => {
  const abort = new AbortController();
  abort.abort();
  let delivered = false;
  await assert.rejects(readOpenAIResponse(byteResponse(sse(delta('{}')) + sse(completed('{}')),'text/event-stream'),() => {delivered = true;},abort.signal),error => (error as Error).name === 'AbortError');
  assert.equal(delivered,false);
});
