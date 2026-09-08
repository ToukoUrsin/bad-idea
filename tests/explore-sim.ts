import fs from 'node:fs';import{Simulation,initPhysics}from'../src/simulation.ts';import{inventionSchema}from'../src/spec.ts';
await initPhysics();
for(const name of ['bird','freeze-ray','ladder','grapple','cloak','trampoline']){
 const file=`runtime/playtest/${name}.json`;if(!fs.existsSync(file))continue;
 const data=JSON.parse(fs.readFileSync(file,'utf8'));if(!data.invention)continue;
 const s=new Simulation();s.start(inventionSchema.parse(data.invention));s.activate();
 for(let i=0;i<1800&&s.state==='running';i++){
  const p=s.position;
  // Hold back for the courier; approach other objects and the gate with ordinary movement.
  if(name==='bird'&&s.keyOwner!=='player')s.manual=null;
  else s.manual={x:3.2,y:0,z:Math.abs(p.z)>.2?-Math.sign(p.z)*1.5:0};
  s.tick();
 }
 console.log(JSON.stringify({name,mount:s.invention?.mount,spawn:s.invention?.spawn,state:s.state,reason:s.reason,pos:s.position,key:s.keyOwner,phase:s.phase,phaseDone:s.phaseDone,events:s.events}));s.dispose();
}
