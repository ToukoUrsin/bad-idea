import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ConstructionOutline} from '../src/construction-outline';
import type {InventionOutline} from '../src/build-stream';
import {CodeRuntime,makeHeadlessView} from '../src/code-runtime';
import {Simulation,initPhysics} from '../src/simulation';

const part:InventionOutline['parts'][number]={shape:'box',position:[1,.2,-.3],rotation:[.1,.2,.3],scale:[.4,.5,.6],color:'#ffffff',animation:'spinY',solid:true};
const position={x:-6,y:.8,z:0},aim={x:1,y:0,z:0};
const outline=(mount:'free'|'player'='free'):InventionOutline=>({mount,spawn:[3,1,-2],parts:[part]});

test('construction starts hidden, appears immediately, and ignores late updates after completion',()=>{
 const preview=new ConstructionOutline();
 assert.equal(preview.group.visible,false);assert.equal(preview.parts.children.length,0);
 preview.update(outline());assert.equal(preview.group.visible,false);
 preview.begin(position,aim);
 assert.equal(preview.group.visible,true);assert.equal(preview.marker.visible,true);
 assert.equal(preview.parts.visible,false);
 assert.ok(Math.abs(preview.marker.position.x-position.x-2.6)<1e-10);
 preview.update(outline());assert.equal(preview.parts.children.length,1);
 preview.end();preview.update(outline());
 assert.equal(preview.group.visible,false);assert.equal(preview.parts.children.length,0);
 preview.begin(position,aim);assert.equal(preview.marker.visible,true);preview.end();
});

test('free construction remains at declared spawn as the player moves and looks around',()=>{
 const preview=new ConstructionOutline();preview.begin(position,aim);preview.update(outline());
 preview.render({x:5,y:2,z:4},.8,1/60);
 assert.deepEqual(preview.parts.position.toArray(),[3,1,-2]);
 assert.equal(preview.parts.rotation.y,0);assert.equal(preview.marker.visible,false);
 const mesh=preview.parts.children[0];
 assert.deepEqual(mesh.position.toArray(),part.position);assert.deepEqual(mesh.scale.toArray(),part.scale);
 assert.deepEqual([mesh.rotation.x,mesh.rotation.y,mesh.rotation.z],part.rotation);
 preview.end();
});

test('player construction uses the invention pose and retains a visible ahead-of-player cue',()=>{
 const preview=new ConstructionOutline();preview.begin(position,aim);preview.update(outline('player'));
 const player={x:2,y:3,z:4},yaw=-Math.PI/2;
 preview.render(player,yaw,1/60);
 assert.deepEqual(preview.parts.position.toArray(),[2,3,4]);assert.equal(preview.parts.rotation.y,yaw+Math.PI/2);
 assert.equal(preview.marker.visible,true);assert.equal(preview.marker.position.x,4.6);
 const actual=new THREE.Vector3();preview.parts.children[0].getWorldPosition(actual);
 assert.deepEqual(actual.toArray(),[3,3.2,3.7]);
 preview.render(player,.75,1/60);assert.equal(preview.parts.rotation.y,.75+Math.PI/2);
 preview.end();
});

test('streamed additions reuse existing meshes and shared primitive geometry',()=>{
 const preview=new ConstructionOutline();preview.begin(position,aim);preview.update(outline());
 const mesh=preview.parts.children[0] as THREE.Mesh,geometry=mesh.geometry;
 preview.update({...outline(),parts:[part,{...part,position:[0,0,0]}]});
 assert.equal(preview.parts.children[0],mesh);
 assert.equal((preview.parts.children[1] as THREE.Mesh).geometry,geometry);
 const edges=mesh.children[0] as THREE.LineSegments;
 assert.equal((preview.parts.children[1].children[0] as THREE.LineSegments).geometry,edges.geometry);
 preview.render(position,0,1/60);assert.equal(mesh.geometry,geometry);
 preview.update({...outline(),parts:[{...part,shape:'cone'}]});
 assert.equal(preview.parts.children[0],mesh);assert.equal(preview.parts.children.length,1);
 assert.equal((mesh.geometry as THREE.ConeGeometry).parameters.radialSegments,4);
 preview.end();
});

test('ending or replacing construction disposes every allocated geometry and material exactly once',()=>{
 const preview=new ConstructionOutline();preview.begin(position,aim);
 preview.update({...outline(),parts:[part,{...part,shape:'sphere'}]});
 const resources=new Set<THREE.BufferGeometry|THREE.Material>();
 preview.group.traverse(object=>{
  if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){
   resources.add(object.geometry);
   for(const material of Array.isArray(object.material)?object.material:[object.material])resources.add(material);
  }
 });
 const disposed=new Map<THREE.BufferGeometry|THREE.Material,number>();
 for(const resource of resources)resource.addEventListener('dispose',()=>disposed.set(resource,(disposed.get(resource)??0)+1));
 preview.begin(position,aim);
 assert.equal(disposed.size,resources.size);for(const count of disposed.values())assert.equal(count,1);
 preview.end();preview.end();for(const count of disposed.values())assert.equal(count,1);
 assert.equal(preview.parts.children.length,0);assert.equal(preview.marker.children.length,0);
});

test('reduced motion leaves the outline opacity and geometry stationary',()=>{
 const preview=new ConstructionOutline();preview.reducedMotion=true;preview.begin(position,aim);preview.update(outline());
 const edges=preview.parts.children[0].children[0] as THREE.LineSegments<THREE.BufferGeometry,THREE.LineBasicMaterial>;
 const before=edges.material.opacity,positionBefore=preview.parts.position.clone(),rotationBefore=preview.parts.rotation.clone();
 preview.render(position,0,2);preview.render(position,0,2);
 assert.equal(edges.material.opacity,before);assert.ok(preview.parts.position.equals(positionBefore));assert.ok(preview.parts.rotation.equals(rotationBefore));
 preview.reducedMotion=false;preview.render(position,0,.5);assert.notEqual(edges.material.opacity,before);
 preview.end();
});

test('partial geometry stays independent of authored-runtime cleanup and adds no physics',async()=>{
 await initPhysics();
 const sim=new Simulation(),view=makeHeadlessView(),preview=new ConstructionOutline();
 view.scene.add(preview.group);
 const runtime=new CodeRuntime(sim,view,()=>{},()=>{},'game.view.mesh("box",[1,1,1],"#ffffff",[0,0,0]);return {use(){}};');
 const bodies=sim.world.bodies.len(),colliders=sim.world.colliders.len();
 preview.begin(position,aim);preview.update(outline());
 const mesh=preview.parts.children[0] as THREE.Mesh;let disposed=false;
 mesh.geometry.addEventListener('dispose',()=>disposed=true);
 assert.equal(sim.world.bodies.len(),bodies);assert.equal(sim.world.colliders.len(),colliders);
 runtime.dispose();
 assert.equal(preview.group.parent,view.scene);assert.equal(preview.parts.children[0],mesh);
 assert.equal(disposed,false);assert.equal(preview.group.visible,true);
 preview.end();sim.dispose();
});
