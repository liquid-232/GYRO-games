import * as T from './vendor/three.module.js';
import {spherePoint} from './sphere-physics.js';
// 起终点共用标识：颜色之外，用箭头、棋盘格和英文文字同时区分；不增加实时灯光。
export function addEndpointMarkers(board,level){
 const orb=level.kind==='sphere',up=new T.Vector3(0,0,1);
 function make(cell,finish){
  const group=new T.Group();board.add(group);
  if(orb){group.position.set(...spherePoint(level,cell.x,cell.z,.065));group.quaternion.setFromUnitVectors(up,group.position.clone().normalize());}
  else{group.position.set(cell.x,.065,cell.z);group.rotation.x=-Math.PI/2;}
  const color=finish?0xffc347:0x35baff;
  const material=new T.MeshStandardMaterial({color,roughness:.3,metalness:.25,emissive:color,emissiveIntensity:.24});
  const ring=new T.Mesh(new T.TorusGeometry(.35,.055,16,64),material);group.add(ring);
  // 白色外沿与深色底盘把标识从彩色轨道中分离出来。
  const rim=new T.Mesh(new T.RingGeometry(.405,.43,64),new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide}));group.add(rim);
  const disk=new T.Mesh(new T.CircleGeometry(.29,48),new T.MeshBasicMaterial({color:0x122539,side:T.DoubleSide}));disk.position.z=.008;group.add(disk);
  const ink=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide});
  if(finish){
   for(let y=0;y<4;y++)for(let x=0;x<4;x++)if((x+y)%2===0){const square=new T.Mesh(new T.PlaneGeometry(.095,.095),ink);square.position.set((x-1.5)*.095,(y-1.5)*.095,.012);group.add(square);}
  }else{
   const shape=new T.Shape();shape.moveTo(0,.22);shape.lineTo(.17,-.06);shape.lineTo(.065,-.06);shape.lineTo(.065,-.21);shape.lineTo(-.065,-.21);shape.lineTo(-.065,-.06);shape.lineTo(-.17,-.06);shape.closePath();
   const arrow=new T.Mesh(new T.ShapeGeometry(shape),ink);arrow.position.z=.012;group.add(arrow);
  }
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  // 面向相机的标牌保留深度遮挡，避免把球背面的终点误认为在当前通道上。
  const label=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:true,depthWrite:false,toneMapped:false}));
  label.position.set(0,0,.48);label.scale.set(.78,.195,1);group.add(label);
  function paint(count=0){
   const ready=finish&&count===3;
   // 透明底色，仅绘制小号英文；轻微文字阴影保持复杂背景下的可读性。
   ctx.clearRect(0,0,512,128);
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=finish?'#ffc347':'#35baff';
   ctx.font='bold 88px Arial,sans-serif';ctx.shadowColor='rgba(5,15,25,.85)';ctx.shadowBlur=6;
   ctx.fillText(finish?'FINISH':'START',256,64);
   texture.needsUpdate=true;material.emissiveIntensity=ready?.7:.24;
  }
  paint();if(finish)ring.userData.setProgress=paint;
  return ring;
 }
 make(level.start,false);return make(level.goal,true);
}
