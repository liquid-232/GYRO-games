import assert from 'node:assert/strict';
import * as T from './dist/vendor/three.module.js';
import {createEnemyAircraft,ENEMY_EXTENTS} from './dist/enemy-model.js';
const first=createEnemyAircraft(),second=createEnemyAircraft();
assert.notEqual(first,second);assert.equal(first.children.filter(child=>child.isMesh).length,8);
let triangles=0;
for(let i=0;i<first.children.length;i++){
 const a=first.children[i],b=second.children[i];assert.equal(a.geometry,b.geometry);assert.equal(a.material,b.material);
 if(a.isLineSegments){assert.ok(a.geometry.attributes.position.count>100);continue;}
 const p=a.geometry.attributes.position,n=a.geometry.attributes.normal;triangles+=p.count/3;
 assert.equal(p.count,n.count);for(const v of p.array)assert.ok(Number.isFinite(v));
 for(let j=0;j<n.count;j++)assert.ok(Math.abs(Math.hypot(n.getX(j),n.getY(j),n.getZ(j))-1)<.001,'nonzero unit normals');
}
assert.ok(triangles<10000,`triangle budget: ${triangles}`);
const bounds=new T.Box3().setFromObject(first),size=bounds.getSize(new T.Vector3());
assert.ok(size.z>size.x&&size.z>4.7&&size.z<5.1,'long fuselage proportions');
assert.ok(Math.abs(bounds.max.x+bounds.min.x)<.01,'left-right symmetry');
assert.ok(bounds.max.z>2.4,'nose faces incoming +Z direction');
for(const side of ['left','right'])for(const part of ['wing','vertical-tail','engine','round-nozzle','intake-mouth'])assert.ok(first.userData.parts.includes(`${side}-${part}`));
first.position.x=4;first.rotation.z=.2;assert.equal(second.position.x,0);assert.ok(Math.abs(second.rotation.z)<1e-9);
assert.ok(ENEMY_EXTENTS.x>1.7&&ENEMY_EXTENTS.z>2.4);
console.log(`PASS: Su-35 geometry, normals, silhouette, paired components, independent transforms; ${triangles} triangles, 8 shared mesh batches plus 1 panel-line batch.`);
