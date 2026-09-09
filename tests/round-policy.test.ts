import test from 'node:test';
import assert from 'node:assert/strict';
import {arenaSchema,arenaGenerationSchema,firstArena,normalizeArenaRules,resolveDirectorArena,tutorialLanguageRule,type Arena} from '../src/arena';
import {emptyLanguageRule,languageRuleSchema,promptRuleViolation} from '../src/prompt-rules';
import {rememberRoom,readRoomHistory} from '../src/room-rhythm';

const proposed=(round:number):Arena=>({...firstArena,round,inventoryReset:true,challengeMode:'mixed',inventoryVerdicts:[],rule:{title:'No engines',restriction:'No engines.',language:emptyLanguageRule()}});

test('saved and queued introductions are enforced without changing geometry or stacking restrictions',()=>{
 for(const round of [4,5]){
  const source={...proposed(round),code:'existing room code'};
  const normalized=normalizeArenaRules(source);
  assert.deepEqual(normalized.rule.language,tutorialLanguageRule(round));
  assert.equal(normalized.rule.restriction,'');
  assert.equal(normalized.inventoryReset,false);
  assert.equal(normalized.code,source.code);
  assert.equal(source.rule.restriction,'No engines.');
  assert.equal(source.inventoryReset,true,'normalization must not mutate saved input');
  assert.deepEqual(normalizeArenaRules(normalized),normalized);
 }
});

test('the fifth-round vocabulary supports inventions before and after collecting useful words',()=>{
 const language=tutorialLanguageRule(5)!;
 assert.equal(languageRuleSchema.safeParse(language).success,true);
 assert.equal(promptRuleViolation('a ramp to move me up over the wall',language),null);
 assert.equal(promptRuleViolation('a platform that can lift me',language),null);
 assert.match(promptRuleViolation('a balloon that can lift me',language)!,/balloon/);
 assert.equal(promptRuleViolation('a balloon that can lift me',language,['balloon']),null);
 assert.equal(tutorialLanguageRule(6),null);
});

test('only the introductions override the director and inventory resets are prohibited through round five',()=>{
 for(const round of [2,3,4,5]){
  const result=resolveDirectorArena(proposed(999),{...firstArena,round:round-1});
  assert.equal(result.round,round);
  assert.equal(result.inventoryReset,false);
  assert.deepEqual(result.rule.language,tutorialLanguageRule(round)||emptyLanguageRule());
 }
 for(const round of [6,7,10,11,20])for(const inventoryReset of [false,true]){
  const proposal={...proposed(999),inventoryReset};
  const result=resolveDirectorArena(proposal,{...firstArena,round:round-1});
  assert.equal(result.inventoryReset,inventoryReset);
  assert.deepEqual(result.rule,proposal.rule);
  assert.equal(normalizeArenaRules(result),result);
 }
});

test('repairs preserve both fresh-start intent and the entire language rule',()=>{
 for(const inventoryReset of [true,false]){
  const previous={...proposed(8),inventoryReset,rule:{title:'Collected words',restriction:'',language:tutorialLanguageRule(5)!}};
  const result=resolveDirectorArena({...proposed(999),inventoryReset:!inventoryReset,code:'fixed code'},previous,true);
  assert.equal(result.round,8);
  assert.equal(result.code,'fixed code');
  assert.equal(result.inventoryReset,inventoryReset);
  assert.deepEqual(result.rule,previous.rule);
 }
});

test('old arenas and histories remain readable while generated reset intent is explicit',()=>{
 const legacy={...firstArena};delete legacy.inventoryReset;
 assert.equal(arenaSchema.safeParse(legacy).success,true);
 const generated={...legacy,challengeMode:'geometry',inventoryVerdicts:[]};
 assert.equal(arenaGenerationSchema.safeParse(generated).success,false);
 assert.equal(arenaGenerationSchema.safeParse({...generated,inventoryReset:false}).success,true);
 assert.equal(rememberRoom(legacy).inventoryReset,false);
 assert.equal(rememberRoom({...firstArena,round:6,inventoryReset:true}).inventoryReset,true);
 assert.equal(readRoomHistory([{round:1,title:'Old save',change:''}])[0].inventoryReset,undefined);
 assert.equal(resolveDirectorArena(proposed(999),{...legacy,round:8},true).inventoryReset,false);
});
