import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type {Simulation,V} from './simulation';

export const WORD_PICKUP_RADIUS=.82;
const MAX_PICKUPS=8;
const STANDING_HEIGHT=.79;
const LABEL_HEIGHT=1.3;
const rotation={x:0,y:0,z:0,w:1};
const zero={x:0,y:0,z:0};

export type WordPickup={readonly word:string;readonly position:V;readonly floorY:number};

function solidColliders(sim:Simulation){
 const colliders:RAPIER.Collider[]=[];
 sim.world.forEachCollider(c=>{if(c.isEnabled()&&!c.isSensor()&&c.parent()?.handle!==sim.player.handle)colliders.push(c);});
 return colliders;
}

// Individual collider queries include room geometry before its first world.step().
function floorBelow(colliders:readonly RAPIER.Collider[],x:number,z:number,top:number,distance:number){
 const ray=new RAPIER.Ray({x,y:top,z},{x:0,y:-1,z:0});
 let nearest=Infinity,normalY=0;
 for(const collider of colliders){
  const hit=collider.castRayAndGetNormal(ray,distance,true);
  if(hit&&hit.timeOfImpact<nearest){nearest=hit.timeOfImpact;normalY=hit.normal.y;}
 }
 return Number.isFinite(nearest)&&normalY>.8?top-nearest:null;
}

function standingFloor(colliders:readonly RAPIER.Collider[],x:number,z:number,floorY:number){
 const floor=floorBelow(colliders,x,z,floorY+.24,.48);
 if(floor===null||Math.abs(floor-floorY)>.12)return null;
 // A centre ray alone would accept a tile balanced over the edge of a pit.
 for(const [dx,dz] of [[-.27,-.27],[-.27,.27],[.27,-.27],[.27,.27]]){
  const edge=floorBelow(colliders,x+dx,z+dz,floorY+.24,.48);
  if(edge===null||Math.abs(edge-floor)>.08)return null;
 }
 const position={x,y:floor+STANDING_HEIGHT,z};
 const capsule=new RAPIER.Capsule(.4,.36);
 if(colliders.some(c=>c.intersectsShape(capsule,position,rotation)))return null;
 return floor;
}

function reachable(colliders:readonly RAPIER.Collider[],spawn:V,x:number,z:number,floorY:number){
 const endFloor=standingFloor(colliders,x,z,floorY);
 if(endFloor===null)return null;
 const start={x:spawn.x,y:floorY+STANDING_HEIGHT,z:spawn.z};
 const velocity={x:x-spawn.x,y:endFloor-floorY,z:z-spawn.z};
 const capsule=new RAPIER.Capsule(.4,.36);
 // Sweep a whole walking capsule, so even very thin walls block the path.
 if(colliders.some(c=>c.castShape(zero,capsule,start,rotation,velocity,0,1,true)))return null;
 const steps=Math.ceil(Math.hypot(velocity.x,velocity.z)/.22);
 for(let step=1;step<steps;step++){
  const t=step/steps;
  if(standingFloor(colliders,spawn.x+velocity.x*t,spawn.z+velocity.z*t,floorY)===null)return null;
 }
 return endFloor;
}

/** Deterministic, supported placements that the player can walk to from spawn. */
export function planWordPickups(sim:Simulation,words:readonly string[]):WordPickup[]{
 const unique=[...new Set(words.map(word=>word.trim().toLowerCase()).filter(Boolean))].slice(0,MAX_PICKUPS);
 if(!unique.length)return [];
 const spawn={...sim.position},colliders=solidColliders(sim);
 const floorY=floorBelow(colliders,spawn.x,spawn.z,spawn.y,1.1);
 if(floorY===null)return [];
 const spots:V[]=[];
 // A few steps of exploration first; the inner rings fit the guaranteed safe spawn patch.
 for(const radius of [2.2,3.3,1.25,1.05])for(const angle of [0,-Math.PI/4,Math.PI/4,-Math.PI/2,Math.PI/2,-3*Math.PI/4,3*Math.PI/4,Math.PI]){
  const x=spawn.x+Math.cos(angle)*radius,z=spawn.z+Math.sin(angle)*radius;
  if(Math.abs(x)>8.55||Math.abs(z)>4.75||spots.some(p=>Math.hypot(p.x-x,p.z-z)<.72))continue;
  const floor=reachable(colliders,spawn,x,z,floorY);
  if(floor!==null)spots.push({x,y:floor+LABEL_HEIGHT,z});
  if(spots.length>=unique.length)return unique.map((word,index)=>({word,position:spots[index],floorY:spots[index].y-LABEL_HEIGHT}));
 }
 return spots.map((position,index)=>({word:unique[index],position,floorY:position.y-LABEL_HEIGHT}));
}

