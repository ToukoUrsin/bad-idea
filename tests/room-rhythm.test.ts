import test from 'node:test';
import assert from 'node:assert/strict';
import {arenaGenerationSchema,arenaSchema,firstArena,resolveRoomReuse,type Arena} from '../src/arena';
import {directorRhythm,gameplaySchema,readRoomHistory,recordRoomTransition,rememberRoom} from '../src/room-rhythm';

function room(round:number,pressure:'low'|'medium'|'high'='high',interaction:NonNullable<Arena['gameplay']>['interaction']='timing'):Arena{
 return {...firstArena,round,title:`Room ${round}`,gameplay:{interaction,pressure,mechanic:'Cross a cycling obstacle during its safe interval.'}};
}

test('legacy rooms remain readable while newly generated rooms require physical gameplay metadata',()=>{
 const legacy={...firstArena};delete legacy.gameplay;
 assert.equal(arenaSchema.parse(legacy).gameplay,undefined);
 const generated={...legacy,challengeMode:'geometry',inventoryVerdicts:[]};
 assert.equal(arenaGenerationSchema.safeParse(generated).success,false);
 assert.equal(arenaGenerationSchema.safeParse({...generated,gameplay:room(2).gameplay}).success,true);
 assert.equal(gameplaySchema.safeParse({interaction:'timing',pressure:'low',mechanic:''}).success,false);
 assert.equal(gameplaySchema.safeParse({interaction:'timing',pressure:'extreme',mechanic:'Cross the floor.'}).success,false);
 assert.equal(gameplaySchema.safeParse({interaction:'other',pressure:'medium',mechanic:'Balance floating objects to redirect gravity.'}).success,true);
});

test('room memories preserve gameplay and invention rules without carrying executable code',()=>{
 const current={...room(2),code:'return {step(){}};',objective:'Carry the box to the exit',rule:{title:'Wood only',restriction:'Use only wood and mechanical power.'}};
 const memory=rememberRoom(current);
 assert.deepEqual(memory.gameplay,current.gameplay);
 assert.equal(memory.objective,current.objective);
 assert.equal(memory.restriction,current.rule.restriction);
 assert.equal('code' in memory,false);
 assert.equal('rule' in memory,false);
});

test('history accepts old saves, drops invalid entries, and keeps the latest six distinct rounds',()=>{
 assert.deepEqual(readRoomHistory(null),[]);
 assert.deepEqual(readRoomHistory({round:1}),[]);
 const legacy={round:1,title:'Old wall',change:'A low wall.'};
 assert.equal(readRoomHistory([legacy])[0].gameplay,undefined);
 const history=[...Array.from({length:8},(_,i)=>rememberRoom(room(i+1))),null,{round:'invalid'},rememberRoom({...room(8),title:'Repaired room 8'})];
 const result=readRoomHistory(history);
 assert.deepEqual(result.map(entry=>entry.round),[3,4,5,6,7,8]);
 assert.equal(result.at(-1)?.title,'Repaired room 8');
});

test('advancing records the departed room once while entering a repair adds no round',()=>{
 const previous=room(3);
 const history=[rememberRoom(room(1)),rememberRoom(room(2)),rememberRoom({...previous,title:'Failed old version'}),rememberRoom(room(9))];
 const repaired=recordRoomTransition(history,previous,3);
 assert.deepEqual(repaired.map(entry=>entry.round),[1,2]);
 const advanced=recordRoomTransition(history,previous,4);
 assert.deepEqual(advanced.map(entry=>entry.round),[1,2,3]);
 assert.equal(advanced.at(-1)?.title,previous.title);
 assert.deepEqual(recordRoomTransition(advanced,previous,4),advanced);
});

test('rhythm considers the current room and recognizes the same task across different themes',()=>{
 const floor={...room(2,'medium'),title:'Electric floor',gameplay:{...room(2,'medium').gameplay!,mechanic:'Wait for a safe interval on the pulsing floor.'}};
 const press={...room(3,'high'),title:'Ceiling press',gameplay:{...room(3,'high').gameplay!,mechanic:'Wait for the press to rise before crossing.'}};
 const rhythm=directorRhythm(press,[rememberRoom(firstArena),rememberRoom(floor)]);
 assert.equal(rhythm.pace,'develop');
 assert.deepEqual(rhythm.avoidInteractions,['timing']);
 assert.equal(rhythm.recentRooms.at(-1)?.title,press.title);
 assert.equal(rhythm.recentRooms.at(-1)?.gameplay?.mechanic,press.gameplay.mechanic);
});

