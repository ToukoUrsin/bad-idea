import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {firstArena,tutorialLanguageRule,type Arena} from '../src/arena';
import {emptyLanguageRule,type LanguageRule} from '../src/prompt-rules';

const noE:LanguageRule={...emptyLanguageRule(),bannedLetters:['e']};
const bank:LanguageRule={...emptyLanguageRule(),wordBank:{starterWords:['a','ramp'],pickups:['rocket']}};
const room=(round:number,language:LanguageRule=noE):Arena=>({...firstArena,round,rule:{title:'Say it differently',restriction:'',language}});

test('the live HTTP handlers enforce prompt rules before generation and merge independent inventory checks', {timeout:15000},async t=>{
 const child=spawn(process.execPath,['--import','tsx','--input-type=module','-'],{
  cwd:new URL('..',import.meta.url),stdio:['pipe','pipe','pipe','ipc'],
  env:{...process.env,NODE_ENV:'development',PORT:'0',HOST:'127.0.0.1',OPENAI_API_KEY:'test-only-no-network',GAME_PASSWORD:'',SAVE_GENERATION_ARTIFACTS:'false'},
 });
 let stderr='';child.stderr.on('data',data=>{stderr+=data;});
 child.stdout.resume();
 const calls:any[]=[];
 const ready=new Promise<number>((resolve,reject)=>{
  child.on('message',(message:any)=>{
   if(message.type==='ready')resolve(message.port);
   if(message.type==='model')calls.push(message.request);
  });
  child.once('error',reject);
  child.once('exit',code=>reject(Error(`Fixture server exited ${code}: ${stderr}`)));
 });
 t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}});
 // Replace only the child process's model transport; HTTP requests to the actual
 // game server still exercise parsing, schemas, early rejection and response merging.
 child.stdin.end(`
  import http from 'node:http';
  import {firstArena} from './src/arena.ts';
  import {starters} from './src/starters.ts';
  const create=http.createServer;
  http.createServer=(...args)=>{const server=create(...args);server.once('listening',()=>process.send({type:'ready',port:server.address().port}));return server;};
  globalThis.fetch=async(url,options)=>{
   if(url!=='https://api.openai.com/v1/responses')throw Error('Unexpected outbound request');
   const request=JSON.parse(options.body),input=JSON.parse(request.input);
   process.send({type:'model',request:{instructions:request.instructions,input:{...input,engineSource:undefined},schema:request.text.format.schema}});
   let output;
   if(request.instructions.includes('adversarial LEVEL PROGRAMMER')){
    output={...firstArena,round:999,inventoryReset:input.nextRound!==7,challengeMode:'rules',inventoryVerdicts:(input.inventory||[]).map(({key})=>({key,allowed:false,reason:'Wrong generated-copy judgment'})),rule:{title:'No E',restriction:'',language:{bannedLetters:input.nextRound===4||input.nextRound===7?[]:['e'],bannedWords:[],wordBank:null}},carryAllowed:false,carryReason:'Wrong generated-copy judgment'};
   }else if(request.instructions.startsWith('Judge inventory')){
    output={verdicts:input.inventory.map(({key})=>({key,allowed:key!=='motor',reason:key==='motor'?'No electrical motors.':''}))};
   }else{
    output={...starters[0],name:'The generated engine',description:'The generated description can use every letter.',code:"return {step(dt){const message='the generated engine';},dispose(){}};"};
   }
   return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}],service_tier:'test'}),{status:200,headers:{'content-type':'application/json'}});
  };
  await import('./server.mjs');
 `);
 const port=await ready;
 const post=async(path:string,input:unknown)=>{
  const response=await fetch(`http://127.0.0.1:${port}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
  return {status:response.status,data:await response.json()};
 };

 await t.test('bad descriptions fail before any model request, including invented pickup claims',async()=>{
  let result=await post('/api/invent',{arena:room(4),prompt:'A JET'});
  assert.equal(result.status,400);assert.match(result.data.error,/letter “E”/);
  result=await post('/api/invent',{arena:room(6,bank),prompt:'a rocket'});
  assert.equal(result.status,400);assert.match(result.data.error,/rocket/);
  result=await post('/api/invent',{arena:room(6,bank),prompt:'a helicopter',collectedWords:['helicopter']});
  assert.equal(result.status,400);assert.match(result.data.error,/helicopter/);
  assert.equal(calls.length,0);
 });

 await t.test('valid original and repair prompts permit unrestricted generated names and JavaScript',async()=>{
  const result=await post('/api/invent',{arena:room(4),prompt:'A balloon',repair:'The generated engine threw a runtime error.'});
  assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(result.data.prompt,'A balloon');
  assert.equal(result.data.invention.name,'The generated engine');
  assert.match(result.data.invention.code,/the generated engine/);
  assert.equal(calls.at(-1).input.request,'A balloon');
  assert.match(calls.at(-1).instructions,/player-written request, which has already been validated/);
  const pickup=await post('/api/invent',{arena:room(6,bank),prompt:'A ROCKET',collectedWords:['ROCKET']});
  assert.equal(pickup.status,200);
 });

 await t.test('round-three rules are removed even from a saved or client-supplied arena',async()=>{
  const result=await post('/api/invent',{arena:{...room(3),rule:{...room(3).rule,restriction:'No engines'}},prompt:'The engine'});
  assert.equal(result.status,200);
  assert.equal(calls.at(-1).input.world.room.rule.restriction,'');
  assert.deepEqual(calls.at(-1).input.world.room.rule.language,emptyLanguageRule());
 });

 await t.test('language-only inventory checks use original prompts without any model call',async()=>{
  const before=calls.length;
  const inventory=[{key:'rocket',prompt:'a rocket',name:'The engine',code:'some e filled source'},{key:'ramp',prompt:'a ramp'},{key:'legacy',description:'a ramp'}];
  const locked=await post('/api/check-rule',{arena:room(6,bank),inventory});
  assert.equal(locked.status,200);
  assert.deepEqual(locked.data.verdicts.map((v:any)=>v.allowed),[false,true,false]);
  assert.ok(locked.data.semanticVerdicts.every((v:any)=>v.allowed));
  const unlocked=await post('/api/check-rule',{arena:room(6,bank),inventory,collectedWords:['rocket']});
  assert.deepEqual(unlocked.data.verdicts.map((v:any)=>v.allowed),[true,true,false]);
  assert.equal(calls.length,before);
 });

 await t.test('mixed rules merge prompt failure with semantic judgments and never send language into the semantic judge',async()=>{
  const arena={...room(6),rule:{...room(6).rule,restriction:'No electrical motors.'}};
  const result=await post('/api/check-rule',{arena,inventory:[{key:'motor',prompt:'A balloon',code:'motor mechanism'},{key:'ramp',prompt:'A JET',name:'Ramp'},{key:'legal',prompt:'A ramp'}]});
  assert.equal(result.status,200);
  assert.deepEqual(result.data.semanticVerdicts.map((v:any)=>v.allowed),[false,true,true]);
  assert.deepEqual(result.data.verdicts.map((v:any)=>v.allowed),[false,false,true]);
  assert.deepEqual(calls.at(-1).input.rule,{restriction:'No electrical motors.'});
  assert.ok(calls.at(-1).input.inventory.every((item:any)=>!('prompt' in item)));
 });

 await t.test('round-one director requests export portable strict schemas for every language-rule branch',async()=>{
  const result=await post('/api/direct',{arena:firstArena});
  assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(result.data.arena.round,2);
  const schema=calls.at(-1).schema;
  const checkStrictObjects=(node:any,path='$')=>{
   if(!node||typeof node!=='object')return;
   if(node.type==='object'){
    assert.equal(node.additionalProperties,false,`${path} must reject extra properties`);
    assert.deepEqual([...node.required].sort(),Object.keys(node.properties).sort(),`${path} must require every property`);
   }
   for(const [key,value] of Object.entries(node))checkStrictObjects(value,`${path}.${key}`);
  };
  checkStrictObjects(schema);
  const language=schema.properties.rule.properties.language.properties;
  const wordBank=language.wordBank.anyOf.find((branch:any)=>branch.type==='object').properties;
  for(const [name,field] of Object.entries({bannedWords:language.bannedWords,starterWords:wordBank.starterWords,pickups:wordBank.pickups}) as [string,any][]){
   // Exercise the serialized request, where JavaScript's Unicode flag is absent.
   // The previous \\p{L} pattern required that flag and the model API rejected it,
   // even in round two when this otherwise-unused branch was still in the schema.
   const pattern=new RegExp(field.items.pattern);
   for(const word of ['rocket','THE',"can't",'can’t'])assert.equal(pattern.test(word),true,`${name} must accept ${word} without regex flags`);
   for(const word of ['two words','123','rocket2'])assert.equal(pattern.test(word),false,`${name} must reject ${word}`);
  }
  const letterPattern=new RegExp(language.bannedLetters.items.pattern);
  for(const letter of ['a','E','z'])assert.equal(letterPattern.test(letter),true);
  for(const letter of ['','ee','3'])assert.equal(letterPattern.test(letter),false);
 });

 await t.test('round-five pickup introduction is enforced and later events remain the director choice',async()=>{
  const fifth=await post('/api/direct',{arena:room(4)});
  assert.equal(fifth.status,200,JSON.stringify(fifth.data));
  assert.equal(fifth.data.arena.round,5);
  assert.deepEqual(fifth.data.arena.rule.language,tutorialLanguageRule(5));
  assert.equal(fifth.data.arena.inventoryReset,false);
  const sixth=await post('/api/direct',{arena:room(5)});
  assert.equal(sixth.status,200,JSON.stringify(sixth.data));
  assert.equal(sixth.data.arena.inventoryReset,true);
  assert.deepEqual(sixth.data.arena.rule.language,noE);
  assert.equal(sixth.data.arena.carryAllowed,true,'clearing is separate from semantic legality');
  const seventh=await post('/api/direct',{arena:{...room(6),inventoryReset:true},history:[{round:5,title:'Word pickups',change:'Collect words',inventoryReset:false}]});
  assert.equal(seventh.status,200,JSON.stringify(seventh.data));
  assert.equal(seventh.data.arena.inventoryReset,false);
  assert.deepEqual(seventh.data.arena.rule.language,emptyLanguageRule());
  const memories=calls.at(-1).input.rhythm.recentRooms;
  assert.deepEqual(memories.map((memory:any)=>memory.inventoryReset),[false,true]);
 });

 await t.test('director output is gated to the requested round and repair preserves the current language rule',async()=>{
  const early=await post('/api/direct',{arena:room(2),inventory:[{key:'old',prompt:'The engine'}]});
  assert.equal(early.status,200,JSON.stringify(early.data));
  assert.equal(early.data.arena.round,3);
  assert.equal(early.data.arena.rule.restriction,'');
  assert.deepEqual(early.data.arena.rule.language,emptyLanguageRule());
  assert.equal(early.data.arena.carryAllowed,true);
  assert.equal(early.data.arena.inventoryReset,false);
  assert.equal(early.data.arena.inventoryVerdicts[0].allowed,true);
  const fourth=await post('/api/direct',{arena:room(3),inventory:[{key:'old',prompt:'The engine'}]});
  assert.equal(fourth.data.arena.round,4);
  assert.deepEqual(fourth.data.arena.rule.language,noE);
  assert.equal(fourth.data.arena.inventoryReset,false);
  assert.equal(fourth.data.arena.inventoryVerdicts[0].allowed,true,'director cache stays semantic-only');
  const repaired=await post('/api/direct',{arena:room(6,bank),repair:'Fix room physics',collectedWords:['rocket']});
  assert.equal(repaired.data.arena.round,6);
  assert.deepEqual(repaired.data.arena.rule.language,bank);
  assert.equal(repaired.data.arena.inventoryReset,false,'repair cannot introduce a fresh start');
  assert.ok(calls.at(-1).schema.properties.rule.required.includes('language'));
 });
});
