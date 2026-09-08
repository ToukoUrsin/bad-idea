import {CodeRuntime} from '../src/code-runtime';
import {validateInWorker} from '../src/validate-in-worker';
import {loadReplayCase} from './replay-fixtures';
import{Simulation,initPhysics}from'../src/simulation';import{GameView}from'../src/view';import{PlayDriver}from'./play-driver';
await initPhysics();const $=(q:string)=>document.querySelector<HTMLElement>(q)!;const view=new GameView($('#stage'));let sim=new Simulation(),driver:PlayDriver|null=null,paused=false,last=performance.now(),acc=0,frames:number[]=[];
$('#run').onclick=async()=>{
 const run=$('#run')as HTMLButtonElement,kind=(document.querySelector('#case')as HTMLSelectElement).value;
 run.disabled=true;$('#title').textContent='Loading replay…';
 try{
  const {level,coded,invention}=await loadReplayCase(kind);
  if(coded){$('#title').textContent='Testing generated code…';const result=await validateInWorker(invention,level);if(!result.ok)throw new Error('Validation failed: '+result.error);}
  sim.dispose();sim=new Simulation(level);view.setLevel(level);sim.start(invention);
  if(!coded&&kind!=='freeze-ray'&&kind!=='gap')sim.activate();
  driver=new PlayDriver(kind,sim);view.setInvention(sim.invention);
  if(coded){new CodeRuntime(sim,view);sim.aim={x:1,y:0,z:0};}
  view.clearParticles();view.yaw=-Math.PI/2;view.pitch=-.08;frames=[];acc=0;paused=false;$('#pause').textContent='Pause';$('#title').textContent=sim.invention!.name;
 }catch(error){$('#title').textContent='REPLAY FAILED: '+(error instanceof Error?error.message:String(error));}
 finally{run.disabled=false;}
};
$('#pause').onclick=()=>{paused=!paused;$('#pause').textContent=paused?'Resume':'Pause';};
$('#camera').onclick=()=>{view.firstPerson=!view.firstPerson;$('#camera').textContent=view.firstPerson?'Overview camera':'First-person camera';if(!view.firstPerson){view.camera.position.set(-8,10,13);view.camera.lookAt(0,1,0);}};
function frame(now:number){const dt=Math.min(.08,(now-last)/1000);last=now;if(!paused&&sim.state==='running'){
 frames.push(dt*1000);acc+=dt;while(acc>=1/60){if(driver?.kind==='rpg-code'){sim.manual=null;if(sim.elapsed>.25&&sim.elapsed<.28)sim.activate();}else if(driver?.kind==='vine-code'){if(sim.elapsed<.04)sim.activate();sim.manual=sim.elapsed>2.5?{x:3.2,y:0,z:0}:null;}else if(driver?.kind==='gravity-code'){sim.manual=null;if(sim.elapsed<.04)sim.activate();if(sim.elapsed>.5&&sim.elapsed<.53)sim.jump();}else if(driver?.kind==='gap'){sim.manual={x:3.2,y:0,z:0};if(sim.position.x>-1.9&&!sim.inventionActive)sim.activate();}else if(driver?.kind==='rooftop')sim.manual={x:3.2,y:0,z:0};else driver?.tick();sim.tick();acc-=1/60;}
 const direction=sim.manual;if(direction&&Math.hypot(direction.x,direction.z)>.1){const target=Math.atan2(-direction.x,-direction.z);view.yaw+=Math.atan2(Math.sin(target-view.yaw),Math.cos(target-view.yaw))*(1-Math.exp(-dt*8));}
 if(driver?.kind==='freeze-ray'){view.yaw=Math.atan2(-sim.aim.x,-sim.aim.z);view.pitch=Math.asin(sim.aim.y);}
 if(sim.state==='won')view.celebrate();
}view.render(sim,dt,!paused&&sim.state==='running'?acc*60:1,!paused&&sim.state==='running');
const p=sim.position,sorted=frames.slice().sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)]||0;
$('#readout').textContent=`STATE: ${sim.state.toUpperCase()} · ${sim.elapsed.toFixed(1)}s\nPosition ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)} · Key: ${sim.keyOwner}\nPhase: ${sim.extension?.status||sim.invention?.phases[sim.phase]?.label||'—'}\nFrames ${frames.length} · p95 ${p95.toFixed(1)} ms · average ${(frames.length/(frames.reduce((a,b)=>a+b,0)/1000)||0).toFixed(0)} FPS\n${sim.reason}`;
$('#event').textContent=sim.events.at(-1)||'';requestAnimationFrame(frame);}
requestAnimationFrame(frame);
