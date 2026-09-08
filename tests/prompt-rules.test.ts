import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {arenaSchema,arenaGenerationSchema,firstArena,normalizeArenaRules,resolveDirectorArena,ruleText,type Arena} from '../src/arena';
import {collectedWordsForRule,emptyLanguageRule,getLanguageRule,languageInventoryVerdict,languageRuleSchema,languageRuleText,mergeLanguageVerdicts,promptRuleViolation,type LanguageRule} from '../src/prompt-rules';
import {rememberRoom,readRoomHistory} from '../src/room-rhythm';

const noE:LanguageRule={...emptyLanguageRule(),bannedLetters:['E']};
const noThe:LanguageRule={...emptyLanguageRule(),bannedWords:['the']};
const bank:LanguageRule={...emptyLanguageRule(),wordBank:{starterWords:['a','ramp','that','can','go','up'],pickups:['rocket','jump',"can't"]}};
const room=(round:number,language:LanguageRule=noE):Arena=>({...firstArena,round,rule:{title:'A new way to say it',restriction:'',language}});

test('round four is the first language-rule round and empty rules stay inactive',()=>{
 for(const round of [1,2,3])assert.equal(getLanguageRule(room(round)),null);
 assert.deepEqual(getLanguageRule(room(4)),{...noE,bannedLetters:['e']});
 assert.equal(getLanguageRule(room(8,emptyLanguageRule())),null);
 assert.equal(getLanguageRule({...room(4),rule:{title:'Legacy',restriction:''}}),null);
 assert.equal(getLanguageRule(null),null);
});

test('letter bans inspect the entire original prompt case-insensitively',()=>{
 assert.match(promptRuleViolation('A JET',noE)!,/letter “E”/);
 assert.match(promptRuleViolation('A jEt',noE)!,/letter “E”/);
 assert.match(promptRuleViolation('A fullwidth Ｅ',noE)!,/letter “E”/);
 assert.equal(promptRuleViolation('A balloon to float up',noE),null);
 assert.equal(promptRuleViolation('the jet',null),null);
});

