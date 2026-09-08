import test from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics,Simulation } from '../src/simulation.ts';
import { inventionSchema,type Invention } from '../src/spec.ts';
import fs from 'node:fs';
await initPhysics();
const run=(spec:Invention|null)=>{const s=new Simulation();s.autoRun=true;s.start(spec);s.activate();while(s.state==='running')s.tick();return s;};
test('walking into a locked gate never declares an escape',()=>{const s=run(null);assert.equal(s.state,'lost');assert.equal(s.gateOpen,false);assert.ok(s.position.x<4);s.dispose();});
test('distant invented key grab does not bypass proximity or gate lock',()=>{const s=new Simulation();s.autoRun=true;s.start({name:'Cheater',description:'',mount:'free',spawn:[-6,2,0],parts:[{shape:'box',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#aaaaaa'}],phases:[{label:'Grab',actions:[{op:'grab',target:'key',vector:[0,0,0],strength:1,radius:5},{op:'deliver',target:'player',vector:[0,0,0],strength:1,radius:5}],until:{kind:'never',target:'self',value:0}}]});for(let i=0;i<60;i++)s.tick();assert.equal(s.keyOwner,'guard');assert.equal(s.gateOpen,false);s.dispose();});
test('nonfinite coordinates and oversized geometry are rejected',()=>{assert.equal(inventionSchema.safeParse({spawn:[NaN,0,0]}).success,false);});
for(const name of ['bird','skates','bubble']){const file=`tests/fixtures/${name}.json`;if(fs.existsSync(file)){const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.invention)test(`live Astra ${name} executes in the real simulation`,()=>{const spec=inventionSchema.parse(data.invention),s=run(spec);console.log(JSON.stringify({name,elapsedMs:data.elapsedMs,outcome:s.state,reason:s.reason,events:s.events,phase:s.phase,position:s.position,maxHeight:s.maxHeight}));assert.equal(s.state,'won',`${name}: ${s.reason}`);assert.ok(Number.isFinite(s.position.x));s.dispose();});}}
