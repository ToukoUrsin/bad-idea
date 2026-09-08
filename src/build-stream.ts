import {inventionSchema, type Invention} from './spec.ts';

export type InventionOutline = {
 name?:string;
 mount?:'free'|'player';
 spawn?:number[];
 parts:Invention['parts'];
};

const MAX_BUFFER=500000;
const outlineSchema=inventionSchema.pick({name:true,mount:true,spawn:true,parts:true}).partial({name:true,mount:true,spawn:true});

// Scan JSON structure without repairing truncated values or interpreting source code.
// Keeping the cursor between deltas also avoids rescanning the long code string.
class JsonValueScanner {
 cursor:number;
 private kind:'string'|'container'|'literal';
 private quoted=false;
 private escaped=false;
 private closers:string[]=[];
 constructor(text:string,readonly start:number){
  this.cursor=start;
  const first=text[start];
  this.kind=first==='"'?'string':first==='['||first==='{'?'container':'literal';
  if(this.kind==='string'){this.quoted=true;this.cursor++;}
 }
 end(text:string):number|undefined{
  while(this.cursor<text.length){
   const char=text[this.cursor];
   if(this.quoted){
    this.cursor++;
    if(this.escaped)this.escaped=false;
    else if(char==='\\')this.escaped=true;
    else if(char==='"'){
     this.quoted=false;
     if(this.kind==='string')return this.cursor;
    }
   }else if(this.kind==='literal'){
    if(/[\s,\]}]/.test(char))return this.cursor;
    this.cursor++;
   }else{
    this.cursor++;
    if(char==='"')this.quoted=true;
    else if(char==='[')this.closers.push(']');
    else if(char==='{')this.closers.push('}');
    else if(char===']'||char==='}'){
     if(this.closers.pop()!==char)throw Error('Invalid JSON structure');
     if(!this.closers.length)return this.cursor;
    }
   }
  }
 }
}

/** Consume the actual generated JSON and publish only complete preview geometry. */
export function createOutlineReader(onOutline:(outline:InventionOutline)=>void):(delta:string)=>void{
 let text='',cursor=0,key='',scanner:JsonValueScanner|undefined;
 let state:'root'|'key'|'colon'|'value'|'separator'|'part'|'partSeparator'|'done'='root';
 let stopped=false,last='';
 const seen=new Set<string>();
 const outline:InventionOutline={parts:[]};
 const emit=()=>{
  if(!outline.parts.length)return;
  const signature=JSON.stringify(outline);
  if(signature!==last){last=signature;onOutline(JSON.parse(signature));}
 };
 const value=():{value:unknown}|undefined=>{
  scanner??=new JsonValueScanner(text,cursor);
  const end=scanner.end(text);
  if(end===undefined)return;
  const parsed=JSON.parse(text.slice(scanner.start,end));
  cursor=end;scanner=undefined;
  return {value:parsed};
 };
 return delta=>{
  if(stopped)return;
  text+=delta;
  if(text.length>MAX_BUFFER)throw Error('The build response is too large.');
  // A malformed preview is withheld; the complete invention still has to pass
  // normal JSON and schema validation before it can be installed.
  while(cursor<text.length&&state!=='done'){
   if(!scanner){while(/\s/.test(text[cursor]||'')&&cursor<text.length)cursor++;}
   if(cursor>=text.length)return;
   try{
    if(state==='root'){
     if(text[cursor++]!=='{')throw Error('Expected object');
     state='key';
    }else if(state==='key'){
     if(text[cursor]==='}'){state='done';continue;}
     if(text[cursor]!=='"'&&!scanner)throw Error('Expected key');
     const next=value();if(!next)return;
     if(typeof next.value!=='string'||seen.has(next.value))throw Error('Invalid key');
     key=next.value;seen.add(key);state='colon';
    }else if(state==='colon'){
     if(text[cursor++]!==':')throw Error('Expected colon');
     state='value';
    }else if(state==='value'){
     if(key==='parts'){
      if(text[cursor++]!=='[')throw Error('Expected parts');
      state='part';
     }else{
      const next=value();if(!next)return;
      if(key==='name')outline.name=inventionSchema.shape.name.parse(next.value);
      else if(key==='mount')outline.mount=inventionSchema.shape.mount.parse(next.value);
      else if(key==='spawn')outline.spawn=inventionSchema.shape.spawn.parse(next.value);
      state='separator';
     }
    }else if(state==='part'){
     if(text[cursor]===']'){cursor++;state='separator';continue;}
     const next=value();if(!next)return;
     if(outline.parts.length>=24)throw Error('Too many parts');
     outline.parts.push(inventionSchema.shape.parts.element.parse(next.value));
     state='partSeparator';
    }else if(state==='partSeparator'){
     const char=text[cursor++];
     if(char===',')state='part';
     else if(char===']')state='separator';
     else throw Error('Expected part separator');
    }else if(state==='separator'){
     const char=text[cursor++];
     if(char===',')state='key';
     else if(char==='}')state='done';
     else throw Error('Expected separator');
    }
   }catch{stopped=true;return;}
   // Keep consumer failures outside the parse guard so cancellation propagates.
   emit();
  }
 };
}

