import * as T from './vendor/three.module.js';
// 静态表面按材质合并，滚球、星星和终点保留独立变换。
export function mergeStatic(root,exclude=[]){
 const skip=new Set(exclude),batches=new Map(),geometries=new Set();root.updateMatrixWorld(true);
 for(const mesh of [...root.children]){
  if(!mesh.isMesh||skip.has(mesh))continue;
  const key=mesh.material.uuid;let batch=batches.get(key);if(!batch){batch={material:mesh.material,positions:[],normals:[],uvs:[],cast:false,receive:false};batches.set(key,batch);}
  const g=mesh.geometry,pos=g.attributes.position,norm=g.attributes.normal,uv=g.attributes.uv,indices=g.index,n=indices?.count??pos.count;
  const normalMatrix=new T.Matrix3().getNormalMatrix(mesh.matrix),v=new T.Vector3(),vn=new T.Vector3();
  for(let i=0;i<n;i++){const j=indices?indices.getX(i):i;v.fromBufferAttribute(pos,j).applyMatrix4(mesh.matrix);batch.positions.push(v.x,v.y,v.z);if(norm)vn.fromBufferAttribute(norm,j).applyMatrix3(normalMatrix).normalize();else vn.set(0,1,0);batch.normals.push(vn.x,vn.y,vn.z);batch.uvs.push(uv?uv.getX(j):0,uv?uv.getY(j):0);}
  batch.cast ||= mesh.castShadow;batch.receive ||= mesh.receiveShadow;geometries.add(g);root.remove(mesh);
 }
 for(const b of batches.values()){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(b.positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(b.normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(b.uvs,2));g.computeBoundingSphere();const mesh=new T.Mesh(g,b.material);mesh.castShadow=b.cast;mesh.receiveShadow=b.receive;root.add(mesh);}
 geometries.forEach(g=>g.dispose());
}
