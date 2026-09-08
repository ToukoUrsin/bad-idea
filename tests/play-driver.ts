import type {Simulation}from'../src/simulation.ts';
export class PlayDriver {
 stage=0;fired=false;route:number[][]=[];
 constructor(public kind:string,public s:Simulation){
  if(kind==='ladder'||kind==='trampoline')this.route=[[-2,4.3],[2.8,4.3],[s.self.x-.12,s.self.z],[8,s.self.z]];
  else if(kind==='bird')this.route=[[-2,4.3],[3,4.3],[3,0],[8,0]];
 }
 move(x:number,z:number,speed=3.2){const p=this.s.position,dx=x-p.x,dz=z-p.z,len=Math.hypot(dx,dz);this.s.manual=len>.12?{x:dx/len*speed,y:0,z:dz/len*speed}:null;return len<.18;}
 tick(){
  const s=this.s,p=s.position;
  if(this.kind==='bird'&&s.keyOwner!=='player'){s.manual=null;return;}
  if(this.kind==='freeze-ray'){
   const g=s.target('guard'),dx=g.x-p.x,dy=g.y-p.y-.86,dz=g.z-p.z,len=Math.hypot(dx,dy,dz);s.aim={x:dx/len,y:dy/len,z:dz/len};
   if(s.keyOwner!=='player'){
    if(len<4.5&&(!s.inventionActive||s.phaseDone)&&s.frozen<1){s.activate();}
    this.move(s.guard.x,s.guard.z);return;
   }
   this.move(8,0);return;
  }
  if(this.kind==='cloak'){
   if(s.keyOwner==='guard'){this.move(s.guard.x,s.guard.z);return;}
   this.move(8,0);return;
  }
  if(this.kind==='grapple'){
   // First watch the authored pull. Correct horizontal drift toward the landing zone while airborne.
   if(p.y<4.9&&s.elapsed<3){s.manual=null;return;}
   this.move(8,0);if(p.x>7.4&&s.inventionActive&&!s.phaseDone){s.activate();}return;
  }
  if(this.kind==='trampoline'&&this.stage===2){
   const distance=Math.hypot(p.x-s.self.x,p.z-s.self.z);
   if(distance<1.6&&!this.fired&&s.grounded){s.jump();this.fired=true;}
   this.move(s.self.x,s.self.z);
   if(s.events.some(e=>e.startsWith('BOING')))this.stage=this.route.length-1;
   return;
  }
  if(this.route.length){
   const dest=this.route[Math.min(this.stage,this.route.length-1)];
   if(this.move(dest[0],dest[1])&&this.stage<this.route.length-1)this.stage++;
   // The trampoline launches from contact and the ladder climbs with forward movement.
   if(this.kind==='trampoline'&&s.events.some(e=>e.startsWith('BOING')))this.stage=this.route.length-1;
   return;
  }
  this.move(8,0);
 }
}