async function* responseLines(response:Response,signal?:AbortSignal):AsyncGenerator<string>{
 if(!response.body)throw Error('The build response has no stream.');
 const reader=response.body.getReader(),decoder=new TextDecoder();
 let buffer='',skipLF=false;
 const abort=()=>{void reader.cancel(signal?.reason).catch(()=>{});};
 signal?.addEventListener('abort',abort,{once:true});
 try{
  while(true){
   signal?.throwIfAborted();
   const {value,done}=await reader.read();
   signal?.throwIfAborted();
   buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
   if(buffer.length>MAX_BUFFER)throw Error('The build response is too large.');
   let start=0;
   for(let i=0;i<buffer.length;i++){
    const char=buffer[i];
    if(skipLF){skipLF=false;if(char==='\n'){start=i+1;continue;}}
    if(char==='\r'||char==='\n'){
     const line=buffer.slice(start,i);start=i+1;skipLF=char==='\r';
     yield line;
    }
   }
   buffer=buffer.slice(start);
   if(done){if(buffer)yield buffer;return;}
  }
 }finally{
  signal?.removeEventListener('abort',abort);
  await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}

const message=(data:any,fallback:string):string=>typeof data?.error==='string'?data.error:typeof data?.error?.message==='string'?data.error.message:typeof data?.message==='string'?data.message:fallback;

/** Read the Responses API SSE protocol. A text-done event alone is not success. */
export async function readOpenAIResponse(response:Response,onDelta:(delta:string)=>void,signal?:AbortSignal):Promise<{output:unknown;serviceTier?:string}>{
 if(!response.ok){const data=await response.json();throw Error(message(data,`Astra returned ${response.status}`));}
 let output='',dataLines:string[]=[],frameSize=0;
 const event=()=>{
  if(!dataLines.length)return;
  const data=dataLines.join('\n');dataLines=[];frameSize=0;
  if(data==='[DONE]')return;
  const item=JSON.parse(data);
  if(item.type==='response.output_text.delta'){
   if(typeof item.delta!=='string')throw Error('Astra sent an invalid text delta.');
   output+=item.delta;
   if(output.length>MAX_BUFFER)throw Error('The build response is too large.');
   onDelta(item.delta);
  }else if(item.type==='response.completed'){
   if(item.response?.status!=='completed')throw Error('The build did not finish. Try again.');
   const finalText=(item.response.output||[]).filter((entry:any)=>entry.type==='message').flatMap((entry:any)=>entry.content||[]).filter((entry:any)=>entry.type==='output_text').map((entry:any)=>entry.text).join('');
   if(finalText&&output&&finalText!==output)throw Error('The build stream ended before all of its text arrived.');
   return {output:JSON.parse(output||finalText),serviceTier:item.response.service_tier};
  }else if(item.type==='response.incomplete')throw Error('The build did not finish. Try again.');
  else if(item.type==='error'||item.type==='response.failed'||item.type==='response.cancelled')throw Error(message(item.response||item,'The build failed. Try again.'));
 };
 for await(const line of responseLines(response,signal)){
  if(!line){const completed=event();if(completed)return completed;}
  else if(line.startsWith('data:')){
   const data=line.slice(5).replace(/^ /,'');frameSize+=data.length;
   if(frameSize>MAX_BUFFER)throw Error('The build response is too large.');
   dataLines.push(data);
  }
 }
 const completed=event();if(completed)return completed;
 throw Error('The build stream ended before it completed. Try again.');
}

/** Read opt-in live builds, with the original JSON API as a compatible fallback. */
export async function readBuildResponse(response:Response,onOutline:(outline:InventionOutline)=>void):Promise<any>{
 if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/x-ndjson'){
  const data=await response.json();
  if(!response.ok)throw Error(message(data,`The build returned ${response.status}.`));
  return data;
 }
 for await(const line of responseLines(response)){
  if(!line.trim())continue;
  const event=JSON.parse(line);
  if(event.type==='error')throw Error(message(event,'The build failed. Try again.'));
  if(!response.ok)throw Error(`The build returned ${response.status}.`);
  if(event.type==='outline')onOutline(outlineSchema.parse(event.outline));
  else if(event.type==='complete'){
   if(!event.result||typeof event.result!=='object')throw Error('The build returned an invalid result.');
   return event.result;
  }else throw Error('The build returned an unknown streaming event.');
 }
 throw Error('The build stream ended before it completed. Try again.');
}
