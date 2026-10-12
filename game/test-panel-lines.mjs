import assert from 'node:assert/strict';
import * as T from './dist/vendor/three.module.js';
import {createPanelLines} from './dist/panel-lines.js';
const mat=new T.MeshBasicMaterial();
const a=new T.Mesh(new T.BoxGeometry(1,.2,2),mat),b=new T.Mesh(new T.BoxGeometry(1,.2,2),mat);
a.position.x=-1;b.position.x=1;
const lines=createPanelLines([a,b],[[[-1.4,0],[1.4,0]]],{step:.04,offset:.005});
const p=lines.geometry.attributes.position;
assert.ok(p.count>20&&p.count%2===0);
for(let i=0;i<p.count;i+=2){
 assert.ok(Math.abs(p.getY(i)-.105)<1e-6,'line follows surface with only a small depth offset');
 assert.ok(Math.abs(p.getX(i+1)-p.getX(i))<.05,'never bridge a gap between separate surfaces');
 for(let j=i;j<i+2;j++)assert.ok(Math.abs(p.getX(j))>=.5,'no floating line over the hole');
}
assert.equal(lines.material.depthTest,true,'hidden seams must remain occluded');
assert.equal(lines.material.depthWrite,false);
const empty=createPanelLines([],[[[0,0],[1,1]]]);assert.equal(empty.geometry.attributes.position.count,0);
console.log('PASS: surface projection, depth offset, gaps, occlusion settings and empty geometry.');
