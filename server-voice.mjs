const audioExtensions = new Map([
  ['audio/webm', 'webm'], ['audio/mp4', 'mp4'], ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'], ['audio/x-wav', 'wav'], ['audio/wave', 'wav'], ['audio/vnd.wave', 'wav'],
  ['audio/mpeg', 'mp3'], ['audio/mp3', 'mp3'], ['audio/mpga', 'mpga'],
  ['audio/m4a', 'm4a'], ['audio/x-m4a', 'm4a'], ['audio/flac', 'flac'], ['audio/x-flac', 'flac'],
]);

class VoiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(req, res, status, data, headers = {}) {
  if (res.destroyed || res.writableEnded) return;
  // Close rejected uploads after replying instead of continuing to accept their bodies.
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    ...(!req.complete ? {connection: 'close'} : {}), ...headers,
  });
  res.end(JSON.stringify(data));
}

function readAudio(req, limit, signal) {
  return new Promise((resolve, reject) => {
    let chunks = [], size = 0;
    const cleanup = () => {
      req.off('data', onData);
      req.off('end', onEnd);
      signal.removeEventListener('abort', onAbort);
    };
    const fail = error => {
      cleanup();
      chunks = [];
      req.pause();
      reject(error);
    };
    const onData = chunk => {
      size += chunk.length;
      if (size > limit) return fail(new VoiceError(413, 'That recording is too large. Try a shorter invention.'));
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      if (!size) return reject(new VoiceError(400, 'No audio was recorded. Try speaking again.'));
      resolve(Buffer.concat(chunks, size));
    };
    const onAbort = () => fail(signal.reason);
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, {once: true});
    req.on('data', onData);
    req.once('end', onEnd);
  });
}

// Keep recordings in memory only. The existing hosting gate must authorize callers first.
export function createVoiceTranscriber({
  isAllowedOrigin, env = process.env, fetchImpl = fetch,
  maxAudioBytes = 8 * 1024 * 1024, maxConcurrent = 3, timeoutMs = 45000,
} = {}) {
  let active = 0;
  return async function transcribe(req, res) {
    if (req.method !== 'POST') return json(req, res, 405, {error: 'Use POST to send a recording.'}, {allow: 'POST'});
    if (!isAllowedOrigin?.(req.headers.origin)) return json(req, res, 403, {error: 'Origin not allowed'});
    if (!env.OPENAI_API_KEY) return json(req, res, 503, {error: 'Voice input is not connected. You can still type your invention.'});
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const extension = audioExtensions.get(contentType);
    if (!extension || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) {
      return json(req, res, 415, {error: 'This recording format is not supported. Try another browser or type your invention.'});
    }
    const contentLength = req.headers['content-length'];
    if (contentLength !== undefined && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxAudioBytes)) {
      return json(req, res, 413, {error: 'That recording is too large. Try a shorter invention.'});
    }
    if (active >= maxConcurrent) return json(req, res, 429, {error: 'Voice input is busy. Try again shortly.'});

    // Reserve capacity before reading so simultaneous uploads are bounded too.
    active++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new VoiceError(504, 'Transcription timed out. Try speaking again.')), timeoutMs);
    timer.unref();
    const disconnect = () => { if (!res.writableEnded) controller.abort(new Error('Recording cancelled.')); };
    req.once('aborted', disconnect);
    req.once('error', disconnect);
    res.once('close', disconnect);
    try {
      const audio = await readAudio(req, maxAudioBytes, controller.signal);
      controller.signal.throwIfAborted();
      const form = new FormData();
      form.set('file', new Blob([audio], {type: contentType}), `invention.${extension}`);
      form.set('model', env.ESCAPE_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');
      form.set('response_format', 'json');
      const response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST', headers: {authorization: `Bearer ${env.OPENAI_API_KEY}`}, body: form, signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429) throw new VoiceError(429, 'Voice input is busy. Try again shortly.');
        if (response.status === 401 || response.status === 403) throw new VoiceError(503, 'Voice input is not connected. You can still type your invention.');
        if (response.status === 400 || response.status === 415) throw new VoiceError(422, 'The recording could not be understood. Try recording again.');
        throw new VoiceError(502, 'Could not transcribe the recording. Try again.');
      }
      const data = await response.json();
      controller.signal.throwIfAborted();
      if (typeof data?.text !== 'string') throw new VoiceError(502, 'Could not transcribe the recording. Try again.');
      const text = data.text.replace(/\s+/g, ' ').trim();
      if (!text) throw new VoiceError(422, 'No speech was heard. Try speaking closer to the microphone.');
      json(req, res, 200, {text});
    } catch (error) {
      const reason = controller.signal.aborted ? controller.signal.reason : error;
      json(req, res, reason instanceof VoiceError ? reason.status : 502, {
        error: reason instanceof VoiceError ? reason.message : 'Could not transcribe the recording. Try again.',
      });
    } finally {
      clearTimeout(timer);
      req.off('aborted', disconnect);
      req.off('error', disconnect);
      res.off('close', disconnect);
      active--;
    }
  };
}
