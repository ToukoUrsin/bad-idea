import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceCapture, type VoiceCaptureDependencies, type VoiceCaptureState} from '../src/voice-capture.ts';

function deferred<T>() {
  let resolve!:(value:T) => void;
  let reject!:(error:unknown) => void;
  const promise = new Promise<T>((yes,no) => {resolve = yes;reject = no;});
  return {promise,resolve,reject};
}

class FakeTrack extends EventTarget {
  readyState = 'live';
  stopCalls = 0;
  stop() {this.stopCalls++;this.readyState = 'ended';}
  disconnect() {this.readyState = 'ended';this.dispatchEvent(new Event('ended'));}
}

function microphone() {
  const track = new FakeTrack();
  const stream = {getTracks:() => [track],getAudioTracks:() => [track]} as unknown as MediaStream;
  return {track,stream};
}

function harness(options:{
  permission?:VoiceCaptureDependencies['getUserMedia'];
  fetch?:typeof fetch;
  supportedTypes?:string[];
  brokenTypes?:string[];
  actualMime?:string;
} = {}) {
  const mic = microphone();
  const states:VoiceCaptureState[] = [];
  const texts:string[] = [];
  const errors:string[] = [];
  const constraints:MediaStreamConstraints[] = [];
  const constructorTypes:string[] = [];
  const requests:Array<{url:unknown,init:RequestInit}> = [];
  const timers = new Map<number,{fn:() => void,ms:number}>();
  let nextTimer = 1;
  class Recorder {
    static instances:Recorder[] = [];
    static isTypeSupported(type:string) {return (options.supportedTypes ?? ['audio/webm;codecs=opus']).includes(type);}
    state = 'inactive';
    mimeType:string;
    stopCalls = 0;
    ondataavailable:((event:{data:Blob}) => void) | null = null;
    onstop:(() => void) | null = null;
    onerror:(() => void) | null = null;
    constructor(_stream:MediaStream,config:MediaRecorderOptions) {
      constructorTypes.push(config.mimeType!);
      if(options.brokenTypes?.includes(config.mimeType!)) throw new Error('Platform recorder exception');
      this.mimeType = options.actualMime ?? config.mimeType!;
      Recorder.instances.push(this);
    }
    start(_timeslice:number) {this.state = 'recording';}
    stop() {this.stopCalls++;this.state = 'inactive';}
    chunk(data:Blob) {this.ondataavailable?.({data});}
    finish(data?:Blob) {if(data) this.chunk(data);this.onstop?.();}
  }
  const deps:Partial<VoiceCaptureDependencies> = {
    getUserMedia:async constraint => {
      constraints.push(constraint);
      return options.permission ? options.permission(constraint) : mic.stream;
    },
    MediaRecorder:Recorder as unknown as typeof MediaRecorder,
    fetch:async (url,init) => {
      requests.push({url,init:init!});
      return options.fetch ? options.fetch(url,init) : Response.json({text:' A rocket chair. '});
    },
    setTimeout:((fn:() => void,ms:number) => {
      const id = nextTimer++;
      timers.set(id,{fn,ms});
      return id;
    }) as typeof globalThis.setTimeout,
    clearTimeout:((id:number) => {timers.delete(id);}) as typeof globalThis.clearTimeout,
  };
  const capture = new VoiceCapture({onState:state => states.push(state),onText:text => texts.push(text),onError:message => errors.push(message)},deps);
  const fireTimer = (ms:number) => {
    const entry = [...timers].find(([,timer]) => timer.ms === ms);
    assert.ok(entry,`Expected a ${ms}ms timer`);
    timers.delete(entry[0]);
    entry[1].fn();
  };
  return {capture,mic,states,texts,errors,constraints,constructorTypes,requests,timers,fireTimer,recorders:Recorder.instances};
}

