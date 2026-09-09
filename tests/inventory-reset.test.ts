import test from 'node:test';
import assert from 'node:assert/strict';
import {applyInventoryReset,shouldResetInventory} from '../src/inventory-reset';

type Invention={name:string};
type Run={
 inventory:{key:string,item:Invention}[];
 spec:Invention|null;
 draft:Invention|null;
 previousForRule:Invention|null;
 lastInventoryResetRound:number|null;
 collectedWords:string[];
 level:number;
};

function savedRun():Run{
 return {
  inventory:[{key:'ladder',item:{name:'Ladder'}}],
  spec:{name:'Ladder'},draft:{name:'Draft glider'},previousForRule:{name:'Old spring'},
  lastInventoryResetRound:null,collectedWords:['wood'],level:0,
 };
}

test('entering a flagged late room clears all invention references and records the round',()=>{
 const before=savedRun();
 const after=applyInventoryReset(before,{round:6,inventoryReset:true});
 assert.deepEqual(after,{...before,inventory:[],spec:null,draft:null,previousForRule:null,lastInventoryResetRound:6});
 assert.equal(after.collectedWords,before.collectedWords,'unrelated room state is preserved');
 assert.equal(before.inventory.length,1,'the previous run snapshot is not mutated');
 assert.equal(before.spec?.name,'Ladder');
 assert.equal(before.lastInventoryResetRound,null);
});

test('unflagged rooms, classic levels, and the first five rounds never clear inventions',()=>{
 const state=savedRun();
 for(const arena of [null,{round:6},{round:9,inventoryReset:false},...Array.from({length:5},(_,i)=>({round:i+1,inventoryReset:true}))]){
  assert.equal(shouldResetInventory(arena,state.lastInventoryResetRound),false);
  assert.equal(applyInventoryReset(state,arena),state);
 }
});

test('same-round retries, reloads, and repaired rooms retain inventions created after a reset',()=>{
 const room={round:6,inventoryReset:true};
 const entered=applyInventoryReset(savedRun(),room);
 const built:Run={...entered,inventory:[{key:'raft',item:{name:'Raft'}}],spec:{name:'Raft'},draft:{name:'Sail'},previousForRule:{name:'Paddle'}};
 const retry=applyInventoryReset(built,room);
 assert.equal(retry,built);
 const resumed=JSON.parse(JSON.stringify(built)) as Run;
 const repairedRoom={...room};
 assert.equal(applyInventoryReset(resumed,repairedRoom),resumed);
 assert.deepEqual(resumed,built,'the round marker survives serialization alongside newly built inventions');
});

test('preparing a flagged next room does not alter the current room inventory',()=>{
 const state={...savedRun(),arena:{round:6},nextArena:{round:7,inventoryReset:true}};
 const preparing=applyInventoryReset(state,state.arena);
 assert.equal(preparing,state);
 assert.equal(preparing.inventory.length,1);
 const entered={...preparing,arena:preparing.nextArena};
 assert.equal(applyInventoryReset(entered,entered.arena).inventory.length,0);
});

test('a later flagged room clears new inventions once without imposing a fixed cadence',()=>{
 const first=applyInventoryReset(savedRun(),{round:6,inventoryReset:true});
 const built:Run={...first,inventory:[{key:'raft',item:{name:'Raft'}}],spec:{name:'Raft'}};
 const ordinary=applyInventoryReset(built,{round:10,inventoryReset:false});
 assert.equal(ordinary,built,'round numbers alone do not schedule a reset');
 const later=applyInventoryReset(ordinary,{round:13,inventoryReset:true});
 assert.deepEqual(later.inventory,[]);
 assert.equal(later.spec,null);
 assert.equal(later.lastInventoryResetRound,13);
 assert.equal(applyInventoryReset(later,{round:13,inventoryReset:true}),later);
});

test('marking a legacy current room as already entered protects its existing inventory',()=>{
 const loaded={...savedRun(),lastInventoryResetRound:8};
 assert.equal(applyInventoryReset(loaded,{round:8,inventoryReset:true}),loaded);
 assert.equal(applyInventoryReset(loaded,{round:9,inventoryReset:true}).inventory.length,0);
});
