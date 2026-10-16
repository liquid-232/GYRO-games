import * as T from './vendor/three.module.js';

// 仅用于刚创建的静态建筑/卫星，按材质合并变换后的网格。
// 不处理植被实例或动态部件，不释放输入引用的共享几何。
export function batchStaticMeshes(root) {
 root.updateMatrixWorld(true);
 const groups=new Map();
 root.traverse(mesh=>{
  if(!mesh.isMesh||mesh.isInstancedMesh||Array.isArray(mesh.material))return;
  const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
  g.applyMatrix4(mesh.matrixWorld);
  if(!groups.has(mesh.material))groups.set(mesh.material,[]);
  groups.get(mesh.material).push(g);
 });
 const result=new T.Group();result.name=root.name;
 for(const [material,pieces] of groups){
  const count=pieces.reduce((n,g)=>n+g.attributes.position.count,0),geometry=new T.BufferGeometry();
  for(const [name,size] of [['position',3],['normal',3],['uv',2]]){
   const data=new Float32Array(count*size);let offset=0;
   for(const g of pieces){const a=g.getAttribute(name);if(a)data.set(a.array,offset);offset+=g.attributes.position.count*size;}
   geometry.setAttribute(name,new T.BufferAttribute(data,size));
  }
  pieces.forEach(g=>g.dispose());geometry.computeBoundingSphere();
  const mesh=new T.Mesh(geometry,material);mesh.matrixAutoUpdate=false;result.add(mesh);
 }
 return result;
}
