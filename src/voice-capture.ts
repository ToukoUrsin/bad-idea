export type VoiceCaptureState = 'idle' | 'requesting' | 'recording' | 'transcribing';

export interface VoiceCaptureCallbacks {
  onState: (state:VoiceCaptureState) => void;
  onText: (text:string) => void;
  onError: (message:string) => void;
}

export interface VoiceCaptureDependencies {
  getUserMedia: ((constraints:MediaStreamConstraints) => Promise<MediaStream>) | null;
  MediaRecorder: typeof MediaRecorder | null;
  fetch: typeof fetch;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
}

const MIME_TYPES = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];
const MAX_RECORDING_MS = 60_000;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 45_000;
const EMPTY_RECORDING = "I didn't hear anything. Try again and speak clearly into your microphone.";
type Timer = ReturnType<typeof globalThis.setTimeout>;

interface CaptureSession {
  stream:MediaStream | null;
  recorder:MediaRecorder | null;
  mimeType:string;
  chunks:Blob[];
  bytes:number;
  stopping:boolean;
  recordingTimer:Timer | null;
  finishingTimer:Timer | null;
  uploadTimer:Timer | null;
  abort:AbortController | null;
  trackListeners:Array<() => void>;
}

/** Records only after start(), and invalidates every async callback on cancel(). */
export class VoiceCapture {
  readonly supported:boolean;
  private currentState:VoiceCaptureState = 'idle';
  private session:CaptureSession | null = null;
  private disposed = false;
  private readonly deps:VoiceCaptureDependencies;
  private readonly mimeTypes:string[];

  constructor(private readonly callbacks:VoiceCaptureCallbacks, dependencies:Partial<VoiceCaptureDependencies> = {}) {
    const mediaDevices = globalThis.navigator?.mediaDevices;
    this.deps = {
      getUserMedia:mediaDevices?.getUserMedia.bind(mediaDevices) ?? null,
      MediaRecorder:globalThis.MediaRecorder ?? null,
      fetch:globalThis.fetch.bind(globalThis),
      setTimeout:globalThis.setTimeout.bind(globalThis),
      clearTimeout:globalThis.clearTimeout.bind(globalThis),
      ...dependencies,
    };
    this.mimeTypes = MIME_TYPES.filter(type => {
      try {return this.deps.MediaRecorder?.isTypeSupported(type) ?? false;}
      catch {return false;}
    });
    this.supported = Boolean(this.deps.getUserMedia && this.mimeTypes.length);
  }

  get state():VoiceCaptureState {return this.currentState;}

  async start():Promise<void> {
    if(this.disposed) return;
    if(this.session) {
      this.callbacks.onError('Finish or cancel the current voice recording first.');
      return;
    }
    if(!this.supported) {
      this.callbacks.onError('Voice input is unavailable in this browser. Try a browser with microphone recording on HTTPS or localhost.');
      return;
    }
    const session:CaptureSession = {
      stream:null,recorder:null,mimeType:'',chunks:[],bytes:0,stopping:false,
      recordingTimer:null,finishingTimer:null,uploadTimer:null,abort:null,trackListeners:[],
    };
    this.session = session;
    this.setState('requesting');
    if(!this.isCurrent(session)) return;
    try {
      const stream = await this.deps.getUserMedia!({audio:{echoCancellation:true,noiseSuppression:true}});
      // Permission can resolve after cancel or dispose, including after a new recording starts.
      if(!this.isCurrent(session)) {
        this.stopTracks(stream);
        return;
      }
      session.stream = stream;
      if(!stream.getAudioTracks().some(track => track.readyState === 'live')) {
        this.fail(session,'No working microphone was found. Connect a microphone and try again.');
        return;
      }
      for(const mimeType of this.mimeTypes) {
        try {
          session.recorder = new this.deps.MediaRecorder!(stream,{mimeType});
          session.mimeType = mimeType;
          break;
        } catch { /* Some browsers advertise a format they cannot record on this device. */ }
      }
      const recorder = session.recorder;
      if(!recorder) {
        this.fail(session,'This browser could not record microphone audio. Please try a different browser.');
        return;
      }
      for(const track of stream.getAudioTracks()) {
        const ended = () => {
          if(this.isCurrent(session) && !session.stopping) this.fail(session,'The microphone disconnected. Check your microphone and try again.');
        };
        track.addEventListener('ended',ended);
        session.trackListeners.push(() => track.removeEventListener('ended',ended));
      }
      recorder.ondataavailable = event => {
        if(!this.isCurrent(session) || !event.data.size) return;
        session.bytes += event.data.size;
        if(session.bytes > MAX_AUDIO_BYTES) {
          this.fail(session,'That recording is too large. Try a shorter description.');
          return;
        }
        session.chunks.push(event.data);
      };
      recorder.onerror = () => this.fail(session,'The microphone could not finish recording. Check your microphone and try again.');
      recorder.onstop = () => {
        if(!this.isCurrent(session)) return;
        if(!session.stopping) {
          this.fail(session,'The microphone stopped unexpectedly. Please try recording again.');
          return;
        }
        this.clearTimer(session,'finishingTimer');
        void this.transcribe(session);
      };
      recorder.start(250);
      if(!this.isCurrent(session)) return;
      this.setState('recording');
      if(this.isCurrent(session) && this.state === 'recording') session.recordingTimer = this.deps.setTimeout(() => {
        if(this.isCurrent(session)) this.stop();
      },MAX_RECORDING_MS);
    } catch(error) {
      this.fail(session,microphoneError(error));
    }
  }

