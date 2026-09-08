import type {Arena} from './arena';
import * as THREE from 'three';
import {prepareInvention,type Invention} from './spec';
import type { Simulation,V,WorldEntity } from './simulation';
import {ConstructionOutline} from './construction-outline';
import type {InventionOutline} from './build-stream';
export class GameView {
 construction=new ConstructionOutline();reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
 rope=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0xe5d6af}));
 environment:THREE.Object3D[]=[];chapter=new THREE.Group();
 lastSelf=new THREE.Vector3();freeYaw=0;
 beam=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0x9bf4ff,transparent:true,opacity:.8}));
 renderer:THREE.WebGLRenderer;scene=new THREE.Scene();camera:THREE.PerspectiveCamera;
 player=new THREE.Group();guard=new THREE.Group();gate=new THREE.Group();invention=new THREE.Group();key=new THREE.Group();frost:THREE.Mesh;shadow:THREE.Mesh;
 bobPhase=0;bob=0;landing=0;fov=80;motion=false;
 spec:Invention|null=null;time=0;firstPerson=true;yaw=-Math.PI/2;pitch=0;observer:ResizeObserver;particles:{mesh:THREE.Mesh,velocity:THREE.Vector3}[]=[];
 constructor(public host:HTMLElement){
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.setClearColor('#a4b7b8');this.scene.fog=new THREE.Fog('#a4b7b8',25,65);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;host.append(this.renderer.domElement);
  this.camera=new THREE.PerspectiveCamera(80,1,.035,120);this.camera.position.set(-17,15,22);this.camera.lookAt(0,1,0);this.camera.rotation.order='YXZ';
  this.scene.add(new THREE.HemisphereLight('#fff9e8','#798997',2.8));const sun=new THREE.DirectionalLight('#fff1d8',4);sun.position.set(-8,18,9);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:.5,far:50});sun.shadow.bias=-.0005;sun.shadow.normalBias=.04;this.scene.add(sun);
  const environmentStart=new Set(this.scene.children);
  const floor=this.mesh('box',[20,.7,11],'#aaa99c',[0,-.35,0]);floor.receiveShadow=true;
  this.mesh('box',[20.15,.16,11.15],'#556464',[0,-.78,0]);
  this.mesh('box',[6,.025,10.4],'#b3c1a5',[7,.01,0]);
  // Hand-made concrete and chalk markings.
  for(let i=0;i<30;i++){const x=-9+(i*3.13)%18,z=-4.8+(i*1.77)%9.6;this.mesh('box',[.25+(i%3)*.1,.012,.035],'#95968a',[x,.02,z]);}
  for(let x=-7;x<8;x+=1)this.mesh('box',[.35,.02,.08],x>4?'#edf3df':'#d8d8c6',[x,.035,0]);
  // Enclosed first-person courtyard.
  this.mesh('box',[20,5,.3],'#a5aea3',[0,2.5,-5.4]);this.mesh('box',[20,5,.3],'#aab1a3',[0,2.5,5.4]);this.mesh('box',[.35,5,11],'#afb6a9',[-9.2,2.5,0]);
  for(const z of [-5.4,5.4]){this.mesh('box',[20,.18,.6],'#596e66',[0,5,z]);for(let x=-8;x<10;x+=2){this.mesh('box',[.3,5,.5],'#89988c',[x,2.5,z]);for(let y=.7;y<5;y+=.7)this.mesh('box',[1.8,.025,.32],'#969f94',[x+1,y,z]);}}
  for(const z of [-5.15,5.15])for(let x=-8;x<5;x+=3){this.mesh('cylinder',[.025,1,.025],'#52675e',[x,5.4,z]);this.mesh('box',[3,.025,.025],'#657466',[x+1.5,5.7,z]);}
  this.mesh('box',[.08,2,.08],'#344f49',[-8,1,-2]);
  this.label('NO EXIT',[-9,2.4,0],2,'#e5d6b4','#746f59',Math.PI/2);
  this.label('04',[-4,.045,1.6],2.2,'#d9d3b9','#aaa99c',0,-Math.PI/2);
  // Back cell block, all geometry is authored here.
  this.mesh('box',[8,3,1.9],'#bfc4bd',[-5,1.5,-4.4]);this.mesh('box',[8.3,.25,2.15],'#607271',[-5,3.05,-4.4]);
  for(let x=-8;x<-1;x+=2){this.mesh('box',[1.05,1.55,.06],'#384c53',[x,1.55,-3.42]);for(let i=-.3;i<=.31;i+=.3)this.mesh('box',[.055,1.6,.08],'#d3d7c8',[x+i,1.55,-3.35]);this.mesh('box',[1.2,.12,.2],'#728380',[x,.7,-3.3]);}
  this.label('BLOCK 04',[-5,2.7,-3.4],1.5,'#e3e7d8','#607271');
  // Main wall with a genuine opening and separate gate collider.
  for(const z of [-3.2,3.2]){this.mesh('box',[.48,4,3.6],'#c6c7bc',[4,2,z]);this.mesh('box',[.72,.18,3.75],'#627875',[4,4.02,z]);for(let y=.5;y<4;y+=.65)for(let zz=z-1.4;zz<z+1.6;zz+=.8)this.mesh('box',[.01,.025,.72],'#a8afa4',[3.752,y,zz+(Math.round(y)%2)*.2]);}
  this.scene.add(this.gate);for(let z=-1.3;z<1.4;z+=.32)this.mesh('box',[.12,3.8,.085],'#3f595b',[4,1.9,z],this.gate);for(const y of [.25,1.4,3.6])this.mesh('box',[.14,.1,2.8],'#3f595b',[4,y,0],this.gate);
  this.mesh('box',[.7,.28,3.2],'#657a76',[4,4,0]);this.label('EXIT',[3.6,4.6,0],1.2,'#e4f3d7','#355550',-Math.PI/2);
  // Watchtower.
  for(const x of [3.3,4.7])for(const z of [-4.7,-3.3])this.mesh('box',[.16,5.2,.16],'#657c76',[x,2.6,z]);
  this.mesh('box',[2.1,.22,2.1],'#4e6965',[4,5,-4]);this.mesh('box',[1.7,1.05,1.7],'#a1b5ae',[4,5.6,-4]);this.mesh('box',[1.75,.55,.03],'#415b64',[4,5.7,-3.13]);const roof=this.mesh('cone',[1.6,.65,1.6],'#405e60',[4,6.5,-4]);roof.rotation.y=Math.PI/4;
  // Give the exit an actual horizon and destination beyond the playable boundary.
  this.mesh('box',[90,.12,90],'#8c9d82',[35,-.19,0]);
  this.mesh('box',[8,.025,80],'#6c7971',[17,-.11,0]);
  for(let z=-35;z<40;z+=4)this.mesh('box',[.1,.015,1.8],'#d9d9bc',[17,-.09,z]);
  for(let i=0;i<15;i++){const x=25+(i%3)*8,z=-30+i*4.5;this.mesh('cylinder',[.5,4,.5],'#736b54',[x,1.8,z]);this.mesh('cone',[5,8,5],i%2?'#627d63':'#70896a',[x,6,z]);}
  // Escape destination and perimeter.
  for(const z of [-5.2,5.2])this.mesh('box',[20,.24,.2],'#718781',[0,.12,z]);
  for(let z=-4.8;z<5;z+=.7){this.mesh('box',[.09,.8,.09],'#81928b',[-9,.4,z]);}
  this.label('FREEDOM',[8,.045,0],2.4,'#466755','#b3c1a5',0,-Math.PI/2);
  for(const [x,z] of [[8,-4],[9,3.5],[6,4.5]]){this.mesh('cylinder',[.2,1.3,.2],'#796d58',[x,.65,z]);this.mesh('sphere',[1.25,1.6,1.25],'#899f70',[x,1.9,z]);}
  for(const [x,z] of [[-7,3],[-3,-2.7],[-8,-2.5]]){this.mesh('box',[.85,.85,.85],'#9b937b',[x,.45,z]);this.mesh('box',[.9,.09,.9],'#756e5c',[x,.78,z]);}
  this.environment=this.scene.children.filter(o=>!environmentStart.has(o));this.scene.add(this.chapter);
  this.person(this.player,false);this.person(this.guard,true);this.scene.add(this.player,this.guard,this.invention,this.key,this.beam,this.rope,this.construction.group);this.beam.visible=false;this.rope.visible=false;
  this.mesh('torus',[.21,.21,.07],'#ffd556',[0,0,0],this.key);this.mesh('box',[.07,.35,.06],'#ffd556',[0,-.2,0],this.key);this.mesh('box',[.16,.06,.06],'#ffd556',[.055,-.32,0],this.key);
  this.frost=this.mesh('sphere',[2,2.4,2],'#8ce7f2',[0,1,0]);(this.frost.material as THREE.MeshStandardMaterial).transparent=true;(this.frost.material as THREE.MeshStandardMaterial).opacity=.22;this.frost.visible=false;
  this.shadow=this.mesh('sphere',[1.1,.015,.8],'#485954',[-6,.04,0]);(this.shadow.material as THREE.MeshStandardMaterial).transparent=true;(this.shadow.material as THREE.MeshStandardMaterial).opacity=.2;
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.resize();
 }
 setLevel(level:number){
  this.endConstruction();
  this.gate.scale.set(1,1,1);
  for(const o of this.environment){o.traverse(child=>child.visible=true);o.visible=level===0;}
  this.chapter.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});this.chapter.clear();
  const sky=level===1?'#8daebd':level===2?'#c8b6a2':'#a4b7b8';this.renderer.setClearColor(sky);this.scene.fog=new THREE.Fog(sky,25,65);
  if(level===0)return;
  const box=(scale:number[],color:string,pos:number[])=>this.mesh('box',scale,color,pos,this.chapter);
  if(level===1){box([9,.7,11],'#bfad8b',[-5.5,-.35,0]);box([7,.7,11],'#bfad8b',[6.5,-.35,0]);box([4,.08,11],'#427e8d',[1,-2.6,0]);
   for(const x of [-1.15,3.15])for(let z=-4.8;z<5;z+=.6)box([.22,.025,.3],'#f0bf58',[x,.025,z]);
   for(const x of [-4,6])for(const z of [-4,4]){box([.4,3,.4],'#677e7d',[x,1.5,z]);box([1,.15,1],'#e9ba61',[x,3,z]);}
  }else{box([20,.7,11],'#879d9e',[0,-.35,0]);box([6.5,4,11],'#bec9c6',[6.75,2,0]);box([6.5,.04,11],'#647f80',[6.75,4.02,0]);
   for(let x=4;x<10;x+=1)for(const z of [-4.8,4.8])box([.09,1,.09],'#e8b86a',[x,4.5,z]);
   for(const z of [-3,3])box([1.5,.8,1.5],'#93aaab',[7,4.4,z]);
  }
  for(const z of [-5.4,5.4])box([20,1.2,.3],level===1?'#768b89':'#789295',[0,.6,z]);box([.35,5,11],'#8faaa6',[-9.2,2.5,0]);
  // Floor joints, approach markings and a skyline give depth to the two outdoor spaces.
  for(let x=-8;x<10;x+=1){if(level===1&&x>-1&&x<3)continue;const h=level===2&&x>=4?4.03:.03;box([.035,.015,10.4],'#647c78',[x,h,0]);}
  for(let x=-5;x<9;x+=.8){if(level===1&&x> -1&&x<3)continue;if(level===2&&x>2&&x<4)continue;box([.32,.02,.1],'#f3d391',[x,level===2&&x>=4?4.06:.05,0]);}
  for(let i=0;i<9;i++){const z=-14-i%3*4,x=-12+i*4,h=3+(i*7)%8;box([2.8,h,2.5],level===1?'#6a8993':'#969995',[x,h/2-1,z]);box([2.9,.2,2.6],'#566d70',[x,h-1,z]);}
  if(level===1){box([4,.04,80],'#357e92',[1,-2.55,0]);for(let i=0;i<16;i++)box([.7,.015,.04],'#85bcc2',[-.4+(i%4)*.9,-2.5,-15+i*2]);}
  const y=level===2?4.04:.04;box([2,.04,3],'#91cbae',[8,y,0]);
  for(const z of [-1.5,1.5])box([.15,2.6,.15],'#3c625d',[8,y+1.3,z]);box([.18,.2,3.2],'#9ae5bd',[8,y+2.6,0]);
 }
 setArena(_arena:Arena){
  this.endConstruction();
  for(const o of this.environment)o.visible=false;
  this.chapter.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.chapter.clear();
  this.renderer.setClearColor('#f4f5f6');this.scene.fog=new THREE.Fog('#f4f5f6',28,65);
  const box=(size:number[],color:string,position:number[],name='')=>{const m=this.mesh('box',size,color,position,this.chapter);m.name=name;return m;};
  box([20,.7,11],'#f2f3f3',[0,-.35,0],'ground');
  box([20,5,.3],'#e8ebed',[0,2.5,-5.4]);box([20,5,.3],'#e8ebed',[0,2.5,5.4]);box([.35,5,11],'#e5e9ec',[-9.2,2.5,0]);
  for(let x=-8;x<10;x+=2)box([.012,.01,10.7],'#d9dfe2',[x,.008,0]);
  for(const z of [-4,-2,0,2,4])box([19,.01,.012],'#d9dfe2',[.4,.008,z]);
  for(const z of [-3.2,3.2])box([.48,1.6,3.6],'#dfe5e8',[4,.8,z],z<0?'wall-left':'wall-right');
  this.gate.scale.set(1,1.6/3.8,1);this.gate.position.y=0;this.gate.traverse(o=>{o.visible=true;if(o instanceof THREE.Mesh)(o.material as THREE.MeshStandardMaterial).color.set('#94a4ae');});
  box([2,.025,2.8],'#a4cfb7',[8,.018,0]);for(const z of [-1.4,1.4])box([.08,2.5,.08],'#527d6b',[8,1.25,z]);box([.08,.08,2.88],'#527d6b',[8,2.5,0]);
  for(let x=-5;x<8;x+=1)box([.12,.012,.04],'#b2bfc5',[x,.019,0]);
  box([80,.1,80],'#e9eeee',[35,-.6,0]);
 }
 removeEntity(entity:WorldEntity){
  this.scene.traverse(o=>{if(o.name===entity.id)o.visible=false;});
  if(entity.id==='guard'){this.guard.visible=false;return;}
  if(entity.id==='gate'){this.gate.visible=false;return;}
  // Authored structural decoration follows its collider when generated code removes it.
  const center=entity.position,half=entity.half,pos=new THREE.Vector3();
  for(const root of [...this.environment,...this.chapter.children])root.traverse(o=>{
   if(!(o instanceof THREE.Mesh))return;o.getWorldPosition(pos);
   if(Math.abs(pos.x-center.x)<=half.x+.4&&Math.abs(pos.y-center.y)<=half.y+.35&&Math.abs(pos.z-center.z)<=half.z+.2)o.visible=false;
  });
 }
 mesh(shape:string,scale:number[],color:string,position:number[],parent:THREE.Object3D=this.scene){let geometry:THREE.BufferGeometry;
  if(shape==='sphere')geometry=new THREE.SphereGeometry(.5,16,12);else if(shape==='cylinder')geometry=new THREE.CylinderGeometry(.5,.5,1,16);else if(shape==='cone')geometry=new THREE.ConeGeometry(.5,1,4);else if(shape==='torus')geometry=new THREE.TorusGeometry(.5,.13,8,20);else geometry=new THREE.BoxGeometry(1,1,1);
  const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.78}));m.scale.set(...scale as [number,number,number]);m.position.set(...position as [number,number,number]);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
 }
 label(text:string,pos:number[],width:number,fg:string,bg:string,ry=0,rx=0){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d')!;ctx.fillStyle=bg;ctx.fillRect(0,0,512,128);ctx.fillStyle=fg;ctx.font='bold 58px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,65);const m=new THREE.Mesh(new THREE.PlaneGeometry(width,width/4),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide}));m.position.set(...pos as [number,number,number]);m.rotation.set(rx,ry,0);this.scene.add(m);}
 person(g:THREE.Group,guard:boolean){const body=guard?'#40566a':'#f28443';this.mesh('box',[.48,.62,.3],body,[0,.05,0],g);this.mesh('sphere',[.48,.48,.46],'#f1dab2',[0,.62,0],g);
  for(const x of [-.15,.15]){const leg=this.mesh('cylinder',[.13,.48,.13],'#34434b',[x,-.47,0],g);leg.name='leg'+x;this.mesh('box',[.18,.12,.32],'#27363d',[x,-.73,.06],g);this.mesh('cylinder',[.13,.55,.13],body,[x*2,.0,0],g);this.mesh('sphere',[.14,.14,.14],'#f1dab2',[x*2,-.3,0],g);}
  if(guard){this.mesh('cylinder',[.55,.17,.55],'#344b62',[0,.87,0],g);this.mesh('box',[.38,.06,.3],'#273c53',[0,.8,.22],g);this.mesh('box',[.1,.12,.025],'#f1cf70',[.12,.15,.17],g);}else{for(const y of [-.1,.15])this.mesh('box',[.49,.055,.31],'#ffba79',[0,y,0],g);this.mesh('sphere',[.3,.12,.4],'#463d34',[0,.83,-.035],g);}
  for(const x of [-.09,.09])this.mesh('sphere',[.045,.055,.03],'#283940',[x,.65,.224],g);
 }
 setInvention(spec:Invention|null){spec=spec?prepareInvention(spec):null;this.spec=spec;this.invention.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});this.invention.clear();if(!spec)return;for(const p of spec.parts){const m=this.mesh(p.shape,p.scale,p.color,p.position,this.invention);m.rotation.set(p.rotation[0],p.rotation[1],p.rotation[2]);m.userData={animation:p.animation,rotation:p.rotation};if(spec.phases.some(ph=>ph.actions.some(a=>a.op==='freezeRay'))){(m.material as THREE.MeshStandardMaterial).depthTest=false;(m.material as THREE.MeshStandardMaterial).depthWrite=false;m.renderOrder=10;m.castShadow=false;}} }
 beginConstruction(position:{x:number,y:number,z:number},aim:{x:number,y:number,z:number}){this.construction.begin(position,aim);}
 updateConstruction(outline:InventionOutline){this.construction.update(outline);}
 endConstruction(){this.construction.end();}
 resize(){const {width,height}=this.host.getBoundingClientRect();this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.fov=width<600?90:80;this.camera.updateProjectionMatrix();}
 render(sim:Simulation,delta:number,alpha=1,playing=true){if(playing)this.time+=delta;const current=sim.position;
  const t=Math.hypot(current.x-sim.previous.x,current.y-sim.previous.y,current.z-sim.previous.z)>2?1:alpha;
  const p={x:THREE.MathUtils.lerp(sim.previous.x,current.x,t),y:THREE.MathUtils.lerp(sim.previous.y,current.y,t),z:THREE.MathUtils.lerp(sim.previous.z,current.z,t)};
  const velocity=sim.player.linvel(),speed=Math.hypot(velocity.x,velocity.z);
  this.bob=THREE.MathUtils.damp(this.bob,playing&&sim.grounded?Math.min(speed/4.5,1):0,12,delta);
  if(playing)this.bobPhase+=speed*delta*2.3;
  if(playing&&sim.landingSpeed>1)this.landing=Math.max(this.landing,Math.min(.085,sim.landingSpeed*.012));
  this.landing=THREE.MathUtils.damp(this.landing,0,13,delta);
  const bob=this.motion?Math.sin(this.bobPhase*2)*.018*this.bob:0;
  this.fov=THREE.MathUtils.damp(this.fov,80+(this.motion&&speed>3.5?Math.min(4,(speed-3.5)*3):0),7,delta);
  if(Math.abs(this.camera.fov-this.fov)>.01){this.camera.fov=this.fov;this.camera.updateProjectionMatrix();}
  this.player.position.set(p.x,p.y,p.z);this.player.rotation.y=Math.PI/2;this.player.visible=!this.firstPerson;if(this.firstPerson){this.camera.position.set(p.x,p.y+.86+bob-(this.motion?this.landing:0),p.z);this.camera.rotation.set(this.pitch,this.yaw,this.motion?Math.sin(this.bobPhase)*.002*this.bob:0,'YXZ');}this.guard.position.set(sim.guard.x,.8,sim.guard.z);this.guard.rotation.y=sim.frozen?0:Math.cos(sim.elapsed*.8)>0?0:Math.PI;
  const walking=sim.state==='running'&&p.y<1.1;for(const child of this.player.children)if(child.name.startsWith('leg'))child.rotation.x=walking?Math.sin(this.time*13+(child.name.includes('-')?0:Math.PI))*.45:0;
  this.gate.position.y=THREE.MathUtils.damp(this.gate.position.y,sim.gateOpen?4.2:0,6,delta);
  const origin=this.spec?.mount==='player'?p:sim.state==='ready'&&this.spec?{x:this.spec.spawn[0],y:this.spec.spawn[1],z:this.spec.spawn[2]}:sim.self;
  this.invention.position.set(origin.x,origin.y,origin.z);if(this.spec?.mount==='free'){
   const dx=origin.x-this.lastSelf.x,dz=origin.z-this.lastSelf.z;
   if(Math.hypot(dx,dz)>.003&&Math.hypot(dx,dz)<1){const target=-Math.atan2(dz,dx);this.freeYaw+=Math.atan2(Math.sin(target-this.freeYaw),Math.cos(target-this.freeYaw))*(1-Math.exp(-delta*12));}
   this.lastSelf.set(origin.x,origin.y,origin.z);
   const courier=this.spec.phases.some(ph=>ph.actions.some(a=>a.op==='grab'));
   this.invention.rotation.y=courier?this.freeYaw:0;
  }else {this.invention.rotation.set(0,this.yaw+Math.PI/2,0);
   if(this.spec?.phases.some(ph=>ph.actions.some(a=>a.op==='freezeRay'))){
    this.invention.rotateZ(this.pitch);const offset=new THREE.Vector3(.25-(sim.beam>0?.035:0),-.55,0).applyQuaternion(this.invention.quaternion);this.invention.position.copy(this.camera.position).add(offset);
   }
  }
  this.construction.reducedMotion=this.reducedMotion.matches;this.construction.render(p,this.yaw,delta);
  this.rope.visible=sim.inventionActive&&!sim.phaseDone&&!!sim.invention?.phases[sim.phase]?.actions.some(a=>a.op==='attract');
  if(this.rope.visible)this.rope.geometry.setFromPoints([new THREE.Vector3(p.x,p.y+.3,p.z),new THREE.Vector3(sim.self.x,sim.self.y,sim.self.z)]);
  for(const child of this.guard.children)if(child.name.startsWith('leg'))child.rotation.x=sim.frozen||sim.distracted?0:Math.sin(sim.elapsed*8+(child.name.includes('-')?0:Math.PI))*.35;
  for(const part of this.invention.children){
   const base=part.userData.rotation;if(!base)continue;part.rotation.set(base[0],base[1],base[2]);
   if(sim.inventionActive){const a=part.userData.animation;if(a==='spinY')part.rotateY(this.time*16);if(a==='spinX')part.rotateX(this.time*16);if(a==='spinZ')part.rotateZ(this.time*16);if(a==='flapZ')part.rotateZ(Math.sin(this.time*10)*.4);}
   if(part instanceof THREE.Mesh){const m=part.material as THREE.MeshStandardMaterial;m.transparent=sim.invisible;m.opacity=sim.invisible?.18:1;}
  }
  this.beam.visible=sim.beam>0;if(this.beam.visible){
   const start=new THREE.Vector3(p.x,p.y+.64,p.z),end=sim.beamHit?new THREE.Vector3(sim.guard.x,.9,sim.guard.z):start.clone().add(new THREE.Vector3(sim.aim.x,sim.aim.y,sim.aim.z).multiplyScalar(5));
   this.beam.geometry.setFromPoints([start,end]);
  }
  const key=sim.key;this.key.position.set(key.x,key.y,key.z+.25);this.key.rotation.y=this.time*2;
  this.frost.visible=sim.frozen>0;this.frost.position.set(sim.guard.x,1,sim.guard.z);this.shadow.position.set(p.x,.04,p.z);this.shadow.scale.setScalar(Math.max(.35,1-p.y*.04));
  for(const particle of this.particles){particle.velocity.y-=delta*5;particle.mesh.position.addScaledVector(particle.velocity,delta);particle.mesh.rotation.x+=delta*2;}
  this.guard.visible=sim.level===0&&sim.guardEnabled;this.key.visible=!sim.arena&&sim.level===0&&sim.keyOwner!=='player';this.gate.visible=sim.level===0&&!sim.entities.find(e=>e.id==='gate')?.removed;
  const extension=sim.extension as unknown as {render?:(dt:number)=>void}|null;if(playing){if(sim.disrupted<=0)extension?.render?.(delta);(sim.room as unknown as {render?:(dt:number)=>void}|null)?.render?.(delta);}
  this.renderer.render(this.scene,this.camera);
 }
 celebrate(){for(let i=0;i<65;i++){const m=this.mesh('box',[.08,.16,.03],['#e9984a','#d5ed92','#82b9ab','#f9f3d5'][i%4],[7,2,0]);this.particles.push({mesh:m,velocity:new THREE.Vector3((Math.random()-.5)*7,3+Math.random()*5,(Math.random()-.5)*7)});}}
 clearParticles(){for(const p of this.particles){this.scene.remove(p.mesh);p.mesh.geometry.dispose();(p.mesh.material as THREE.Material).dispose();}this.particles=[];}
}