/** Collection requires proximity, standing support on the same floor, and clear sight. */
export function canCollectWordPickup(sim:Simulation,pickup:WordPickup){
 if(sim.state!=='running')return false;
 const p=sim.position,target=pickup.position;
 if(Math.hypot(p.x-target.x,p.z-target.z)>WORD_PICKUP_RADIUS||Math.abs(p.y-(pickup.floorY+.75))>.32)return false;
 const colliders=solidColliders(sim);
 const playerFloor=floorBelow(colliders,p.x,p.z,p.y,.91);
 const pickupFloor=floorBelow(colliders,target.x,target.z,pickup.floorY+.24,.48);
 if(playerFloor===null||pickupFloor===null||Math.abs(playerFloor-pickup.floorY)>.12||Math.abs(pickupFloor-pickup.floorY)>.12)return false;
 const origin={x:p.x,y:p.y+.25,z:p.z};
 const delta={x:target.x-origin.x,y:target.y-origin.y,z:target.z-origin.z};
 const distance=Math.hypot(delta.x,delta.y,delta.z);
 if(distance<.001)return true;
 const ray=new RAPIER.Ray(origin,{x:delta.x/distance,y:delta.y/distance,z:delta.z/distance});
 return !colliders.some(c=>c.castRay(ray,Math.max(0,distance-.02),true)>=0);
}

function makeLabel(word:string){
 if(typeof document==='undefined')return null;
 const canvas=document.createElement('canvas');canvas.width=768;canvas.height=320;
 const context=canvas.getContext('2d');if(!context)return null;
 context.clearRect(0,0,canvas.width,canvas.height);
 context.fillStyle='#effdff';context.beginPath();context.roundRect(8,8,752,304,44);context.fill();
 context.strokeStyle='#30b8da';context.lineWidth=8;context.stroke();
 context.textAlign='center';context.textBaseline='middle';
 context.fillStyle='#06465a';
 let fontSize=144;context.font=`700 ${fontSize}px system-ui, sans-serif`;
 while(context.measureText(word).width>672&&fontSize>32){fontSize-=4;context.font=`700 ${fontSize}px system-ui, sans-serif`;}
 context.fillText(word,384,166,672);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 return texture;
}

type Tile={pickup:WordPickup;group:THREE.Group;label:THREE.Mesh;ring:THREE.Mesh;collected:boolean};

export class WordPickups{
 readonly layout:readonly WordPickup[];
 readonly unplaced:readonly string[];
 readonly root=new THREE.Group();
 private tiles:Tile[]=[];
 private textures:THREE.Texture[]=[];
 private disposed=false;
 private reducedMotion=typeof window==='undefined'?null:window.matchMedia?.('(prefers-reduced-motion: reduce)')??null;
 constructor(private sim:Simulation,scene:THREE.Scene,words:readonly string[],collected:readonly string[],private onCollect:(word:string)=>void){
  const registered=[...new Set(words.map(word=>word.trim().toLowerCase()).filter(Boolean))].slice(0,MAX_PICKUPS);
  const unlocked=new Set(collected.map(word=>word.trim().toLowerCase()));
  // Plan all registered words first so reloads never reshuffle the remaining tiles.
  this.layout=planWordPickups(sim,registered);
  this.unplaced=registered.filter(word=>!this.layout.some(p=>p.word===word)&&!unlocked.has(word));
  this.root.name='word-pickups';scene.add(this.root);
  for(const pickup of this.layout){
   if(unlocked.has(pickup.word))continue;
   const group=new THREE.Group();group.name=`word-pickup:${pickup.word}`;this.root.add(group);
   const texture=makeLabel(pickup.word);if(texture)this.textures.push(texture);
   const label=new THREE.Mesh(new THREE.PlaneGeometry(.72,.30),new THREE.MeshBasicMaterial({map:texture,color:texture?'#ffffff':'#30b8da',transparent:true,alphaTest:.05,side:THREE.DoubleSide,toneMapped:false}));
   label.position.set(pickup.position.x,pickup.position.y,pickup.position.z);group.add(label);
   const ring=new THREE.Mesh(new THREE.TorusGeometry(.24,.023,8,40),new THREE.MeshBasicMaterial({color:'#30b8da',transparent:true,opacity:.8,toneMapped:false}));
   ring.rotation.x=-Math.PI/2;ring.position.set(pickup.position.x,pickup.floorY+.035,pickup.position.z);group.add(ring);
   this.tiles.push({pickup,group,label,ring,collected:false});
  }
 }
 get remaining(){return this.tiles.filter(tile=>!tile.collected).map(tile=>tile.pickup.word);}
 step(){
  if(this.disposed||this.sim.state!=='running')return;
  for(const tile of this.tiles){
   if(tile.collected||!canCollectWordPickup(this.sim,tile.pickup))continue;
   tile.collected=true;tile.group.visible=false;
   this.onCollect(tile.pickup.word);
  }
 }
 render(camera:THREE.Camera,time:number){
  if(this.disposed)return;
  const orientation=camera.getWorldQuaternion(new THREE.Quaternion());
  for(let index=0;index<this.tiles.length;index++){
   const tile=this.tiles[index];if(tile.collected)continue;
   tile.label.quaternion.copy(orientation);
   tile.label.position.y=tile.pickup.position.y+(this.reducedMotion?.matches?0:Math.sin(time*1.8+index*.8)*.045);
  }
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;
  this.root.removeFromParent();
  this.root.traverse(object=>{
   if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}
  });
  for(const texture of this.textures)texture.dispose();
  this.root.clear();this.tiles=[];this.textures=[];
 }
}