  stop():void {
    const session = this.session;
    if(!session || this.state !== 'recording' || session.stopping) return;
    session.stopping = true;
    this.clearTimer(session,'recordingTimer');
    this.releaseMicrophone(session);
    this.setState('transcribing');
    if(!this.isCurrent(session)) return;
    // Keep the recorder's handlers until its final dataavailable and stop events arrive.
    session.finishingTimer = this.deps.setTimeout(() => this.fail(session,'The microphone could not finish recording. Please try again.'),5_000);
    try {
      if(session.recorder?.state !== 'inactive') session.recorder?.stop();
    } catch {
      this.fail(session,'The microphone could not finish recording. Please try again.');
    }
  }

  cancel():void {
    const session = this.session;
    this.session = null;
    if(session) this.cleanup(session);
    this.setState('idle');
  }

  dispose():void {
    this.disposed = true;
    this.cancel();
  }

  private async transcribe(session:CaptureSession):Promise<void> {
    if(!this.isCurrent(session) || session.abort) return;
    this.releaseMicrophone(session);
    const mimeType = session.recorder?.mimeType || session.chunks.find(chunk => chunk.type)?.type || session.mimeType;
    const audio = new Blob(session.chunks,{type:mimeType});
    session.chunks = [];
    if(!audio.size) {
      this.fail(session,EMPTY_RECORDING);
      return;
    }
    session.abort = new AbortController();
    session.uploadTimer = this.deps.setTimeout(() => {
      this.fail(session,'Voice transcription took too long. Please try again.');
    },UPLOAD_TIMEOUT_MS);
    try {
      const response = await this.deps.fetch('/api/transcribe',{
        method:'POST',headers:{'Content-Type':audio.type},body:audio,signal:session.abort.signal,
      });
      if(!this.isCurrent(session)) return;
      const payload:unknown = await response.json().catch(() => null);
      if(!this.isCurrent(session)) return;
      if(!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' && payload.error.length <= 300
          ? payload.error
          : response.status === 429 ? 'Voice transcription is busy. Please try again in a moment.'
          : response.status === 413 ? 'That recording is too large. Try a shorter description.'
          : 'Voice transcription is unavailable right now. Please try again.';
        this.fail(session,message);
        return;
      }
      if(!payload || typeof payload !== 'object' || !('text' in payload) || typeof payload.text !== 'string') {
        this.fail(session,'Voice transcription returned an unreadable response. Please try again.');
        return;
      }
      const text = payload.text.trim();
      if(!text) {
        this.fail(session,EMPTY_RECORDING);
        return;
      }
      this.session = null;
      this.cleanup(session);
      this.setState('idle');
      this.callbacks.onText(text);
    } catch {
      this.fail(session,'Could not reach voice transcription. Check your connection and try again.');
    }
  }

  private isCurrent(session:CaptureSession):boolean {return this.session === session && !this.disposed;}

  private setState(state:VoiceCaptureState):void {
    if(this.currentState === state) return;
    this.currentState = state;
    this.callbacks.onState(state);
  }

  private fail(session:CaptureSession,message:string):void {
    if(!this.isCurrent(session)) return;
    this.session = null;
    this.cleanup(session);
    this.setState('idle');
    this.callbacks.onError(message);
  }

  private clearTimer(session:CaptureSession,key:'recordingTimer'|'finishingTimer'|'uploadTimer'):void {
    const timer = session[key];
    if(timer !== null) this.deps.clearTimeout(timer);
    session[key] = null;
  }

  private stopTracks(stream:MediaStream):void {
    for(const track of stream.getTracks()) {
      try {track.stop();} catch { /* Continue releasing other tracks if a device has already gone away. */ }
    }
  }

  private releaseMicrophone(session:CaptureSession):void {
    for(const remove of session.trackListeners) remove();
    session.trackListeners = [];
    if(session.stream) this.stopTracks(session.stream);
    session.stream = null;
  }

  private cleanup(session:CaptureSession):void {
    this.clearTimer(session,'recordingTimer');
    this.clearTimer(session,'finishingTimer');
    this.clearTimer(session,'uploadTimer');
    session.abort?.abort();
    const recorder = session.recorder;
    if(recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      try {if(recorder.state !== 'inactive') recorder.stop();} catch { /* Always release the microphone. */ }
    }
    this.releaseMicrophone(session);
    session.chunks = [];
  }
}

function microphoneError(error:unknown):string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if(name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone access was blocked. Allow microphone access in your browser, then try again.';
  if(name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No microphone was found. Connect a microphone and try again.';
  if(name === 'NotReadableError' || name === 'TrackStartError') return 'The microphone is busy or unavailable. Close other apps using it and try again.';
  return 'Could not start the microphone. Check your microphone and try again.';
}