const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test('records only on request, releases the mic on stop, and uploads the final audio chunk', async () => {
  const h = harness({actualMime:'audio/webm'});
  assert.equal(h.capture.supported,true);
  assert.equal(h.capture.state,'idle');
  assert.equal(h.constraints.length,0);
  await h.capture.start();
  assert.deepEqual(h.constraints,[{audio:{echoCancellation:true,noiseSuppression:true}}]);
  assert.equal(h.capture.state,'recording');
  const recorder = h.recorders[0];
  recorder.chunk(new Blob(['first-']));
  h.capture.stop();
  assert.equal(h.capture.state,'transcribing');
  assert.equal(h.mic.track.stopCalls,1,'stop must release the microphone synchronously');
  assert.equal(h.requests.length,0,'wait for final dataavailable and onstop before uploading');
  recorder.finish(new Blob(['last'],{type:'audio/webm'}));
  assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].url,'/api/transcribe');
  assert.equal(h.requests[0].init.method,'POST');
  assert.deepEqual(h.requests[0].init.headers,{'Content-Type':'audio/webm'});
  assert.equal(await (h.requests[0].init.body as Blob).text(),'first-last');
  await settle();
  assert.deepEqual(h.texts,['A rocket chair.']);
  assert.deepEqual(h.states,['requesting','recording','transcribing','idle']);
  assert.deepEqual(h.errors,[]);
  assert.equal(h.timers.size,0);
  assert.equal(h.mic.track.stopCalls,1);
  assert.equal(recorder.onstop,null);
  assert.equal(recorder.ondataavailable,null);
});

test('cancel during permission request releases a late stream and cannot disturb a newer session', async () => {
  const firstPermission = deferred<MediaStream>();
  const firstMic = microphone();
  const secondMic = microphone();
  let call = 0;
  const h = harness({permission:() => ++call === 1 ? firstPermission.promise : Promise.resolve(secondMic.stream)});
  const firstStart = h.capture.start();
  assert.equal(h.capture.state,'requesting');
  h.capture.cancel();
  assert.equal(h.capture.state,'idle');
  await h.capture.start();
  assert.equal(h.capture.state,'recording');
  firstPermission.resolve(firstMic.stream);
  await firstStart;
  assert.equal(firstMic.track.stopCalls,1);
  assert.equal(secondMic.track.stopCalls,0);
  assert.equal(h.recorders.length,1);
  assert.equal(h.capture.state,'recording');
  assert.deepEqual(h.texts,[]);
  assert.deepEqual(h.errors,[]);
  h.capture.cancel();
  assert.equal(secondMic.track.stopCalls,1);
  assert.equal(h.timers.size,0);
});

test('cancel aborts an upload and ignores its late successful transcript', async () => {
  const upload = deferred<Response>();
  const h = harness({fetch:() => upload.promise});
  await h.capture.start();
  h.capture.stop();
  h.recorders[0].finish(new Blob(['audio']));
  const signal = h.requests[0].init.signal!;
  assert.equal(signal.aborted,false);
  h.capture.cancel();
  assert.equal(signal.aborted,true);
  assert.equal(h.capture.state,'idle');
  assert.equal(h.timers.size,0);
  upload.resolve(Response.json({text:'stale invention'}));
  await settle();
  assert.deepEqual(h.texts,[]);
  assert.deepEqual(h.errors,[]);
});

test('uses a supported MIME fallback and retries formats the browser advertises but cannot construct', async () => {
  const mp4 = harness({supportedTypes:['audio/mp4']});
  await mp4.capture.start();
  assert.deepEqual(mp4.constructorTypes,['audio/mp4']);
  mp4.capture.stop();
  mp4.recorders[0].finish(new Blob(['mp4 audio']));
  assert.equal((mp4.requests[0].init.body as Blob).type,'audio/mp4');
  await settle();
  const webm = harness({supportedTypes:['audio/webm;codecs=opus','audio/webm','audio/mp4'],brokenTypes:['audio/webm;codecs=opus']});
  await webm.capture.start();
  assert.deepEqual(webm.constructorTypes,['audio/webm;codecs=opus','audio/webm']);
  assert.equal(webm.capture.state,'recording');
  webm.capture.dispose();
});

