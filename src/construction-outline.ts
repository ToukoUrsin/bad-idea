import * as THREE from 'three';
import type {InventionOutline} from './build-stream';
import type {Invention} from './spec';

type Point = {x:number;y:number;z:number};
type Shape = Invention['parts'][number]['shape'];
type ShapeGeometry = {surface:THREE.BufferGeometry;edges:THREE.EdgesGeometry};

/** A visual-only draft. Its permanent scene root is independent of generated code. */
export class ConstructionOutline {
 readonly group=new THREE.Group();
 readonly parts=new THREE.Group();
 readonly marker=new THREE.Group();
 private geometries=new Map<Shape,ShapeGeometry>();
 private edgeMaterial:THREE.LineBasicMaterial|null=null;
 private surfaceMaterial:THREE.MeshBasicMaterial|null=null;
 private markerMaterial:THREE.LineBasicMaterial|null=null;
 private markerGeometry:THREE.BufferGeometry|null=null;
 private mount:InventionOutline['mount'];
 private spawn=new THREE.Vector3();
 private hasSpawn=false;
 private elapsed=0;
 reducedMotion=false;

 constructor(){
  this.group.name='Invention construction preview';
  this.parts.name='Construction parts';this.marker.name='Construction marker';
  this.group.add(this.parts,this.marker);this.group.visible=false;
 }

 begin(position:Point,aim:Point){
  this.end();
  const length=Math.hypot(aim.x,aim.z),dx=length>.001?aim.x/length:1,dz=length>.001?aim.z/length:0;
  this.spawn.set(position.x+dx*2.6,position.y+.2,position.z+dz*2.6);
  this.parts.position.copy(this.spawn);
  this.marker.position.set(this.spawn.x,position.y-.74,this.spawn.z);
  this.edgeMaterial=new THREE.LineBasicMaterial({color:0x277c68,transparent:true,opacity:.76,depthWrite:false});
  this.surfaceMaterial=new THREE.MeshBasicMaterial({color:0x7bdbc0,transparent:true,opacity:.045,depthWrite:false,side:THREE.DoubleSide});
  this.markerMaterial=new THREE.LineBasicMaterial({color:0x277c68,transparent:true,opacity:.42,depthWrite:false});
  // Open corners read as a build location without inventing an unfinished shape.
  const vertices:number[]=[];
  for(const x of [-.53,.53])for(const z of [-.53,.53]){
   vertices.push(x,.015,z,x-Math.sign(x)*.19,.015,z,x,.015,z,x,.015,z-Math.sign(z)*.19);
   vertices.push(x,.015,z,x,.2,z);
  }
  for(const x of [-.34,.34])for(const z of [-.34,.34]){
   vertices.push(x,.85,z,x-Math.sign(x)*.12,.85,z,x,.85,z,x,.85,z-Math.sign(z)*.12);
   vertices.push(x,.85,z,x,.73,z);
  }
  this.markerGeometry=new THREE.BufferGeometry();
  this.markerGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  this.marker.add(new THREE.LineSegments(this.markerGeometry,this.markerMaterial));
  this.marker.visible=true;this.parts.visible=false;this.group.visible=true;
 }

 update(outline:InventionOutline){
  if(!this.group.visible||!this.edgeMaterial||!this.surfaceMaterial)return;
  if(outline.mount)this.mount=outline.mount;
  if(outline.spawn?.length===3&&outline.spawn.every(Number.isFinite)){
   this.spawn.fromArray(outline.spawn);this.hasSpawn=true;
  }
  for(let i=0;i<outline.parts.length;i++){
   const part=outline.parts[i],geometry=this.geometry(part.shape);
   let mesh=this.parts.children[i] as THREE.Mesh|undefined;
   if(!mesh){
    mesh=new THREE.Mesh(geometry.surface,this.surfaceMaterial);
    mesh.name=`Construction part ${i+1}`;
    const edges=new THREE.LineSegments(geometry.edges,this.edgeMaterial);edges.renderOrder=2;
    mesh.add(edges);this.parts.add(mesh);
   }else{
    mesh.geometry=geometry.surface;(mesh.children[0] as THREE.LineSegments).geometry=geometry.edges;
   }
   mesh.position.fromArray(part.position);mesh.scale.fromArray(part.scale);
   mesh.rotation.set(part.rotation[0],part.rotation[1],part.rotation[2]);
  }
  while(this.parts.children.length>outline.parts.length)this.parts.remove(this.parts.children[this.parts.children.length-1]);
  this.parts.visible=outline.parts.length>0;
  // Body-mounted parts can sit behind the first-person camera. Keep a small
  // world-space build cue visible while preserving every actual part's pose.
  this.marker.visible=!this.parts.visible||this.mount==='player';
  if(this.mount!=='player'){
   this.parts.position.copy(this.spawn);this.parts.rotation.set(0,0,0);
   if(this.hasSpawn&&!this.parts.visible)this.marker.position.set(this.spawn.x,this.spawn.y-.74,this.spawn.z);
  }
 }

 render(position:Point,yaw:number,delta:number){
  if(!this.group.visible)return;
  if(this.mount==='player'){
   this.parts.position.set(position.x,position.y,position.z);this.parts.rotation.set(0,yaw+Math.PI/2,0);
   this.marker.position.set(position.x-Math.sin(yaw)*2.6,position.y-.74,position.z-Math.cos(yaw)*2.6);
  }
  if(!this.reducedMotion)this.elapsed+=delta;
  const breath=this.reducedMotion?0:Math.sin(this.elapsed*1.6)*.045;
  if(this.edgeMaterial)this.edgeMaterial.opacity=.76+breath;
  if(this.markerMaterial)this.markerMaterial.opacity=.42+breath;
 }

 end(){
  this.group.visible=false;this.parts.clear();this.marker.clear();
  for(const geometry of this.geometries.values()){geometry.surface.dispose();geometry.edges.dispose();}
  this.geometries.clear();this.markerGeometry?.dispose();this.markerGeometry=null;
  this.edgeMaterial?.dispose();this.edgeMaterial=null;
  this.surfaceMaterial?.dispose();this.surfaceMaterial=null;
  this.markerMaterial?.dispose();this.markerMaterial=null;
  this.parts.visible=false;this.marker.visible=false;this.parts.rotation.set(0,0,0);
  this.mount=undefined;this.hasSpawn=false;this.elapsed=0;
 }

 private geometry(shape:Shape):ShapeGeometry {
  const cached=this.geometries.get(shape);if(cached)return cached;
  // Match GameView.mesh, including its four-sided cone and torus proportions.
  const surface=shape==='sphere'?new THREE.SphereGeometry(.5,16,12)
   :shape==='cylinder'?new THREE.CylinderGeometry(.5,.5,1,16)
   :shape==='cone'?new THREE.ConeGeometry(.5,1,4)
   :shape==='torus'?new THREE.TorusGeometry(.5,.13,8,20)
   :new THREE.BoxGeometry(1,1,1);
  const geometry={surface,edges:new THREE.EdgesGeometry(surface,12)};
  this.geometries.set(shape,geometry);return geometry;
 }
}
