import type {Invention} from './spec';import type {LevelId} from './levels';import type {ValidationResult} from './code-validation';
export function validateInWorker(invention:Invention,level:LevelId,signal?:AbortSignal):Promise<ValidationResult>{
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./code-validator.worker.ts',import.meta.url),{type:'module'});
  const finish=(result:ValidationResult)=>{clearTimeout(timeout);signal?.removeEventListener('abort',abort);worker.terminate();resolve(result);};
  const abort=()=>{clearTimeout(timeout);worker.terminate();reject(new DOMException('Canceled','AbortError'));};
  const timeout=setTimeout(()=>finish({ok:false,error:'Code validation timed out. Reduce expensive or unbounded work.',checks:[],frames:0}),12000);
  worker.onmessage=e=>finish(e.data);worker.onerror=e=>finish({ok:false,error:e.message||'Code validation worker failed.',checks:[],frames:0});
  if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});worker.postMessage({invention,level});
 });
}