test('two distinct high-pressure rooms request a breather without requiring a fixed round cadence',()=>{
 assert.equal(directorRhythm(room(3),[rememberRoom(room(2))]).pace,'breather');
 assert.equal(directorRhythm(room(7),[rememberRoom(room(6))]).pace,'breather');
 assert.equal(directorRhythm(room(3,'medium'),[rememberRoom(room(2))]).pace,'develop');
 assert.equal(directorRhythm(room(4,'low'),[rememberRoom(room(2)),rememberRoom(room(3))]).pace,'develop');
 assert.equal(directorRhythm(room(2),[]).pace,'develop');
 assert.equal(directorRhythm(firstArena,[]).pace,'introduce');
});

test('legacy unknown pressure interrupts a high-pressure streak',()=>{
 const legacy={round:3,title:'Unlabeled old room',change:'A crushing ceiling.'};
 const rhythm=directorRhythm(room(4),[rememberRoom(room(2)),legacy]);
 assert.equal(rhythm.pace,'develop');
 assert.equal(rhythm.recentRooms.at(-2)?.gameplay,undefined);
 assert.equal(directorRhythm(room(4),[rememberRoom(room(2))]).pace,'develop','a missing round must not count as known high pressure');
});

test('repair duplicates and future history cannot manufacture high-pressure streaks',()=>{
 const current=room(2);
 const history=[rememberRoom(firstArena),rememberRoom(current),rememberRoom(current),rememberRoom(room(3))];
 const rhythm=directorRhythm(current,history);
 assert.equal(rhythm.pace,'develop');
 assert.deepEqual(rhythm.recentRooms.map(entry=>entry.round),[1,2]);
});

test('repairs preserve challenge intent and unknown interaction categories do not become bans',()=>{
 const repaired=directorRhythm(room(3),[rememberRoom(room(2))],true);
 assert.equal(repaired.pace,'preserve');
 assert.deepEqual(repaired.avoidInteractions,[]);
 const unusual=directorRhythm(room(3,'medium','other'),[rememberRoom(room(2,'medium','manipulation'))]);
 assert.deepEqual(unusual.avoidInteractions,['manipulation']);
});

test('rules-only reuse inherits actual physical gameplay and keeps the new invention constraint',()=>{
 const previous={...room(2),code:'existing physical room',objective:'Cross the press'};
 const proposed={...room(3,'low','navigation'),challengeMode:'rules' as const,code:'',objective:'A different objective',rule:{title:'No motors',restriction:'Electrical motors are forbidden.'}};
 const next=resolveRoomReuse(proposed,previous);
 assert.equal(next.code,previous.code);
 assert.equal(next.objective,previous.objective);
 assert.deepEqual(next.gameplay,previous.gameplay);
 assert.deepEqual(next.rule,proposed.rule);
 assert.equal(proposed.code,'','resolving reuse does not mutate the generated response');
});

test('rules-only reuse keeps legacy gameplay unknown instead of claiming an unimplemented change',()=>{
 const previous={...room(2),code:'legacy high-pressure hazard'};delete previous.gameplay;
 const proposed={...room(3,'low','navigation'),challengeMode:'rules' as const};
 assert.equal(resolveRoomReuse(proposed,previous).gameplay,undefined);
});

test('physical changes and runtime repairs keep newly generated code',()=>{
 const previous={...room(2),code:'broken room'};
 const proposed={...room(3,'medium','manipulation'),challengeMode:'mixed' as const,code:'new room'};
 assert.deepEqual(resolveRoomReuse(proposed,previous),proposed);
 const repair={...proposed,round:2,challengeMode:'rules' as const,code:'fixed room'};
 assert.deepEqual(resolveRoomReuse(repair,previous,true),repair);
});
