import { z } from 'zod';
const vec = z.array(z.number().min(-20).max(20)).length(3);
const target = z.enum(['self','player','guard','key','gate','exit']);
export const inventionSchema = z.object({
 autoDeploy:z.boolean().default(true),
 code:z.string().max(80000).default(''),test:z.string().max(20000).default(''),
 name:z.string().min(1).max(60), description:z.string().max(180),
 usage:z.string().max(160).default('Press F to activate.'),
 limitations:z.array(z.string().max(140)).max(3).default([]),
 mount:z.enum(['player','free']), spawn:vec,
 parts:z.array(z.object({
  shape:z.enum(['box','sphere','cylinder','cone','torus']),position:vec,rotation:vec,
  scale:z.array(z.number().min(.03).max(4)).length(3),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),
  animation:z.enum(['none','spinY','spinX','spinZ','flapZ']).default('none'),
  solid:z.boolean().default(false),
 })).min(1).max(24),
 phases:z.array(z.object({
  label:z.string().max(60),
  actions:z.array(z.object({
   op:z.enum(['force','impulse','seek','drag','freeze','freezeRay','grab','deliver','attract','teleport','climb','cloak','bounce']),
   target,vector:vec,strength:z.number().min(0).max(40),radius:z.number().min(.1).max(5),
  })).max(6),
  until:z.object({kind:z.enum(['time','near','above','below','falling','hasKey','never']),target,value:z.number().min(0).max(30)}),
 })).max(8).default([]),
});
export type Invention = z.infer<typeof inventionSchema>;
export function prepareInvention(raw:unknown):Invention {
 const spec=inventionSchema.parse(raw);
 // Couriers must fit in the courtyard and must not obscure the first-person camera.
 if(spec.mount==='free'&&spec.phases.some(p=>p.actions.some(a=>a.op==='grab'||a.op==='deliver'))){
  const span=Math.max(...[0,1,2].map(i=>Math.max(...spec.parts.map(p=>p.position[i]+Math.hypot(...p.scale)/2))-Math.min(...spec.parts.map(p=>p.position[i]-Math.hypot(...p.scale)/2))));
  if(span>1.4){const ratio=1.4/span;for(const p of spec.parts){p.position=p.position.map(n=>n*ratio);p.scale=p.scale.map(n=>Math.max(.03,n*ratio));}}
 }
 return spec;
}
export const worldBrief={
 player:{position:[-6,.8,0],mass:1,walkSpeed:3.2},
 guard:{position:[1,0,-2.4],patrol:'z oscillates -2.4 to 2.4. Capture requires staying within 1.65m for 0.56s. Frozen guards cannot capture; cloak hides player.',key:'carried at shoulder height'},
 gate:{position:[4,0,0],height:4,width:2.8,locked:true},exit:{position:[8,0,0]},
 rules:'Escape requires player x>6.5, |z|<4.5, y<3, alive. Ground ends at x=10. WASD moves, space jumps, F starts/stops/reuses invention. Wall at x4 spans z -5 to5. Gate |z|<1.4 unlocks automatically with the key nearby. Get close to a frozen guard or sneak close while cloaked to take the key. Free courier can grab and deliver. Clear wall above y4.8. No model-declared success.',
};
// Structured output follows schema order: geometry arrives before the long source.
export const codeGenerationSchema=z.object({
 name:inventionSchema.shape.name,mount:inventionSchema.shape.mount,
 spawn:inventionSchema.shape.spawn,parts:inventionSchema.shape.parts,
 autoDeploy:inventionSchema.shape.autoDeploy,description:inventionSchema.shape.description,
 usage:inventionSchema.shape.usage,limitations:inventionSchema.shape.limitations,
 code:z.string().min(40).max(80000),
});
