import * as T from './vendor/three.module.js';

// 球心内部是可看见装配关系的彩色轨道组件；实际滚球仍使用球面外层迷宫。
// 所有内部零件均限制在半径 3.65 内，给最内侧的实际球面通道留出独立空间。
export function addSphereInterior(board,m){
 const Y=new T.Vector3(0,1,0),TAU=Math.PI*2;
 const v=(x,y,z)=>new T.Vector3(x,y,z);
 const add=(geometry,material)=>{const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;board.add(mesh);return mesh;};
 const curve=points=>new T.CatmullRomCurve3(points,false,'centripetal');
 const sample=(fn,count)=>Array.from({length:count+1},(_,i)=>fn(i/count));

 // 圆角矩形截面沿曲线连续扫描：宽面、侧面和圆角共享平滑法线，没有短管拼接缝。
 function roundedSection(width,height,radius){
  const out=[],hw=width/2,hh=height/2,r=Math.min(radius,hw,hh);
  for(let corner=0;corner<4;corner++){
   const cx=[hw-r,-hw+r,-hw+r,hw-r][corner],cy=[hh-r,hh-r,-hh+r,-hh+r][corner];
   for(let step=0;step<=4;step++){
    const a=(corner+step/4)*Math.PI/2;out.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);
   }
  }
  return out;
 }
 function sweep(path,width,height,radius,material,sideOffset=0,upOffset=0){
  const steps=Math.min(280,Math.max(72,Math.ceil(path.getLength()*18))),section=roundedSection(width,height,radius),count=section.length;
  const p=[],uv=[],indices=[];
  for(let i=0;i<=steps;i++){
   const t=i/steps,position=path.getPointAt(t),tangent=path.getTangentAt(t).normalize();
   const side=Y.clone().cross(tangent).normalize(),up=tangent.clone().cross(side).normalize();
   for(let j=0;j<count;j++){
    const [x,y]=section[j],point=position.clone().addScaledVector(side,x+sideOffset).addScaledVector(up,y+upOffset);
    p.push(...point);uv.push(t,j/count);
   }
  }
  for(let i=0;i<steps;i++)for(let j=0;j<count;j++){
   const k=i*count+j,next=i*count+(j+1)%count;indices.push(k,next,k+count,k+count,next,next+count);
  }
  // 端面也封闭，避免从透明外壳看见模型内部的空壳穿帮。
  for(const [base,reverse] of [[0,true],[steps*count,false]])for(let j=1;j<count-1;j++){
   indices.push(...(reverse?[base,base+j+1,base+j]:[base,base+j,base+j+1]));
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  return add(geometry,material);
 }
 function channel(path,material,width=.55){
  // U 形槽由有厚度的底板和两侧圆角护栏组成，与真实注塑玩具的槽道一致。
  sweep(path,width,.075,.026,material,0,-.038);
  for(const sign of [-1,1])sweep(path,.065,.19,.03,material,sign*(width/2-.027),.058);
 }
 function rod(a,b,radius=.045,material=m.frame){
  const delta=b.clone().sub(a),mesh=add(new T.CylinderGeometry(radius,radius,delta.length(),24,1),material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(Y,delta.normalize());return mesh;
 }
 function hoop(radius,y,thickness=.045,material=m.frame){
  const mesh=add(new T.TorusGeometry(radius,thickness,16,144),material);mesh.rotation.x=Math.PI/2;mesh.position.y=y;return mesh;
 }

 // 上层开放式环道，中层 S 弯，下层环形收拢螺旋，形成清楚可辨的三个高度。
 const upper=curve(sample(t=>{const a=-.3*Math.PI+t*1.55*Math.PI;return v(Math.cos(a)*2.35,1.57+.12*Math.sin(a*2),Math.sin(a)*2.35);},52));
 const middle=curve([v(-2.2,.08,-.9),v(-1.3,.08,-1.23),v(-.45,.08,-.68),v(.45,.08,.68),v(1.3,.08,1.23),v(2.2,.08,.9)]);
 const lower=curve(sample(t=>{const a=t*1.65*Math.PI;return v(Math.cos(a)*2.35,-1.50-.08*t,Math.sin(a)*2.35);},54));
 const inward=curve(sample(t=>{const a=1.65*Math.PI+t*Math.PI*1.5,r=2.35-1.73*t;return v(Math.cos(a)*r,-1.58-.21*t,Math.sin(a)*r);},60));
 const dropA=curve([upper.getPoint(1),v(-1.41,1.62,-1.91),v(-1.66,1.03,-2.21),v(-2.26,.48,-1.72),v(-2.53,.13,-.78),middle.getPoint(0)]);
 const dropB=curve([middle.getPoint(1),v(2.51,-.04,.79),v(2.68,-.69,.14),v(2.35,-1.43,-.35),lower.getPoint(0)]);
 channel(upper,m.tracks[1],.56);channel(dropA,m.tracks[1],.56);
 channel(middle,m.tracks[0],.58);channel(dropB,m.tracks[0],.56);
 channel(lower,m.tracks[2],.56);channel(inward,m.tracks[3],.54);

 // 小型回收托盘接住内圈末端；只使用塑料材质，避免误认成可收集物或另一颗钢珠。
 const end=inward.getPoint(1),cup=add(new T.CylinderGeometry(.40,.34,.075,64,1),m.tracks[3]);cup.position.copy(end).add(v(0,-.045,0));
 const lip=add(new T.TorusGeometry(.365,.035,16,64),m.tracks[3]);lip.position.copy(end).add(v(0,.015,0));lip.rotation.x=Math.PI/2;

 // 上下承重环、六根立柱和横向连接片构成可追踪的装配框架，槽道不悬浮。
 const frameRadius=2.82,frameBottom=-1.96,frameTop=1.33;
 hoop(frameRadius,frameBottom,.052);hoop(frameRadius,frameTop,.052);
 const pillars=Array.from({length:6},(_,i)=>{const a=(i+.18)/6*TAU;return v(Math.cos(a)*frameRadius,0,Math.sin(a)*frameRadius);});
 for(const p of pillars){
  rod(v(p.x,frameBottom,p.z),v(p.x,frameTop,p.z),.048);
  for(const y of [frameBottom,frameTop]){const collar=add(new T.CylinderGeometry(.09,.09,.09,24),m.frame);collar.position.set(p.x,y,p.z);}
 }
 for(const [path,step] of [[upper,.2],[middle,.25],[lower,.2],[inward,.25]])for(let t=0;t<1.01;t+=step){
  const point=path.getPointAt(Math.min(1,t)).add(v(0,-.095,0));
  const nearest=pillars.reduce((a,b)=>Math.hypot(point.x-a.x,point.z-a.z)<Math.hypot(point.x-b.x,point.z-b.z)?a:b);
  const anchor=v(nearest.x,Math.min(frameTop,point.y-.06),nearest.z);
  rod(anchor,point,.035);
 }

 // 最下层镂空托架用同心肋和辐条支撑螺旋槽，透过空隙仍然能看见背后的结构。
 for(const radius of [.55,1.25,1.95])hoop(radius,frameBottom,.027);
 for(let i=0;i<6;i++){
  const a=(i+.18)/6*TAU;
  rod(v(Math.cos(a)*.48,frameBottom,Math.sin(a)*.48),v(Math.cos(a)*frameRadius,frameBottom,Math.sin(a)*frameRadius),.037);
 }
 board.userData.interiorLayers=3;
 board.userData.interiorRadiusLimit=3.65;
}


