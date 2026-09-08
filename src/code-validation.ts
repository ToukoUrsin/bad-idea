import {Simulation,initPhysics} from './simulation';
import {CodeRuntime,makeHeadlessView} from './code-runtime';
import {CodeBudget,compileCode} from './code-compiler';
import {prepareInvention,type Invention} from './spec';
import type {LevelId} from './levels';
export type ValidationResult={ok:boolean,error?:string,checks:string[],frames:number};
export async function validateCode(raw:Invention,level:LevelId):Promise<ValidationResult>{
 const checks:string[]=[];let frames=0;const spec=prepareInvention(raw);if(!spec.code)return {ok:true,checks:['Legacy invention'],frames:0};
 await initPhysics();
 const create=()=>{const sim=new Simulation(level),view=makeHeadlessView();sim.start(spec);for(let i=0;i<3;i++)sim.tick();const behavior=new CodeRuntime(sim,view);return {sim,view,behavior};};
 let current:ReturnType<typeof create>|null=null;
 try{
  current=create();
  const advance=(n:number)=>{
   if(!Number.isFinite(n)||n<0||n>1200)throw Error('Test advance must be between 0 and 1200 frames.');
   for(let i=0;i<Math.floor(n);i++){
    if(current!.behavior.error)throw Error(current!.behavior.error);
    current!.sim.tick();const p=current!.sim.position;current!.view.camera.position.set(p.x,p.y+.86,p.z);current!.view.camera.lookAt(p.x+current!.sim.aim.x,p.y+.86+current!.sim.aim.y,p.z+current!.sim.aim.z);
    current!.behavior.render(1/60);frames++;
    if(![p.x,p.y,p.z,...Object.values(current!.sim.player.linvel())].every(Number.isFinite))throw Error('Invention created nonfinite player physics.');
   }
   if(current!.behavior.error)throw Error(current!.behavior.error);
  };
  if(current.behavior.error)throw Error(current.behavior.error);
  advance(5);current.behavior.use();advance(120);current.behavior.use();advance(60);
  checks.push('Compiled, activated twice and simulated without a runtime error');current.sim.dispose();current=null;
  current=create();
  let assertions=0;
  const assert=(condition:unknown,message='Behavior assertion')=>{assertions++;if(!condition)throw Error(message);checks.push(message);};
  const budget=new CodeBudget(2000);
  const test=compileCode(spec.test,['game','behavior','assert','advance'],budget);
  test(current.behavior.game,current.behavior.hooks,assert,advance);
  if(assertions===0)throw Error('The generated test did not check the invention’s behavior.');
  if(current.behavior.error)throw Error(current.behavior.error);
  return {ok:true,checks,frames};
 }catch(e){return {ok:false,error:e instanceof Error?e.message:String(e),checks,frames};}
 finally{current?.sim.dispose();}
}
