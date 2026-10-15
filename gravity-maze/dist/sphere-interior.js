import * as T from './vendor/three.module.js';

// 内部只展示装配骨架，不再放置会被误认为可玩的装饰槽道。
// 三层托架连到中空轴座；全部部件含厚度限制在半径 2.55 内。
export function addSphereInterior(board,m){
 const Y=new T.Vector3(0,1,0),TAU=Math.PI*2;
 const v=(x,y,z)=>new T.Vector3(x,y,z);
 const polar=(r,y,a)=>v(Math.cos(a)*r,y,Math.sin(a)*r);
 const add=(geometry,material)=>{const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;board.add(mesh);return mesh;};
 // 重复的小零件共享几何与现有材质，随后由外层按材质合并为静态网格。
 const cylinder=new T.CylinderGeometry(1,1,1,24,1),jointGeometry=new T.SphereGeometry(.068,24,16);
 const hoopGeometry=new T.TorusGeometry(1,.028,16,128);
 const screwCone=new T.CylinderGeometry(.078,.035,.042,32,1);
 const screwBack=new T.CylinderGeometry(.073,.073,.008,32,1);
 const sleeveGeometry=new T.CylinderGeometry(.104,.104,.105,32,1,true);
 function rod(a,b,radius=.04,material=m.frame){
  const delta=b.clone().sub(a),mesh=add(cylinder,material);
  mesh.scale.set(radius,delta.length(),radius);mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(Y,delta.normalize());return mesh;
 }
 function hoop(radius,y,material=m.frame){
  const mesh=add(hoopGeometry,material);mesh.rotation.x=Math.PI/2;
  mesh.scale.setScalar(radius);mesh.position.y=y;return mesh;
 }
 function ringPlate(outer,inner,depth){
  const shape=new T.Shape();shape.absarc(0,0,outer,0,TAU,false);
  const hole=new T.Path();hole.absarc(0,0,inner,0,TAU,true);shape.holes.push(hole);
  return new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.008,bevelThickness:.008,curveSegments:32});
 }
 const hubGeometry=ringPlate(.52,.245,.085),washerGeometry=ringPlate(.123,.081,.035);
 // 螺钉顶面用真正的十字开孔，深色槽底下沉；锥形头与塑料沉孔保持齐平。
 const face=new T.Shape();face.absarc(0,0,.076,0,TAU,false);
 const cross=new T.Path(),arm=.047,half=.010;
 cross.moveTo(-half,-arm);cross.lineTo(-half,-half);cross.lineTo(-arm,-half);cross.lineTo(-arm,half);
 cross.lineTo(-half,half);cross.lineTo(-half,arm);cross.lineTo(half,arm);cross.lineTo(half,half);
 cross.lineTo(arm,half);cross.lineTo(arm,-half);cross.lineTo(half,-half);cross.lineTo(half,-arm);cross.closePath();face.holes.push(cross);
 const screwFace=new T.ExtrudeGeometry(face,{depth:.009,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.0015,bevelThickness:.0015,curveSegments:24});
 function screw(point,scale=1,material=m.frame){
  const washer=add(washerGeometry,material);washer.rotation.x=-Math.PI/2;washer.scale.setScalar(scale);washer.position.copy(point).addScaledVector(Y,-.035*scale);
  const cone=add(screwCone,m.chrome);cone.scale.setScalar(scale);cone.position.copy(point).addScaledVector(Y,-.025*scale);
  const back=add(screwBack,m.frame);back.scale.setScalar(scale);back.position.copy(point).addScaledVector(Y,-.006*scale);
  const cap=add(screwFace,m.chrome);cap.rotation.x=-Math.PI/2;cap.rotation.z=.3;cap.scale.setScalar(scale);cap.position.copy(point).addScaledVector(Y,-.004*scale);
 }
 // 双椭圆开孔的扇形连接片是加强件；窄辐条与开孔保留通透视线。
 const webShape=new T.Shape(),a=.19;
 webShape.moveTo(.80*Math.cos(-a),.80*Math.sin(-a));webShape.lineTo(1.75*Math.cos(-a),1.75*Math.sin(-a));
 webShape.absarc(0,0,1.75,-a,a,false);webShape.lineTo(.80*Math.cos(a),.80*Math.sin(a));webShape.absarc(0,0,.80,a,-a,true);webShape.closePath();
 for(const [r,rx,ry] of [[1.04,.13,.080],[1.48,.17,.115]]){
  const hole=new T.Path();hole.absellipse(r,0,rx,ry,0,TAU,true,0);webShape.holes.push(hole);
 }
 const webGeometry=new T.ExtrudeGeometry(webShape,{depth:.045,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.01,bevelThickness:.01,curveSegments:24});
 const layers=[{y:1.32,r:1.88,material:m.tracks[1]},{y:0,r:2.22,material:m.tracks[0]},{y:-1.32,r:1.88,material:m.tracks[3]}];
 const phase=.18,angles=Array.from({length:6},(_,i)=>phase+i*TAU/6);
 // 中央连接轴为中空套筒，两端保留真实孔洞，不能被误读成另一颗钢珠。
 const shaft=add(new T.CylinderGeometry(.24,.24,2.66,48,1,true),m.frame);
 const innerShaft=add(new T.CylinderGeometry(.15,.15,2.66,48,1,true),m.frame);
 // 内筒反向法线指向孔洞，和外筒共同形成可见壁厚。
 innerShaft.geometry.scale(-1,1,1);innerShaft.geometry.computeVertexNormals();
 const shaftCap=new T.RingGeometry(.15,.24,48);
 for(const sign of [-1,1]){
  const cap=add(shaftCap,m.frame);cap.rotation.x=-sign*Math.PI/2;cap.position.y=sign*1.33;
 }
 for(const layer of layers){
  const {y,r,material}=layer,scale=r/1.88;
  hoop(r,y,material);hoop(r*.57,y,material);
  const hub=add(hubGeometry,material);hub.rotation.x=-Math.PI/2;hub.position.y=y-.045;
  for(const angle of angles){
   // 从轴座到外框的连续辐条穿过加强片，所有连接都能沿结构追踪。
   rod(polar(.48,y-.018,angle),polar(r,y-.018,angle),.039,m.frame);
   const web=add(webGeometry,material);web.rotation.set(-Math.PI/2,0,-angle);web.scale.set(scale,scale,1);web.position.y=y-.022;
   const anchor=polar(r-.065,y,angle);
   const sleeve=add(sleeveGeometry,material);sleeve.position.copy(anchor).addScaledVector(Y,-.012);
   screw(anchor.clone().addScaledVector(Y,.038),.84,material);
  }
  for(let i=0;i<3;i++)screw(polar(.39,y+.052,phase+i*TAU/3),.60,material);
 }
 // 六组斜撑逐层搭接，形成三角受力关系；端点都落在实际外环与螺柱下方。
 for(let i=0;i<angles.length;i++){
  const angle=angles[i],next=angles[(i+1)%angles.length];
  const top=polar(layers[0].r,1.32,angle),middle=polar(layers[1].r,0,angle),bottom=polar(layers[2].r,-1.32,angle);
  rod(top,middle,.045);rod(middle,bottom,.045);
  rod(top,polar(layers[1].r,0,next),.026);rod(middle,polar(layers[2].r,-1.32,next),.026);
  for(const point of [top,middle,bottom]){const joint=add(jointGeometry,m.frame);joint.position.copy(point);}
 }
 // 三层外沿最大包络不足 2.40，仍给 2.55 限界和外部可玩下潜轨道留出余量。
 board.userData.interiorLayers=3;
 board.userData.interiorRadiusLimit=2.55;
 board.userData.interiorStructure='open-assembly-frame';
}