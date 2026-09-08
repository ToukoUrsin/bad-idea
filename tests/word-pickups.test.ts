import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {firstArena} from '../src/arena.ts';
import {initPhysics,Simulation} from '../src/simulation.ts';
import {canCollectWordPickup,planWordPickups,WordPickups,WORD_PICKUP_RADIUS} from '../src/word-pickups.ts';

await initPhysics();
const words=['rocket','balloon','bridge','ladder','rope','wings','spring','magnet'];
function room(){const sim=new Simulation(0,{...firstArena,round:4});sim.start(null);return sim;}

test('all eight words have supported, reachable positions without a physics tick or a spawn auto-collect',()=>{
 const sim=room();
 try{
  const layout=planWordPickups(sim,words);
  assert.equal(layout.length,8);
  for(const pickup of layout){
   assert.ok(Math.hypot(pickup.position.x+6,pickup.position.z)>WORD_PICKUP_RADIUS);
   assert.ok(Math.abs(pickup.floorY)<.001);
   assert.equal(canCollectWordPickup(sim,pickup),false);
   sim.player.setTranslation({x:pickup.position.x,y:.79,z:pickup.position.z},true);
   assert.equal(canCollectWordPickup(sim,pickup),true);
   sim.player.setTranslation({x:-6,y:.85,z:0},true);
  }
 }finally{sim.dispose();}
});

test('placement respects newly generated walls, pits and inaccessible upper floors',()=>{
 const sim=room();
 try{
  sim.removeEntity(sim.entities.find(e=>e.id==='ground')!);
  sim.box(-6,-.35,0,1.5,.35,1.5,'safe-spawn-floor');
  sim.box(-3.3,2.7,0,1.1,.3,2,'upper-floor');
  sim.box(-4.35,1.5,0,.035,1.5,4,'thin-wall');
  const layout=planWordPickups(sim,words);
  assert.equal(layout.length,8,'the safe spawn patch is enough for the whole vocabulary');
  for(const pickup of layout){
   assert.ok(pickup.position.x>=-7.23&&pickup.position.x<=-4.77);
   assert.ok(Math.abs(pickup.position.z)<=1.23);
   assert.ok(Math.abs(pickup.floorY)<.001);
  }
 }finally{sim.dispose();}
});

test('the pickup cannot be collected through a wall, across floors, or after its support disappears',()=>{
 const sim=room();
 try{
  const pickup=planWordPickups(sim,['rope'])[0];
  sim.player.setTranslation({x:pickup.position.x-.65,y:.79,z:pickup.position.z},true);
  assert.equal(canCollectWordPickup(sim,pickup),true);
  sim.box(pickup.position.x-.32,1,0,.025,1,1,'collection-wall');
  assert.equal(canCollectWordPickup(sim,pickup),false);
  sim.removeEntity(sim.entities.find(e=>e.id==='collection-wall')!);
  sim.player.setTranslation({x:pickup.position.x,y:3.79,z:pickup.position.z},true);
  assert.equal(canCollectWordPickup(sim,pickup),false);
  sim.player.setTranslation({x:pickup.position.x,y:1.2,z:pickup.position.z},true);
  assert.equal(canCollectWordPickup(sim,pickup),false,'airborne players must land before collecting');
  sim.player.setTranslation({x:pickup.position.x,y:.79,z:pickup.position.z},true);
  sim.removeEntity(sim.entities.find(e=>e.id==='ground')!);
  assert.equal(canCollectWordPickup(sim,pickup),false);
 }finally{sim.dispose();}
});

test('collection fires once per registered word and saved words stay absent across recreation',()=>{
 const sim=room(),scene=new THREE.Scene(),collected:string[]=[];
 const pickups=new WordPickups(sim,scene,['rope','rope','wings'],['unregistered'],word=>collected.push(word));
 try{
  assert.equal(pickups.layout.length,2);
  assert.deepEqual(pickups.remaining,['rope','wings']);
  const first=pickups.layout[0];
  sim.player.setTranslation({x:first.position.x,y:.79,z:first.position.z},true);
  sim.state='ready';pickups.step();assert.deepEqual(collected,[]);
  sim.state='running';pickups.step();pickups.step();assert.deepEqual(collected,['rope']);
  pickups.dispose();
  sim.player.setTranslation({x:-6,y:.85,z:0},true);
  const recreated=new WordPickups(sim,scene,['rope','wings'],collected,word=>collected.push(word));
  assert.deepEqual(recreated.remaining,['wings']);
  assert.deepEqual(recreated.layout,pickups.layout,'remaining words keep stable positions across retry');
  recreated.dispose();assert.equal(scene.children.length,0);
 }finally{pickups.dispose();sim.dispose();}
});

test('placement never silently invents floor and caps the number of tiles',()=>{
 const sim=room();
 try{
  assert.equal(planWordPickups(sim,[...words,'engine']).length,8);
  sim.removeEntity(sim.entities.find(e=>e.id==='ground')!);
  const pickups=new WordPickups(sim,new THREE.Scene(),['rope'],[],()=>assert.fail('no pickup exists'));
  assert.deepEqual(pickups.layout,[]);assert.deepEqual(pickups.unplaced,['rope']);pickups.dispose();
 }finally{sim.dispose();}
});

test('labels face the camera and disposal releases their resources exactly once',()=>{
 const sim=room(),scene=new THREE.Scene();
 const pickups=new WordPickups(sim,scene,['rope'],[],()=>{});
 try{
  const camera=new THREE.PerspectiveCamera();camera.rotation.set(.1,.5,0);camera.updateMatrixWorld();
  const resources:Array<THREE.BufferGeometry|THREE.Material>=[];
  pickups.root.traverse(object=>{if(object instanceof THREE.Mesh){resources.push(object.geometry,...(Array.isArray(object.material)?object.material:[object.material]));}});
  let disposed=0;for(const resource of resources)resource.addEventListener('dispose',()=>disposed++);
  pickups.render(camera,2);
  const label=pickups.root.children[0].children[0];
  assert.ok(label.quaternion.angleTo(camera.quaternion)<.00001);
  assert.ok(Math.abs(label.position.y-pickups.layout[0].position.y)<=.045);
  pickups.dispose();pickups.dispose();assert.equal(disposed,resources.length);assert.equal(scene.children.length,0);
 }finally{pickups.dispose();sim.dispose();}
});
