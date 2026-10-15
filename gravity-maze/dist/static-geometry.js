import * as T from './vendor/three.module.js';
// 静态表面按材质合并，滚球、星星和终点保留独立变换。
// 保留源顶点索引：三角形、法线与 UV 不变，避免把共享顶点展开成三份。
export function mergeStatic(root,exclude=[]){
 const skip=new Set(exclude),batches=new Map(),geometries=new Set();root.updateMatrixWorld(true);
 // 第一遍只收集网格和容量，避免百万级几何先写入普通 JS 数组再复制。
 for(const mesh of root.children){
  if(!mesh.isMesh||skip.has(mesh))continue;
  const key=mesh.material.uuid;let batch=batches.get(key);
  if(!batch){batch={material:mesh.material,meshes:[],vertexCount:0,indexCount:0,cast:false,receive:false};batches.set(key,batch);}
  const g=mesh.geometry;batch.meshes.push(mesh);batch.vertexCount+=g.attributes.position.count;batch.indexCount+=g.index?.count??g.attributes.position.count;
  batch.cast ||= mesh.castShadow;batch.receive ||= mesh.receiveShadow;geometries.add(g);
 }
 const normalMatrix=new T.Matrix3(),v=new T.Vector3(),vn=new T.Vector3();
 for(const b of batches.values()){
  const positions=new Float32Array(b.vertexCount*3),normals=new Float32Array(b.vertexCount*3),uvs=new Float32Array(b.vertexCount*2);
  // 65535 是 WebGL 2 的固定图元重启索引值；达到该顶点编号时使用 32 位索引。
  const indices=b.vertexCount>65535?new Uint32Array(b.indexCount):new Uint16Array(b.indexCount);
  let vertexOffset=0,indexOffset=0;
  // 第二遍每个源顶点只变换一次，索引保留原顺序并加上当前材质批次的偏移。
  for(const mesh of b.meshes){
   const g=mesh.geometry,pos=g.attributes.position,norm=g.attributes.normal,uv=g.attributes.uv,sourceIndex=g.index;
   normalMatrix.getNormalMatrix(mesh.matrix);
   for(let i=0;i<pos.count;i++){
    const p=(vertexOffset+i)*3,t=(vertexOffset+i)*2;
    v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrix);positions[p]=v.x;positions[p+1]=v.y;positions[p+2]=v.z;
    if(norm)vn.fromBufferAttribute(norm,i).applyMatrix3(normalMatrix).normalize();else vn.set(0,1,0);
    normals[p]=vn.x;normals[p+1]=vn.y;normals[p+2]=vn.z;uvs[t]=uv?uv.getX(i):0;uvs[t+1]=uv?uv.getY(i):0;
   }
   const count=sourceIndex?.count??pos.count;
   for(let i=0;i<count;i++)indices[indexOffset+i]=vertexOffset+(sourceIndex?sourceIndex.getX(i):i);
   vertexOffset+=pos.count;indexOffset+=count;root.remove(mesh);
  }
  const g=new T.BufferGeometry();
  // BufferAttribute 直接持有预分配缓冲区，避免构造时再次复制 TypedArray。
  g.setAttribute('position',new T.BufferAttribute(positions,3));g.setAttribute('normal',new T.BufferAttribute(normals,3));g.setAttribute('uv',new T.BufferAttribute(uvs,2));g.setIndex(new T.BufferAttribute(indices,1));g.computeBoundingSphere();
  const mesh=new T.Mesh(g,b.material);mesh.castShadow=b.cast;mesh.receiveShadow=b.receive;root.add(mesh);
 }
 geometries.forEach(g=>g.dispose());
}
