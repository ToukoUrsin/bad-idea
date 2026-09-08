export const levels=[
 {name:'The Courtyard',objective:'GET PAST THE GUARD',hint:'Steal his key, distract him, or go over the wall.',brief:'Original courtyard: guard with key, locked gate at x4, wall height4. Escape x>6.5 and y<3.'},
 {name:'The Broken Bridge',objective:'CROSS THE GAP',hint:'The bridge is gone. Build a way across.',brief:'No guard, key or gate. Ground x -10 to -1 and x3 to10. A 4m gap spans every z. Falling below -2 loses. Exit x>6.5,y<3. A short teleport, rocket, or solid bridge can cross. Teleport vector [5,0,0] from x=-1.8 lands safely at3.2. Do not generate courtyard wall solutions.'},
 {name:'The Rooftop',objective:'REACH THE ROOFTOP EXIT',hint:'The way out is above you. Invent some height.',brief:'No guard, key or gate. Ground at y0. Rooftop solid block from x3.5 to10, z -5 to5, top y4. Exit x>6.5, player y>4.65 and y<7. Put ladder at [3.25,0,0] with climb top5.15. Bounce or controlled flight also works. No ground-level exit.'}
] as const;
export type LevelId=0|1|2;
