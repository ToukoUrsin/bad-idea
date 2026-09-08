import fs from 'node:fs/promises';
const cases=[
 ['bird',"A little mechanical bird that steals the guard's key and brings it to me"],
 ['freeze-ray','A handheld ice ray. Freeze the guard only when I aim at him and fire.'],
 ['ladder','A tall wooden ladder I can climb to get over the prison wall'],
 ['grapple','A grappling hook that hooks the top of the prison wall and pulls me over it'],
 ['cloak','An invisibility cloak so I can sneak right past the guard'],
 ['trampoline','A springy trampoline that launches me over the prison wall when I jump on it'],
];
for(const [name,prompt] of cases){
 const r=await fetch('http://localhost:4320/api/invent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt})});const data=await r.json();await fs.writeFile(`runtime/playtest/${name}.json`,JSON.stringify({prompt,...data},null,2));console.log(JSON.stringify({name,status:r.status,title:data.invention?.name,description:data.invention?.description,elapsedMs:data.elapsedMs,phases:data.invention?.phases,error:data.error}));
}
