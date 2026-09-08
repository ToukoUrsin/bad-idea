import type {Arena} from './arena';
import type {LevelId} from './levels';
import RAPIER from '@dimforge/rapier3d-compat';
import {prepareInvention,type Invention} from './spec';
export type V={x:number,y:number,z:number};
const v=(x=0,y=0,z=0):V=>({x,y,z});
const distance=(a:V,b:V)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
let ready:Promise<void>|undefined;
export function initPhysics(){return ready??=RAPIER.init();}
export type WorldEntity={id:string,collider:RAPIER.Collider|null,position:V,half:V,removed:boolean};
export interface SimulationExtension {use():void;step(dt:number):void;dispose():void;error:string;status:string;hit?:(event:unknown)=>void;}
export class Simulation{
 room:SimulationExtension|null=null;winCondition:((p:V)=>boolean)|null=null;disrupted=0;uses=0;
 entities:WorldEntity[]=[];extension:SimulationExtension|null=null;guardEnabled=true;
 world:RAPIER.World;player:RAPIER.RigidBody;gate:RAPIER.Collider|null=null;
 elapsed=0;phase=0;phaseTime=0;phaseEntered=true; phaseDone=false;
 autoRun=false;inventionActive=false;
 state:'ready'|'running'|'won'|'lost'='ready';reason='';invention:Invention|null=null;
 self=v();guard=v(1,0,-2.4);frozen=0;distracted=0;keyOwner:'guard'|'self'|'player'='guard';gateOpen=false;
 events:string[]=[];manual:V|null=null;maxHeight=0;
 aim=v(1,0,0);climbing=false;invisible=false;beam=0;beamHit=false;bounceCooldown=0;objectColliders:RAPIER.Collider[]=[];
 grounded=false;previous=v(-6,.85,0);coyote=0;jumpBuffer=0;landingSpeed=0;alert=0;
 jump(){this.jumpBuffer=.13;}
 constructor(public level:LevelId=0,public arena:Arena|null=null){
  this.world=new RAPIER.World(v(0,-9.81,0));this.world.timestep=1/60;
  if(arena){
   this.guardEnabled=false;this.guard=v(100,0,100);
   this.box(0,-.35,0,10,.35,5.5,'ground');
   this.box(4,.8,-3.2,.24,.8,1.8,'wall-left');this.box(4,.8,3.2,.24,.8,1.8,'wall-right');
   this.gate=this.box(4,.8,0,.18,.8,1.4,'gate');
   this.box(-9.2,2.5,0,.2,2.5,5.5);for(const z of [-5.4,5.4])this.box(0,2.5,z,10,2.5,.2);
  }else if(level===0){
  this.box(0,-.35,0,10,.35,5.5,'ground');
  this.box(4,2,-3.2,.24,2,1.8,'wall-left');this.box(4,2,3.2,.24,2,1.8,'wall-right');
  this.gate=this.box(4,1.9,0,.18,1.9,1.4,'gate');
  this.box(-9.2,2.5,0,.2,2.5,5.5);this.box(0,2.5,-5.4,10,2.5,.2);this.box(0,2.5,5.4,10,2.5,.2);this.box(-5,1.5,-4.4,4,1.5,.95);
  for(const [x,z] of [[-7,3],[-3,-2.7],[-8,-2.5]])this.box(x,.45,z,.425,.425,.425);
  }else{
   this.gateOpen=true;this.guard=v(100,0,100);
   if(level===1){this.box(-5.5,-.35,0,4.5,.35,5.5,'near-bank');this.box(6.5,-.35,0,3.5,.35,5.5,'far-bank');}
   else {this.box(0,-.35,0,10,.35,5.5,'ground');this.box(6.75,2,0,3.25,2,5.5,'rooftop');}
   this.box(-9.2,2.5,0,.2,2.5,5.5);for(const z of [-5.4,5.4])this.box(0,.6,z,10,.6,.2);
  }
  if(level===0&&!arena)this.entities.push({id:'guard',collider:null,position:this.guard,half:v(.4,.9,.4),removed:false});
  this.player=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-6,.85,0).lockRotations().setLinearDamping(0).setCcdEnabled(true));
  this.world.createCollider(RAPIER.ColliderDesc.capsule(.4,.35).setMass(1).setFriction(0).setRestitution(0),this.player);
 }
 box(x:number,y:number,z:number,hx:number,hy:number,hz:number,id='structure-'+this.entities.length){const collider=this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx,hy,hz).setTranslation(x,y,z).setFriction(.4));this.entities.push({id,collider,position:v(x,y,z),half:v(hx,hy,hz),removed:false});return collider;}
 removeEntity(entity:WorldEntity){if(entity.removed)return;entity.removed=true;if(entity.collider?.isValid())this.world.removeCollider(entity.collider,true);if(entity.id==='gate'){this.gate=null;this.gateOpen=true;}if(entity.id==='guard')this.guardEnabled=false;}
 get position(){return this.player.translation();}
 get key(){return this.keyOwner==='player'?v(this.position.x,this.position.y+.25,this.position.z):this.keyOwner==='self'?v(this.self.x,this.self.y-.25,this.self.z):v(this.guard.x,this.guard.y+1.35,this.guard.z);}
 target(name:string):V{if(name==='player')return this.position;if(name==='self')return this.invention?.mount==='player'?this.position:this.self;if(name==='guard')return v(this.guard.x,this.guard.y+.8,this.guard.z);if(name==='key')return this.key;if(name==='gate')return v(4,1,0);return v(8,this.level===2?4.8:.8,0);}
 start(spec:Invention|null){this.state='running';this.equip(spec);}
 equip(spec:Invention|null){
  this.uses=0;this.maxHeight=this.position.y;
  this.extension?.dispose();this.extension=null;
  for(const c of this.objectColliders)this.world.removeCollider(c,true);this.objectColliders=[];
  this.invention=spec?prepareInvention(spec):null;spec=this.invention;
  this.phase=0;this.phaseTime=0;this.phaseEntered=true;this.phaseDone=false;this.inventionActive=false;this.invisible=false;
  this.self=spec?.mount==='free'?v(spec.spawn[0],spec.spawn[1],spec.spawn[2]):v(this.position.x,this.position.y,this.position.z);
  if(spec?.mount==='free'&&!spec.phases.some(p=>p.actions.some(a=>a.op==='seek'))){
   for(const part of spec.parts)if(part.solid){
    const [rx,ry,rz]=part.rotation,cx=Math.cos(rx/2),sx=Math.sin(rx/2),cy=Math.cos(ry/2),sy=Math.sin(ry/2),cz=Math.cos(rz/2),sz=Math.sin(rz/2);
    const q={x:sx*cy*cz+cx*sy*sz,y:cx*sy*cz-sx*cy*sz,z:cx*cy*sz+sx*sy*cz,w:cx*cy*cz-sx*sy*sz};
    const desc=RAPIER.ColliderDesc.cuboid(part.scale[0]/2,part.scale[1]/2,part.scale[2]/2).setTranslation(this.self.x+part.position[0],this.self.y+part.position[1],this.self.z+part.position[2]).setRotation(q).setFriction(.2);
    this.objectColliders.push(this.world.createCollider(desc));
   }
   if(spec.phases.some(p=>p.actions.some(a=>a.op==='bounce')))this.objectColliders.push(this.box(this.self.x,this.self.y,this.self.z,.85,.08,.85));
  }
 }
 activate(){
  if(!this.invention)return;if(this.disrupted>0){this.note('Recovering from the bird strike. Keep moving.');return;}this.uses++;
  if(this.invention.code){if(this.extension)this.extension.use();else this.note('Invention code is not attached. Re-equip it.');return;}
  if(this.disrupted<=0&&this.inventionActive&&!this.phaseDone){this.inventionActive=false;this.invisible=false;this.note('Invention stopped. Press F to restart.');return;}
  this.inventionActive=true;this.phase=0;this.phaseTime=0;this.phaseEntered=true;this.phaseDone=false;
 }
 note(s:string){if(this.events.at(-1)!==s)this.events.push(s);}
 tick(){if(this.state!=='running')return;
  const dt=1/60;this.disrupted=Math.max(0,this.disrupted-dt);this.invisible=false;this.climbing=false;this.beam=Math.max(0,this.beam-dt);this.bounceCooldown=Math.max(0,this.bounceCooldown-dt);this.elapsed+=dt;this.phaseTime+=dt;this.frozen=Math.max(0,this.frozen-dt);this.distracted=Math.max(0,this.distracted-dt);
  if(this.guardEnabled&&this.frozen===0&&this.distracted===0)this.guard.z=Math.sin(this.elapsed*.8-1.57)*2.4;
  const p=this.position;this.previous=v(p.x,p.y,p.z);this.maxHeight=Math.max(this.maxHeight,p.y);
  // Auto-run is input, never an LLM decision. Player can override with arrows/WASD.
  const velocity=this.player.linvel();const desired=this.manual||(this.autoRun?v(2.2,0,0):v());
  const hit=this.world.castRay(new RAPIER.Ray(p,v(0,-1,0)),.82,true,undefined,undefined,undefined,this.player);
  this.grounded=!!hit&&velocity.y<.5;
  this.coyote=this.grounded?.10:Math.max(0,this.coyote-dt);
  this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);
  this.landingSpeed=0;
  if(this.jumpBuffer>0&&this.coyote>0){this.player.setLinvel(v(velocity.x,4.8,velocity.z),true);this.jumpBuffer=0;this.coyote=0;this.grounded=false;}
  // Quick, equal response in every direction. Air steering retains momentum instead of snapping to walking speed.
  const vel=this.player.linvel(),moving=Math.hypot(desired.x,desired.z)>.01;
  const acceleration=this.grounded?(moving?38:46):7;
  let dx=desired.x-vel.x,dz=desired.z-vel.z;
  // Modest air resistance and steering keep powered launches controllable.
  const change=Math.hypot(dx,dz),ratio=this.grounded?Math.min(1,acceleration*dt/(change||1)):1-Math.exp(-1.4*dt);
  this.player.setLinvel(v(vel.x+dx*ratio,vel.y,vel.z+dz*ratio),true);
  this.player.resetForces(true);
  // A slightly weightier fall for an ordinary jump; inventions retain their authored physics.
  if(!this.inventionActive&&vel.y<0&&!this.grounded)this.player.addForce(v(0,-6,0),true);
  if(this.invention?.mount==='player')this.self=v(p.x,p.y,p.z);
  const ph=this.invention?.phases[this.phase];
  if(ph&&!this.phaseDone&&this.inventionActive){
   for(const a of ph.actions){const origin=this.target('self'),target=this.target(a.target);const near=distance(origin,target)<=a.radius;
    switch(a.op){
     case 'force':if(a.target==='player')this.player.addForce(v(a.vector[0]*a.strength,a.vector[1]*a.strength,a.vector[2]*a.strength),true);break;
     case 'impulse':if(this.phaseEntered&&a.target==='player')this.player.applyImpulse(v(a.vector[0]*a.strength,a.vector[1]*a.strength,a.vector[2]*a.strength),true);break;
     case 'seek':if(this.invention!.mount==='free'){const d=v(target.x+a.vector[0]-this.self.x,target.y+a.vector[1]-this.self.y,target.z+a.vector[2]-this.self.z),len=Math.hypot(d.x,d.y,d.z),step=Math.min(a.strength*dt,len);if(len>0)this.self=v(this.self.x+d.x/len*step,this.self.y+d.y/len*step,this.self.z+d.z/len*step);}break;
     case 'drag':if(a.target==='player'){const vel=this.player.linvel();if(vel.y<0)this.player.addForce(v(0,-vel.y*a.strength,0),true);}break;
     case 'cloak':if(a.target==='player')this.invisible=true;break;
     case 'freezeRay':if(a.target==='guard'){
      if(this.phaseEntered){this.beam=.2;this.beamHit=false;}
      const eye=v(p.x,p.y+.86,p.z),d=v(target.x-eye.x,target.y-eye.y,target.z-eye.z),len=Math.hypot(d.x,d.y,d.z);
      const dot=(d.x*this.aim.x+d.y*this.aim.y+d.z*this.aim.z)/(len||1);
      const blocked=this.world.castRay(new RAPIER.Ray(eye,v(d.x/(len||1),d.y/(len||1),d.z/(len||1))),Math.max(0,len-.3),true,undefined,undefined,undefined,this.player);
      if(len<=a.radius&&dot>.965&&!blocked){this.frozen=Math.max(this.frozen,Math.min(a.strength,10));this.beamHit=true;if(this.phaseEntered)this.note('Direct hit. Guard frozen.');}
      else if(this.phaseEntered)this.note('Missed. Aim at the guard within '+a.radius+'m and press F again.');
     }break;
     case 'climb':if(a.target==='player'&&this.invention!.mount==='free'&&Math.hypot(p.x-this.self.x,p.z-this.self.z)<=Math.min(a.radius,1.3)&&desired.x>.1&&p.y<a.vector[1]+.1){
      const vel=this.player.linvel();this.climbing=true;
      if(p.y<a.vector[1]-.05){
       const gripX=this.self.x-.55+Math.min(p.y,5)*.1;
       this.player.setLinvel(v(Math.max(-3,Math.min(3,(gripX-p.x)*8)),Math.min(a.strength,3.5),Math.max(-3,Math.min(3,(this.self.z-p.z)*8))),true);
      }else this.player.setLinvel(v(vel.x,.164,vel.z),true);
     }break;
     case 'bounce':if(a.target==='player'&&this.invention!.mount==='free'&&this.bounceCooldown===0&&Math.hypot(p.x-this.self.x,p.z-this.self.z)<=Math.min(a.radius,1.2)&&p.y>=this.self.y+.65&&p.y<=this.self.y+1.3&&this.player.linvel().y<=.5){
      this.player.setLinvel(v(a.vector[0],Math.min(12,a.vector[1]),a.vector[2]),true);this.bounceCooldown=.6;this.note('BOING. Steer your landing with WASD.');
     }break;
     case 'freeze':if(a.target==='guard'&&near){if(this.frozen===0)this.note('Guard frozen. Excellent manners.');this.frozen=Math.max(this.frozen,Math.min(a.strength,10));}break;
     case 'grab':if(a.target==='key'&&this.invention!.mount==='free'&&this.keyOwner==='guard'&&distance(origin,this.key)<=Math.min(a.radius,1.2)){this.keyOwner='self';this.distracted=5;this.note('Your invention stole the key!');}break;
     case 'deliver':if(a.target==='player'&&this.keyOwner==='self'&&distance(origin,p)<=Math.min(a.radius,1.5)){this.keyOwner='player';this.note('Key delivered. Head for the gate.');}break;
     case 'attract':if(a.target==='player'){const d=v(origin.x-p.x,origin.y-p.y,origin.z-p.z),len=Math.hypot(d.x,d.y,d.z);if(len>.1)this.player.addForce(v(d.x/len*a.strength,d.y/len*a.strength,d.z/len*a.strength),true);}break;
     case 'teleport':if(a.target==='player'&&this.phaseEntered){
      const len=Math.hypot(...a.vector),ratio=Math.min(1,6/(len||1)),end=v(p.x+a.vector[0]*ratio,Math.max(.8,p.y+a.vector[1]*ratio),p.z+a.vector[2]*ratio);
      const collision=this.world.intersectionWithShape(end,{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.4,.35),undefined,undefined,undefined,this.player);
      if(!collision&&Math.abs(end.x)<9.6&&Math.abs(end.z)<5){this.player.setTranslation(end,true);this.player.setLinvel(v(),true);this.note('Space folded. Try to act normal.');}
      else this.note('No room to materialize. Aim for clear ground.');
     }break;
    }
   }
   this.phaseEntered=false;const c=ph.until,t=this.target(c.target);let done=false;
   if(c.kind==='time')done=this.phaseTime>=c.value;
   if(c.kind==='near')done=distance(this.target('self'),t)<c.value;
   if(c.kind==='above')done=t.y>c.value;
   if(c.kind==='below')done=t.y<c.value;
   if(c.kind==='falling')done=this.player.linvel().y<-.5;
   if(c.kind==='hasKey')done=this.keyOwner==='self'||this.keyOwner==='player';
   if(done){if(this.phase<this.invention!.phases.length-1){this.phase++;this.phaseTime=0;this.phaseEntered=true;}else this.phaseDone=true;}
  }
  if(this.disrupted<=0)this.extension?.step(dt);
  this.room?.step(dt);
  if(this.state!=='running')return;
  const falling=this.player.linvel().y;
  if(this.invention?.mount==='free'&&this.keyOwner==='player'&&this.phaseDone&&this.invention.phases.some(ph=>ph.actions.some(a=>a.op==='deliver'))){
   const park=v(p.x-this.aim.x*1.5-this.aim.z*1.5,p.y+1.7,p.z-this.aim.z*1.5+this.aim.x*1.5),d=v(park.x-this.self.x,park.y-this.self.y,park.z-this.self.z),r=Math.min(1,dt*3);
   this.self=v(this.self.x+d.x*r,this.self.y+d.y*r,this.self.z+d.z*r);
  }
  this.world.step();
  if(falling< -1&&this.player.linvel().y>falling*.3)this.landingSpeed=-falling;
  const now=this.position;
  if((!this.guardEnabled||this.frozen>0||this.invisible)&&this.keyOwner==='guard'&&distance(now,this.target('guard'))<1.5){this.keyOwner='player';this.note('Borrowed the key. Permanently.');}
  if(this.keyOwner==='player'&&!this.gateOpen&&distance(now,v(4,.8,0))<2){this.gateOpen=true;if(this.gate){const entity=this.entities.find(e=>e.id==='gate');if(entity)this.removeEntity(entity);else{this.world.removeCollider(this.gate,true);this.gate=null;}}this.note('Gate unlocked. Freedom ahead.');}
  if(this.winCondition?this.winCondition(now):(now.x>6.5&&now.x<10&&Math.abs(now.z)<4.5&&(this.level===2?now.y>4.65&&now.y<7:now.y<3))){this.state='won';this.reason='A terrible idea. A beautiful escape.';return;}
  const threat=this.guardEnabled&&!this.invisible&&this.frozen===0&&this.distracted===0&&distance(now,this.target('guard'))<1.65;
  this.alert=Math.max(0,Math.min(1,this.alert+(threat?dt*1.8:-dt*2.5)));
  if(this.alert>=1){this.fail('Caught red-handed. Invent a distraction.');return;}
  if(now.y< -2||Math.abs(now.z)>7||Math.abs(now.x)>13){this.fail('You escaped the courtyard. And the planet.');return;}
  if(this.autoRun&&this.elapsed>22)this.fail(now.x>2.7&&now.x<4.5?'The wall remains unconvinced. Get a key, or go over it.':'That needs a little more invention.');
 }
 fail(reason:string){this.state='lost';this.reason=reason;}
 dispose(){this.extension?.dispose();this.room?.dispose();this.world.free();}
}
