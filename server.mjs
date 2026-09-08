import {levels} from './src/levels.ts';
import http from 'node:http';
import fs from 'node:fs/promises';
import {codeInstructions} from './src/code-instructions.ts';
import {arenaSchema,arenaGenerationSchema,inventoryVerdictSchema,arenaBrief,directorInstructions,normalizeArenaRules,resolveDirectorArena} from './src/arena.ts';
import {getLanguageRule,collectedWordsForRule,promptRuleViolation,mergeLanguageVerdicts} from './src/prompt-rules.ts';
import {directorRhythm} from './src/room-rhythm.ts';
import {createHosting,saveGenerationArtifact,beginGenerationStream} from './server-hosting.mjs';
import {createVoiceTranscriber} from './server-voice.mjs';
import {z} from 'zod';
import {inventionSchema,codeGenerationSchema,prepareInvention,worldBrief} from './src/spec.ts';
import {createOutlineReader,readOpenAIResponse} from './src/build-stream.ts';
const model=process.env.ESCAPE_MODEL||'gpt-6-astra';
const reasoningEffort=process.env.ESCAPE_REASONING_EFFORT||'low';
const repairReasoningEffort=process.env.ESCAPE_REPAIR_REASONING_EFFORT||'medium';
const serviceTier=process.env.ESCAPE_SERVICE_TIER||'fast';
const port=Number(process.env.PORT||4320);
const server=http.createServer();
const hosting=await createHosting(server,{port});
const transcribe=createVoiceTranscriber({isAllowedOrigin:hosting.isAllowedOrigin});
const engineFiles=['src/simulation.ts','src/view.ts','src/code-runtime.ts'];
const readEngine=async()=>Object.fromEntries(await Promise.all(engineFiles.map(async name=>[name,await fs.readFile(new URL(name,import.meta.url),'utf8')])));
const toSchema=s=>{const result=z.toJSONSchema(s);delete result.$schema;return result;};
const schema=toSchema(codeGenerationSchema),roomSchema=toSchema(arenaGenerationSchema),verdictSchema=toSchema(z.object({verdicts:z.array(inventoryVerdictSchema)}));
const inventoryInputSchema=z.array(z.object({key:z.string().min(1).max(120),prompt:z.string().max(1200).optional()}).passthrough());
const semanticVerdictsFor=(inventory,verdicts,restriction)=>{
 const byKey=new Map(verdicts.map(verdict=>[verdict.key,verdict]));
 return inventory.map(({key})=>restriction?byKey.get(key)||{key,allowed:false,reason:'This invention still needs a rule check.'}:{key,allowed:true,reason:''});
};
let active=0;
const clean=s=>String(s).replace(/sk-[\w-]+/g,'[redacted]').slice(0,500);
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>500000)throw Error('Request too large');}return JSON.parse(s);}
async function generate(instructions,input,format,effort,signal,onOutline){
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model,service_tier:serviceTier,reasoning:{effort},max_output_tokens:14000,instructions,input:JSON.stringify(input),...(onOutline?{stream:true}:{}),text:{format:{type:'json_schema',name:'game_code',strict:true,schema:format}}}),signal});
 if(onOutline)return readOpenAIResponse(response,createOutlineReader(onOutline),signal);
 const data=await response.json();if(!response.ok)throw Error(data.error?.message||`Astra returned ${response.status}`);
 if(data.status==='incomplete')throw Error('The build did not finish. Try again.');
 const output=(data.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
 return {output:JSON.parse(output),serviceTier:data.service_tier};
}
server.on('request',async(req,res)=>{
 if(!hosting.authorize(req,res))return;
 if(req.url==='/api/transcribe')return transcribe(req,res);
 if(req.url==='/api/health')return json(res,200,{ready:!!process.env.OPENAI_API_KEY,model,reasoningEffort,repairReasoningEffort,serviceTier,execution:'direct'});
 if(['/api/invent','/api/direct','/api/check-rule'].includes(req.url)&&req.method==='POST'){
  if(!hosting.isAllowedOrigin(req.headers.origin))return json(res,403,{error:'Origin not allowed'});
  if(!process.env.OPENAI_API_KEY)return json(res,503,{error:'Astra is not connected.'});
  if(active>=3)return json(res,429,{error:'Astra is busy. Try again shortly.'});
  let input;try{
   input=await body(req);
   if(input.arena)input.arena=normalizeArenaRules(arenaSchema.parse(input.arena));
   if(input.previous)input.previous=inventionSchema.parse(input.previous);
   input.inventory=inventoryInputSchema.parse(input.inventory||[]);
   const language=getLanguageRule(input.arena);
   input.collectedWords=collectedWordsForRule(language,z.array(z.string().max(30)).max(12).default([]).parse(input.collectedWords));
   if(req.url==='/api/invent'){
    input.level=z.number().int().min(0).max(2).default(0).parse(input.level);
    if(typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>1200)throw Error('Describe your invention in 1–1200 characters.');
    const violation=promptRuleViolation(input.prompt,language,input.collectedWords);
    if(violation)throw Error(violation);
   }
  }catch(e){return json(res,400,{error:clean(e.message)});}
  if(active>=3)return json(res,429,{error:'Astra is busy. Try again shortly.'});
  active++;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000),start=performance.now();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  const streaming=String(req.headers.accept||'').split(',').some(type=>type.trim().split(';')[0].toLowerCase()==='application/x-ndjson');
  const stopHeartbeat=streaming?beginGenerationStream(res):()=>{};
  const streamEvent=event=>{
   controller.signal.throwIfAborted();
   if(res.destroyed)throw new DOMException('The build was cancelled.','AbortError');
   if(!res.headersSent){res.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store, no-transform','x-accel-buffering':'no'});res.flushHeaders();}
   res.write(`${JSON.stringify(event)}\n`);
  };
  const effort=input.repair?repairReasoningEffort:reasoningEffort;
  try{
   const engineSource=req.url==='/api/check-rule'?null:await readEngine();let payload,kind;
   if(req.url==='/api/check-rule'){
    const restriction=input.arena?.rule.restriction.trim()||'';
    const generated=restriction&&input.inventory.length?await generate('Judge inventory legality for this game rule. Return one verdict per exact inventory key. Judge only the actual mechanism, materials and energy source from the supplied invention, not cosmetic naming. Never judge letters, vocabulary, wording or word pickups: those are checked separately on the original player prompt. Explain disallowed items in a complete player-facing sentence under 100 characters. Describe the behavior, never function names, code or API details. This is a rule check only, not a physics test.',{rule:{restriction},inventory:input.inventory.map(({prompt,...item})=>item)},verdictSchema,'low',controller.signal):null;
    const semanticVerdicts=semanticVerdictsFor(input.inventory,generated?z.array(inventoryVerdictSchema).parse(generated.output.verdicts):[],restriction);
    payload={verdicts:mergeLanguageVerdicts(input.inventory,semanticVerdicts,getLanguageRule(input.arena),input.collectedWords),semanticVerdicts};kind='rules';
   }else if(req.url==='/api/direct'){
    const generated=await generate(directorInstructions,{nextRound:input.repair?input.arena?.round:(input.arena?.round||1)+1,previousRoom:input.arena,winningInvention:input.previous||null,plannedInvention:input.plannedInvention||null,telemetry:input.telemetry,rhythm:directorRhythm(input.arena,input.history,!!input.repair),inventory:input.inventory||[],runtimeFailure:input.repair||null,engineSource},roomSchema,effort,controller.signal);
    const next=resolveDirectorArena(arenaGenerationSchema.parse(generated.output),input.arena,!!input.repair);
    next.inventoryVerdicts=semanticVerdictsFor(input.inventory,next.inventoryVerdicts||[],next.rule.restriction.trim());
    if(!next.rule.restriction.trim()){next.carryAllowed=true;next.carryReason='';}
    payload={arena:next,serviceTier:generated.serviceTier};kind='rooms';
   }else{
    const world=input.arena?{...input.scene,guard:null,keyOwner:'none',level:0,levelRules:arenaBrief(input.arena),rules:arenaBrief(input.arena),room:input.arena}:{...worldBrief,...input.scene,...(input.level>0?{guard:null,gate:null,keyOwner:'none',exit:{position:[8,input.level===2?4:0,0]}}:{}),level:input.level,levelRules:levels[input.level].brief,rules:levels[input.level].brief};
    const generated=await generate(codeInstructions+'\nAny room language rules apply only to the player-written request, which has already been validated. Generated source, names, descriptions and usage text may use ordinary vocabulary freely. During repair, preserve that original request and correct the runtime failure.',{request:input.prompt,previous:input.previous||null,runtimeFailure:input.repair||null,engineSource,world},schema,effort,controller.signal,streaming?outline=>streamEvent({type:'outline',outline}):undefined);
    payload={invention:prepareInvention(codeGenerationSchema.parse(generated.output)),prompt:input.prompt,serviceTier:generated.serviceTier};kind='inventions';
   }
   const artifactId=Date.now().toString(36),elapsedMs=Math.round(performance.now()-start),result={...payload,artifactId,elapsedMs,model,reasoningEffort:effort};
   controller.signal.throwIfAborted();
   if(hosting.saveArtifacts)await saveGenerationArtifact(kind,artifactId,{...result,prompt:input.prompt,level:input.level,telemetry:input.telemetry});
   if(streaming){streamEvent({type:'complete',result});res.end();}else json(res,200,result);
  }catch(e){
   controller.abort();
   if(!res.destroyed){
    const error=e.name==='AbortError'?'The build timed out. Try again.':clean(e.message);
    if(res.headersSent)res.end(`${JSON.stringify({type:'error',error})}\n`);else json(res,502,{error});
   }
  }finally{stopHeartbeat();clearTimeout(timer);active--;}
  return;
 }
 hosting.middlewares(req,res);
}).listen(port,hosting.host,()=>console.log(`BAD IDEA listening on ${hosting.host}:${port} · ${model} · direct execution · key ${process.env.OPENAI_API_KEY?'connected':'missing'}`));
