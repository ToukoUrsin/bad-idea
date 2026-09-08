import test from 'node:test';
import assert from 'node:assert/strict';
import {starters,shouldAutoDeploy} from '../src/starters';
import {prepareInvention} from '../src/spec';

test('new and saved built-in inventions wait for the stated F press',()=>{
 for(const starter of starters){
  assert.equal(shouldAutoDeploy(starter),false);
  assert.equal(shouldAutoDeploy(prepareInvention({...starter,autoDeploy:true})),false);
 }
 assert.equal(shouldAutoDeploy(prepareInvention({...starters[2],name:'Wooden ladder',spawn:[3.65,0,0],autoDeploy:true})),false);
 assert.equal(shouldAutoDeploy(prepareInvention({...starters[0],spawn:[-5.3,1.8,0],autoDeploy:true})),false);
});

test('custom inventions preserve their own automatic activation setting',()=>{
 const custom=prepareInvention({...starters[2],autoDeploy:true,code:'api.status = "A custom ladder";'});
 assert.equal(shouldAutoDeploy(custom),true);
 assert.equal(shouldAutoDeploy({...custom,autoDeploy:false}),false);
 const modified=prepareInvention({...starters[2],autoDeploy:true});
 modified.phases[0].actions[0].strength=4;
 assert.equal(shouldAutoDeploy(modified),true);
});
