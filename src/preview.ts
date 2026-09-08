import * as THREE from 'three';
import type {Invention} from './spec';
export class InventionPreview {
 renderer:THREE.WebGLRenderer;scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.01,100);group=new THREE.Group();observer:ResizeObserver;
 constructor(public host:HTMLElement){
  this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));host.append(this.renderer.domElement);
  this.scene.add(this.group,new THREE.HemisphereLight('#ffffff','#a1afb8',3));const l=new THREE.DirectionalLight('#ffffff',4);l.position.set(4,6,8);this.scene.add(l);
  let dragging=false,lastX=0;host.onpointerdown=e=>{dragging=true;lastX=e.clientX;host.setPointerCapture(e.pointerId);};host.onpointermove=e=>{if(dragging){this.group.rotation.y+=(e.clientX-lastX)*.012;lastX=e.clientX;this.render();}};host.onpointerup=host.onpointercancel=()=>{dragging=false;};
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
 }
 set(spec:Invention|null){
  this.group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});this.group.clear();if(!spec)return;
  for(const p of spec.parts){
   let g:THREE.BufferGeometry;
   if(p.shape==='sphere')g=new THREE.SphereGeometry(.5,20,16);else if(p.shape==='cylinder')g=new THREE.CylinderGeometry(.5,.5,1,20);else if(p.shape==='cone')g=new THREE.ConeGeometry(.5,1,12);else if(p.shape==='torus')g=new THREE.TorusGeometry(.5,.13,12,24);else g=new THREE.BoxGeometry(1,1,1);
   const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:p.color,roughness:.6}));m.position.set(p.position[0],p.position[1],p.position[2]);m.scale.set(p.scale[0],p.scale[1],p.scale[2]);m.rotation.set(p.rotation[0],p.rotation[1],p.rotation[2]);this.group.add(m);
  }
  this.group.rotation.set(0,0,0);this.group.position.set(0,0,0);
  const box=new THREE.Box3().setFromObject(this.group),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());for(const part of this.group.children)part.position.sub(center);
  const radius=Math.max(size.length()/2,.3);this.camera.position.set(radius*2.2,radius*1.4,radius*2.6);this.camera.lookAt(0,0,0);this.camera.far=radius*15;this.camera.updateProjectionMatrix();this.resize();
 }
 resize(){const{width,height}=this.host.getBoundingClientRect();if(width<1||height<1)return;this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.render();}
 render(){if(this.host.getBoundingClientRect().width>0)this.renderer.render(this.scene,this.camera);}
}
