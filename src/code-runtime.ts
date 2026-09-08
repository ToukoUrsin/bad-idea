import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {CodeBudget,compileCode} from './code-compiler';
import type {Simulation,WorldEntity} from './simulation';
import type {GameView} from './view';
export interface Hooks {use?:()=>void;hit?:(event:unknown)=>void;step?:(dt:number)=>void;render?:(dt:number)=>void;dispose?:()=>void;[key:string]:unknown}
export type RuntimeView=Pick<GameView,'scene'|'camera'|'invention'|'guard'|'gate'|'key'|'mesh'|'yaw'|'pitch'> & Partial<GameView>;
export function makeHeadlessView():RuntimeView {
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(80,1,.035,120),invention=new THREE.Group(),guard=new THREE.Group(),gate=new THREE.Group(),key=new THREE.Group();scene.add(invention,guard,gate,key);
 return {scene,camera,invention,guard,gate,key,yaw:-Math.PI/2,pitch:0,mesh(shape,scale,color,position,parent=scene){
  const geometry=shape==='sphere'?new THREE.SphereGeometry(.5,12,8):shape==='cylinder'?new THREE.CylinderGeometry(.5,.5,1,12):shape==='cone'?new THREE.ConeGeometry(.5,1,12):shape==='torus'?new THREE.TorusGeometry(.5,.13,8,16):new THREE.BoxGeometry(1,1,1);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color}));mesh.scale.fromArray(scale);mesh.position.fromArray(position);parent.add(mesh);return mesh;
 }};
}
export class CodeRuntime {
 hooks:Hooks={};budget=new CodeBudget();error='';status='';disposed=false;root=new THREE.Group();
 game:any;initialObjects=new Set<THREE.Object3D>();initialBodies=new Set<number>();initialColliders=new Set<number>();
 constructor(public sim:Simulation,public view:RuntimeView,public onError:(message:string)=>void=()=>{},public playSound:(...args:number[])=>void=()=>{},public source=sim.invention?.code||'',public role:'invention'|'room'='invention',public direct=false){
  view.scene.traverse(o=>this.initialObjects.add(o));sim.world.forEachRigidBody(b=>this.initialBodies.add(b.handle));sim.world.forEachCollider(c=>this.initialColliders.add(c.handle));
  this.root.name=role==='room'?'Astra room objects':'Astra runtime objects';view.scene.add(this.root);
  this.game={THREE,RAPIER,sim,view,world:sim.world,scene:view.scene,camera:view.camera,root:this.root,
   get player(){return sim.player;},get aim(){return sim.aim;},get input(){return {move:sim.manual,aim:sim.aim,grounded:sim.grounded};},
   entities:sim.entities,challenge:sim.arena,
   removeEntity:(entity:string|WorldEntity)=>{const e=typeof entity==='string'?sim.entities.find(e=>e.id===entity):entity;if(!e||e.removed)return;sim.removeEntity(e);view.removeEntity?.(e);},
   say:(text:string)=>{this.status=String(text);sim.note(String(text));},sound:(frequency=180,duration=.12,volume=.07,end=50)=>this.playSound(frequency,duration,volume,end),
  };
  try{
   this.hooks=this.track(()=>(direct?new Function('game',source):compileCode(source,['game'],this.budget))(this.game));
   if(!this.hooks||typeof this.hooks!=='object')throw Error('The invention must return its behavior callbacks.');
   if(typeof this.hooks.use!=='function'&&typeof this.hooks.step!=='function')throw Error('The invention has no executable behavior.');
  }catch(e){this.fail(e);}
  if(role==='room')sim.room=this;else sim.extension=this;
 }
 ownedObjects=new Set<THREE.Object3D>();ownedBodies=new Set<number>();ownedColliders=new Set<number>();
 track<T>(fn:()=>T):T{
  // Synchronous callbacks let ownership be captured without scanning the whole
  // scene every frame or accidentally deleting the other runtime's objects.
  const world=this.sim.world,scene=this.view.scene,body=world.createRigidBody,collider=world.createCollider,add=scene.add;
  const ownBody:typeof body=(desc)=>{const b=body.call(world,desc);this.ownedBodies.add(b.handle);return b;};
  const ownCollider:typeof collider=(desc,parent)=>{const c=collider.call(world,desc,parent);this.ownedColliders.add(c.handle);return c;};
  const owned=this.ownedObjects;
  const ownAdd:typeof add=function(...objects){for(const o of objects)owned.add(o);return add.apply(scene,objects);};
  world.createRigidBody=ownBody;world.createCollider=ownCollider;scene.add=ownAdd;
  try{return fn();}finally{if(world.createRigidBody===ownBody)world.createRigidBody=body;if(world.createCollider===ownCollider)world.createCollider=collider;if(scene.add===ownAdd)scene.add=add;}
 }
 invoke(name:keyof Hooks,...args:unknown[]){if(this.error||this.disposed)return;const fn=this.hooks[name];if(typeof fn!=='function')return;try{this.budget.start();const result=this.track(()=>fn.apply(this.hooks,args));if(result&&typeof result.then==='function')throw Error('Use synchronous game callbacks and advance animation with dt.');}catch(e){this.fail(e);}}
 hit(event:unknown){this.invoke('hit',event);}
 use(){if(this.role==='invention')this.sim.inventionActive=true;this.invoke('use');}
 step(dt:number){this.invoke('step',dt);}
 render(dt:number){this.invoke('render',dt);}
 fail(e:unknown){this.error=e instanceof Error?e.message:String(e);this.sim.inventionActive=false;this.sim.note((this.role==='room'?'Room':'Invention')+' needs repair: '+this.error);this.onError(this.error);}
 dispose(){if(this.disposed)return;try{this.budget.start();this.hooks.dispose?.();}catch{/* Always finish cleanup even if authored disposal fails. */}this.disposed=true;
  for(const o of this.ownedObjects){o.removeFromParent();o.traverse(child=>{if(child instanceof THREE.Mesh){child.geometry.dispose();for(const m of Array.isArray(child.material)?child.material:[child.material])m.dispose();}});}
  for(const handle of this.ownedBodies){const body=this.sim.world.getRigidBody(handle);if(body)this.sim.world.removeRigidBody(body);}
  for(const handle of this.ownedColliders){const collider=this.sim.world.getCollider(handle);if(collider)this.sim.world.removeCollider(collider,true);}
  this.root.removeFromParent();this.root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
  if(this.sim.room===this)this.sim.room=null;
  if(this.sim.extension===this)this.sim.extension=null;
 }
}
