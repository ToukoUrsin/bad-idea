import fs from'node:fs';import{Simulation,initPhysics}from'../src/simulation.ts';import{prepareInvention}from'../src/spec.ts';import{PlayDriver}from'./play-driver.ts';
await initPhysics();const results=[];
for(const name of process.argv.slice(2).length?process.argv.slice(2):['bird','freeze-ray','ladder','grapple','cloak','trampoline']){
 const data=JSON.parse(fs.readFileSync(`runtime/playtest/${name}.json`,'utf8'));if(!data.invention)continue;
 const s=new Simulation();s.start(prepareInvention(data.invention));if(name!=='freeze-ray')s.activate();const driver=new PlayDriver(name,s);
 for(let i=0;i<2400&&s.state==='running';i++){driver.tick();s.tick();}
 const result={name,title:s.invention!.name,elapsed:s.elapsed,state:s.state,reason:s.reason,position:s.position,maxHeight:s.maxHeight,key:s.keyOwner,phase:s.phase,events:s.events,usage:s.invention!.usage};results.push(result);console.log(JSON.stringify(result));s.dispose();
}
fs.writeFileSync('runtime/playtest/results.json',JSON.stringify(results,null,2));
