import {levels} from './src/levels.ts';
import http from 'node:http';
import fs from 'node:fs/promises';
import {codeInstructions} from './src/code-instructions.ts';
import {arenaSchema,arenaGenerationSchema,inventoryVerdictSchema,arenaBrief,directorInstructions} from './src/arena.ts';
import {createServer as createVite} from 'vite';
import {z} from 'zod';
import {inventionSchema,codeGenerationSchema,prepareInvention,worldBrief} from './src/spec.ts';
const model=process.env.ESCAPE_MODEL||'gpt-6-astra';
const reasoningEffort=process.env.ESCAPE_REASONING_EFFORT||'low';
const repairReasoningEffort=process.env.ESCAPE_REPAIR_REASONING_EFFORT||'medium';
const serviceTier=process.env.ESCAPE_SERVICE_TIER||'fast';
const port=Number(process.env.PORT||4320);
const vite=await createVite({server:{middlewareMode:true},appType:'spa'});
const engineFiles=['src/simulation.ts','src/view.ts','src/code-runtime.ts'];
const readEngine=async()=>Object.fromEntries(await Promise.all(engineFiles.map(async name=>[name,await fs.readFile(new URL(name,import.meta.url),'utf8')])));
const toSchema=s=>{const result=z.toJSONSchema(s);delete result.$schema;return result;};
const schema=toSchema(codeGenerationSchema),roomSchema=toSchema(arenaGenerationSchema),verdictSchema=toSchema(z.object({verdicts:z.array(inventoryVerdictSchema)}));
let active=0;
const clean=s=>String(s).replace(/sk-[\w-]+/g,'[redacted]').slice(0,500);
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>500000)throw Error('Request too large');}return JSON.parse(s);}
async function generate(instructions,input,format,effort,signal){
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model,service_tier:serviceTier,reasoning:{effort},max_output_tokens:14000,instructions,input:JSON.stringify(input),text:{format:{type:'json_schema',name:'game_code',strict:true,schema:format}}}),signal});
 const data=await response.json();if(!response.ok)throw Error(data.error?.message||`Astra returned ${response.status}`);
 if(data.status==='incomplete')throw Error('The build did not finish. Try again.');
 const output=(data.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
 return {output:JSON.parse(output),serviceTier:data.service_tier};
}
http.createServer(async(req,res)=>{
 if(req.url==='/api/health')return json(res,200,{ready:!!process.env.OPENAI_API_KEY,model,reasoningEffort,repairReasoningEffort,serviceTier,execution:'direct'});
 if(['/api/invent','/api/direct','/api/check-rule'].includes(req.url)&&req.method==='POST'){
  const origin=req.headers.origin;if(origin&&origin!==`http://localhost:${port}`&&origin!==`http://127.0.0.1:${port}`)return json(res,403,{error:'Origin not allowed'});
  if(!process.env.OPENAI_API_KEY)return json(res,503,{error:'Astra is not connected.'});
  if(active>=3)return json(res,429,{error:'Astra is busy. Try again shortly.'});
  let input;try{input=await body(req);if(input.arena)input.arena=arenaSchema.parse(input.arena);if(input.previous)input.previous=inventionSchema.parse(input.previous);if(req.url==='/api/invent'){input.level=z.number().int().min(0).max(2).default(0).parse(input.level);if(typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>1200)throw Error('Describe your invention in 1–1200 characters.');}}catch(e){return json(res,400,{error:clean(e.message)});}
  active++;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000),start=performance.now();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  const effort=input.repair?repairReasoningEffort:reasoningEffort;
  try{
   const engineSource=req.url==='/api/check-rule'?null:await readEngine();let payload,kind;
   if(req.url==='/api/check-rule'){
    const generated=await generate('Judge inventory legality for this game rule. Return one verdict per exact inventory key. Judge the actual mechanism, materials and energy source from the supplied invention, not cosmetic naming. Empty restriction allows everything. Explain disallowed items in a complete player-facing sentence under 100 characters. Describe the behavior, never function names, code or API details. This is a rule check only, not a physics test.',{rule:input.arena?.rule,inventory:input.inventory},verdictSchema,'low',controller.signal);
    payload={verdicts:z.array(inventoryVerdictSchema).parse(generated.output.verdicts)};kind='rules';
   }else if(req.url==='/api/direct'){
    const generated=await generate(directorInstructions,{nextRound:input.repair?input.arena?.round:(input.arena?.round||1)+1,previousRoom:input.arena,winningInvention:input.previous||null,plannedInvention:input.plannedInvention||null,telemetry:input.telemetry,history:input.history||[],inventory:input.inventory||[],runtimeFailure:input.repair||null,engineSource},roomSchema,effort,controller.signal);
    const next=arenaGenerationSchema.parse(generated.output);if(next.challengeMode==='rules'&&!input.repair){next.code=input.arena?.code||'';next.objective=input.arena?.objective||next.objective;}
    payload={arena:next,serviceTier:generated.serviceTier};kind='rooms';
   }else{
    const world=input.arena?{...input.scene,guard:null,keyOwner:'none',level:0,levelRules:arenaBrief(input.arena),rules:arenaBrief(input.arena),room:input.arena}:{...worldBrief,...input.scene,...(input.level>0?{guard:null,gate:null,keyOwner:'none',exit:{position:[8,input.level===2?4:0,0]}}:{}),level:input.level,levelRules:levels[input.level].brief,rules:levels[input.level].brief};
    const generated=await generate(codeInstructions,{request:input.prompt,previous:input.previous||null,runtimeFailure:input.repair||null,engineSource,world},schema,effort,controller.signal);
    payload={invention:prepareInvention(generated.output),serviceTier:generated.serviceTier};kind='inventions';
   }
   const artifactId=Date.now().toString(36),elapsedMs=Math.round(performance.now()-start),result={...payload,artifactId,elapsedMs,model,reasoningEffort:effort};
   await fs.mkdir(new URL(`./runtime/${kind}/`,import.meta.url),{recursive:true});await fs.writeFile(new URL(`./runtime/${kind}/${artifactId}.json`,import.meta.url),JSON.stringify({...result,prompt:input.prompt,level:input.level,telemetry:input.telemetry},null,2));json(res,200,result);
  }catch(e){if(!res.destroyed)json(res,502,{error:e.name==='AbortError'?'The build timed out. Try again.':clean(e.message)});}finally{clearTimeout(timer);active--;}
  return;
 }
 vite.middlewares(req,res);
}).listen(port,'127.0.0.1',()=>console.log(`BAD IDEA http://localhost:${port} · ${model} · direct execution · key ${process.env.OPENAI_API_KEY?'connected':'missing'}`));