test('word bans match whole words across punctuation and normalize contractions',()=>{
 for(const prompt of ['the ramp','THE ramp','A ramp, the wall.', 'Use “the”.', 'a-the-ramp'])assert.match(promptRuleViolation(prompt,noThe)!,/word “the”/);
 assert.equal(promptRuleViolation('There is another ramp',noThe),null);
 const contraction={...emptyLanguageRule(),bannedWords:["can't"]};
 assert.match(promptRuleViolation('It CAN’T fall',contraction)!,/word “can't”/);
 assert.equal(promptRuleViolation('It can fall',contraction),null);
});

test('word pickups unlock reusable exact vocabulary and reject fabricated unlocks',()=>{
 assert.equal(promptRuleViolation('A ramp that can go up!',bank),null);
 assert.match(promptRuleViolation('a rocket that can jump',bank)!,/rocket.*jump/);
 assert.match(promptRuleViolation('a rocket that can jump',bank,['rocket'])!,/jump/);
 assert.equal(promptRuleViolation('A ROCKET that can jump, jump!',bank,['ROCKET','jump']),null);
 assert.match(promptRuleViolation('a helicopter',bank,['helicopter'])!,/helicopter/);
 assert.equal(promptRuleViolation('a ramp that can go up 3',bank),null,'punctuation and numbers are free');
 assert.equal(promptRuleViolation('a rocket can’t jump',bank,['rocket',"CAN’T",'jump']),null);
 assert.match(promptRuleViolation('!!!',bank)!,/Describe your invention/);
 assert.deepEqual(collectedWordsForRule(bank,['rocket','ROCKET','fake','ramp']),['rocket']);
});

test('bank validation prevents duplicate, conflicting and uncollectible word sets',()=>{
 assert.equal(languageRuleSchema.safeParse(bank).success,true);
 for(const invalid of [
  {...noE,bannedLetters:['E','e']},
  {...noThe,bannedWords:['the','THE']},
  {...bank,wordBank:{starterWords:[],pickups:['ramp']}},
  {...bank,wordBank:{starterWords:['a'],pickups:[]}},
  {...bank,wordBank:{starterWords:['a','ramp'],pickups:['RAMP']}},
  {...bank,wordBank:{starterWords:['a'],pickups:['two words']}},
  {...bank,wordBank:{starterWords:['a'],pickups:Array.from({length:9},(_,i)=>'word'+String.fromCharCode(97+i))}},
  {...bank,bannedWords:['ramp']},
  {...bank,bannedLetters:['e']},
 ])assert.equal(languageRuleSchema.safeParse(invalid).success,false,JSON.stringify(invalid));
});

test('legacy saved rooms load while generated rules require every structured language field',()=>{
 const legacy={...firstArena,rule:{title:'Anything goes',restriction:''}};
 assert.equal(arenaSchema.safeParse(legacy).success,true);
 const generated={...legacy,challengeMode:'geometry',inventoryVerdicts:[]};
 assert.equal(arenaGenerationSchema.safeParse(generated).success,false);
 assert.equal(arenaGenerationSchema.safeParse({...generated,rule:{...legacy.rule,language:emptyLanguageRule()}}).success,true);
 const schema=z.toJSONSchema(arenaGenerationSchema) as any;
 const rule=schema.properties.rule,language=rule.properties.language;
 assert.ok(rule.required.includes('language'));
 assert.deepEqual(language.required,['bannedLetters','bannedWords','wordBank']);
 assert.equal(language.additionalProperties,false);
 assert.deepEqual(language.properties.wordBank.anyOf[0].required,['starterWords','pickups']);
});

test('server room normalization removes all early restrictions and preserves later ones',()=>{
 const early={...room(3),rule:{...room(3).rule,restriction:'No motors'},carryAllowed:false,carryReason:'No motors',inventoryVerdicts:[{key:'jet',allowed:false,reason:'No motors'}]};
 const normal=normalizeArenaRules(early);
 assert.equal(normal.rule.restriction,'');
 assert.equal(getLanguageRule(normal),null);
 assert.equal(normal.carryAllowed,true);
 assert.deepEqual(normal.inventoryVerdicts,[{key:'jet',allowed:true,reason:''}]);
 assert.equal(early.rule.restriction,'No motors','normalization must not mutate the input');
 const later={...early,round:4};
 assert.equal(normalizeArenaRules(later),later);
});

test('director output cannot skip the round gate and repairs preserve language and room intent',()=>{
 const previous={...room(2),code:'old room',objective:'Cross the gap'};
 const proposed={...room(999,bank),challengeMode:'rules' as const,code:'',rule:{...room(999,bank).rule,restriction:'Wood only'}};
 const early=resolveDirectorArena(proposed,previous);
 assert.equal(early.round,3);
 assert.equal(early.rule.restriction,'');
 assert.equal(early.code,'old room');
 assert.equal(early.objective,previous.objective);
 const fourth=resolveDirectorArena(proposed,{...previous,round:3});
 assert.equal(fourth.round,4);
 assert.deepEqual(fourth.rule.language,bank);
 const repaired=resolveDirectorArena({...proposed,code:'fixed physics'},room(6,noThe),true);
 assert.equal(repaired.round,6);
 assert.equal(repaired.code,'fixed physics');
 assert.deepEqual(repaired.rule,room(6,noThe).rule);
});

test('inventory language legality uses original prompts and unlocks can change it without a model',()=>{
 assert.equal(languageInventoryVerdict(undefined,null),null);
 assert.equal(languageInventoryVerdict(undefined,noE)?.allowed,false);
 assert.match(languageInventoryVerdict(undefined,noE)!.reason,/Describe this invention again/);
 const inventory=[{key:'rocket',prompt:'a rocket'},{key:'ramp',prompt:'a ramp'},{key:'legacy'}];
 const semantic=inventory.map(({key})=>({key,allowed:true,reason:''}));
 const before=mergeLanguageVerdicts(inventory,semantic,bank);
 assert.deepEqual(before.map(verdict=>verdict.allowed),[false,true,false]);
 const after=mergeLanguageVerdicts(inventory,semantic,bank,['rocket']);
 assert.deepEqual(after.map(verdict=>verdict.allowed),[true,true,false]);
 assert.ok(semantic.every(verdict=>verdict.allowed),'cached semantic verdicts are unchanged by language checks');
 const semanticBan=[{key:'rocket',allowed:false,reason:'No combustion engines.'},...semantic.slice(1)];
 assert.equal(mergeLanguageVerdicts(inventory,semanticBan,bank,['rocket'])[0].reason,'No combustion engines.');
});

test('rule copy clearly scopes restrictions to descriptions and recent-room memory retains language variety',()=>{
 const current=room(5,noE);
 assert.match(ruleText(current.rule),/description|Describe your invention/);
 assert.doesNotMatch(ruleText(current.rule),/Any invention goes/);
 assert.equal(languageRuleText(null),'');
 assert.equal(ruleText(firstArena.rule),'Any invention goes');
 const memory=rememberRoom(current);
 assert.match(memory.languageRule!,/letter “E”/);
 assert.equal(memory.restriction,'','semantic restriction stays separate');
 assert.equal(readRoomHistory([memory])[0].languageRule,memory.languageRule);
 assert.equal(rememberRoom(room(3)).languageRule,undefined);
});
