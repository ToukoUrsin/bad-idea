import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{Simulation,initPhysics}from'../src/simulation.ts';import{prepareInvention}from'../src/spec.ts';import{PlayDriver}from'./play-driver.ts';
await initPhysics();
for(const name of ['bird','freeze-ray','ladder','grapple','cloak','trampoline'])test(`fresh generated ${name} escapes using its stated mechanic`,()=>{
 const data=JSON.parse(fs.readFileSync(`tests/fixtures/playtest/${name}.json`,'utf8')),s=new Simulation();s.start(prepareInvention(data.invention));if(name!=='freeze-ray')s.activate();const driver=new PlayDriver(name,s);
 for(let i=0;i<1800&&s.state==='running';i++){driver.tick();s.tick();}
 assert.equal(s.state,'won',JSON.stringify({name,reason:s.reason,pos:s.position,phase:s.phase,events:s.events}));
 if(name==='cloak')assert.equal(s.frozen,0);
 if(name==='ladder'||name==='trampoline')assert.ok(s.maxHeight>4.8);
 if(name==='bird')assert.equal(s.keyOwner,'player');
 s.dispose();
});
test('unsupported shrinking potion clearly reports limits and cannot bypass the gate',()=>{
 const data=JSON.parse(fs.readFileSync('tests/fixtures/playtest/unsupported.json','utf8')),s=new Simulation();s.start(prepareInvention(data.invention));assert.ok(s.invention!.limitations.length>0);assert.equal(s.invention!.phases.flatMap(p=>p.actions).length,0);s.activate();s.distracted=60;s.manual={x:3.2,y:0,z:0};for(let i=0;i<600;i++)s.tick();assert.equal(s.gateOpen,false);assert.equal(s.state,'running');assert.ok(s.position.x<4);s.dispose();
});
test('delivered courier parks outside the player camera space',()=>{
 const data=JSON.parse(fs.readFileSync('tests/fixtures/playtest/bird.json','utf8')),s=new Simulation();s.start(prepareInvention(data.invention));s.activate();for(let i=0;i<600;i++)s.tick();assert.equal(s.keyOwner,'player');assert.ok(Math.hypot(s.self.x-s.position.x,s.self.z-s.position.z)>1.8);s.dispose();
});