test('unsupported or broken recorder formats fail gracefully without leaving a microphone open', async () => {
  const unsupported = harness({supportedTypes:[]});
  assert.equal(unsupported.capture.supported,false);
  await unsupported.capture.start();
  assert.equal(unsupported.constraints.length,0);
  assert.match(unsupported.errors[0],/unavailable.*browser/i);
  const broken = harness({brokenTypes:['audio/webm;codecs=opus']});
  await broken.capture.start();
  assert.equal(broken.capture.state,'idle');
  assert.equal(broken.mic.track.stopCalls,1);
  assert.match(broken.errors[0],/browser.*record/i);
  assert.equal(broken.timers.size,0);
});

test('does not upload an empty recording and treats an empty transcript as silence', async () => {
  const empty = harness();
  await empty.capture.start();
  empty.capture.stop();
  empty.recorders[0].finish(new Blob([]));
  assert.equal(empty.requests.length,0);
  assert.equal(empty.capture.state,'idle');
  assert.match(empty.errors[0],/didn't hear/i);
  assert.equal(empty.timers.size,0);
  const silence = harness({fetch:async () => Response.json({text:' \n '})});
  await silence.capture.start();
  silence.capture.stop();
  silence.recorders[0].finish(new Blob(['silence']));
  await settle();
  assert.deepEqual(silence.texts,[]);
  assert.match(silence.errors[0],/didn't hear/i);
  assert.equal(silence.capture.state,'idle');
});

test('recording automatically stops after 60 seconds and waits for its final chunk', async () => {
  const h = harness();
  await h.capture.start();
  h.fireTimer(60_000);
  assert.equal(h.capture.state,'transcribing');
  assert.equal(h.mic.track.stopCalls,1);
  assert.equal(h.recorders[0].stopCalls,1);
  assert.equal(h.requests.length,0);
  h.recorders[0].finish(new Blob(['audio']));
  await settle();
  assert.deepEqual(h.texts,['A rocket chair.']);
  assert.equal(h.timers.size,0);
});

test('an upload timeout returns to idle, aborts fetch, and ignores a late response', async () => {
  const upload = deferred<Response>();
  const h = harness({fetch:() => upload.promise});
  await h.capture.start();
  h.capture.stop();
  h.recorders[0].finish(new Blob(['audio']));
  h.fireTimer(45_000);
  assert.equal(h.capture.state,'idle');
  assert.equal(h.requests[0].init.signal!.aborted,true);
  assert.match(h.errors[0],/took too long/i);
  assert.equal(h.timers.size,0);
  upload.resolve(Response.json({text:'late invention'}));
  await settle();
  assert.deepEqual(h.texts,[]);
  assert.equal(h.errors.length,1);
});

test('recordings above 8MB are discarded and release the microphone', async () => {
  const h = harness();
  await h.capture.start();
  h.recorders[0].chunk(new Blob([new Uint8Array(8 * 1024 * 1024)]));
  assert.equal(h.capture.state,'recording');
  h.recorders[0].chunk(new Blob(['x']));
  assert.equal(h.capture.state,'idle');
  assert.equal(h.requests.length,0);
  assert.equal(h.mic.track.stopCalls,1);
  assert.equal(h.recorders[0].stopCalls,1);
  assert.equal(h.timers.size,0);
  assert.match(h.errors[0],/too large/i);
});

test('duplicate starts and stops cannot acquire or upload twice, and stale callbacks are ignored', async () => {
  const h = harness();
  const firstStart = h.capture.start();
  await h.capture.start();
  await firstStart;
  assert.equal(h.constraints.length,1);
  assert.equal(h.recorders.length,1);
  assert.match(h.errors[0],/current voice recording/i);
  const recorder = h.recorders[0];
  const oldData = recorder.ondataavailable!;
  const oldStop = recorder.onstop!;
  h.capture.stop();
  h.capture.stop();
  assert.equal(recorder.stopCalls,1);
  recorder.finish(new Blob(['audio']));
  oldStop();
  assert.equal(h.requests.length,1);
  await settle();
  oldData({data:new Blob(['late'])});
  oldStop();
  assert.equal(h.requests.length,1);
  assert.deepEqual(h.texts,['A rocket chair.']);
});

test('permission errors are friendly and a cancelled permission failure is silent', async () => {
  for(const [name,pattern] of [['NotAllowedError',/blocked.*allow/i],['NotFoundError',/no microphone/i],['NotReadableError',/busy or unavailable/i]] as const) {
    const h = harness({permission:async () => {throw new DOMException('Internal device detail',name);}});
    await h.capture.start();
    assert.equal(h.capture.state,'idle');
    assert.match(h.errors[0],pattern);
    assert.doesNotMatch(h.errors[0],/Internal device detail/);
  }
  const permission = deferred<MediaStream>();
  const h = harness({permission:() => permission.promise});
  const start = h.capture.start();
  h.capture.cancel();
  permission.reject(new DOMException('Permission denied','NotAllowedError'));
  await start;
  assert.deepEqual(h.errors,[]);
});

test('a disconnected device or recorder error cleans up and reports a recoverable failure', async () => {
  const disconnected = harness();
  await disconnected.capture.start();
  disconnected.mic.track.disconnect();
  assert.equal(disconnected.capture.state,'idle');
  assert.equal(disconnected.mic.track.stopCalls,1);
  assert.match(disconnected.errors[0],/disconnected/i);
  assert.equal(disconnected.timers.size,0);
  const failed = harness();
  await failed.capture.start();
  failed.recorders[0].onerror!();
  assert.equal(failed.capture.state,'idle');
  assert.equal(failed.mic.track.stopCalls,1);
  assert.match(failed.errors[0],/could not finish recording/i);
  assert.equal(failed.timers.size,0);
});

test('a missing recorder stop event times out without leaving the UI waiting', async () => {
  const h = harness();
  await h.capture.start();
  h.capture.stop();
  h.fireTimer(5_000);
  assert.equal(h.capture.state,'idle');
  assert.equal(h.requests.length,0);
  assert.match(h.errors[0],/could not finish recording/i);
  assert.equal(h.timers.size,0);
});

test('upstream and network failures return to idle with actionable messages', async () => {
  for(const [fetchResponse,pattern] of [
    [async () => Response.json({error:'Voice input is not configured on this server.'},{status:503}),/not configured/i],
    [async () => new Response('',{status:429}),/busy/i],
    [async () => Response.json({wrong:'shape'}),/unreadable response/i],
    [async () => {throw new TypeError('fetch failed');},/check your connection/i],
  ] as Array<[typeof fetch,RegExp]>) {
    const h = harness({fetch:fetchResponse});
    await h.capture.start();
    h.capture.stop();
    h.recorders[0].finish(new Blob(['audio']));
    await settle();
    assert.equal(h.capture.state,'idle');
    assert.match(h.errors[0],pattern);
    assert.deepEqual(h.texts,[]);
    assert.equal(h.timers.size,0);
  }
});

test('dispose invalidates pending permission and permanently prevents microphone acquisition', async () => {
  const permission = deferred<MediaStream>();
  const mic = microphone();
  const h = harness({permission:() => permission.promise});
  const start = h.capture.start();
  h.capture.dispose();
  permission.resolve(mic.stream);
  await start;
  await h.capture.start();
  assert.equal(h.capture.state,'idle');
  assert.equal(mic.track.stopCalls,1);
  assert.equal(h.constraints.length,1);
  assert.equal(h.recorders.length,0);
  assert.deepEqual(h.errors,[]);
});
