import * as T from './vendor/three.module.js';
import {createGyroModel} from './gyro-model.js';
import {poseQuaternion} from './control-frame.js';
// 迷宫专属控制器预览，不加载任何飞机素材。
export class GyroPoseView {
 constructor(container,controller){
  this.container=container;this.controller=controller;this.visible=false;this.frame=null;
  this.renderer=new T.WebGLRenderer({canvas:document.getElementById('gyroModelCanvas'),antialias:true,alpha:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  this.scene=new T.Scene();this.scene.add(new T.HemisphereLight(0xe5f8ee,0x29415a,3));const light=new T.DirectionalLight(0xffe0ba,3);light.position.set(-3,-2,6);this.scene.add(light);
  this.body=createGyroModel();this.scene.add(this.body);this.body.add(new T.AxesHelper(1.6));this.camera=new T.PerspectiveCamera(38,1,.1,40);this.camera.up.set(0,0,1);this.setView(false);
  document.getElementById('gyroViewIso').onclick=()=>this.setView(false);document.getElementById('gyroViewTop').onclick=()=>this.setView(true);
  this.observer=new ResizeObserver(()=>{if(this.visible)this.resize();});this.observer.observe(container);
  this.onVisibility=()=>this.setVisible(this.visible);document.addEventListener('visibilitychange',this.onVisibility);
  window.addEventListener('pagehide',()=>this.dispose(),{once:true});
 }
 setNoseDirection(){} // 预览始终使用传感器真实轴，操控方向由控制器计算。
 setView(top){this.camera.position.set(...(top?[0,0,6]:[-3,-4,4]));this.camera.lookAt(0,0,0);document.getElementById('gyroViewIso').setAttribute('aria-pressed',!top);document.getElementById('gyroViewTop').setAttribute('aria-pressed',top);}
 resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 setVisible(visible){this.visible=visible&&this.controller.selected;if(this.frame!=null)cancelAnimationFrame(this.frame);this.frame=null;if(this.visible&&!document.hidden){this.resize();this.draw();}}
 draw(){if(!this.visible||document.hidden)return;const g=this.controller,p=g.feed.packet;if(g.fresh)poseQuaternion(p,this.body.quaternion);else if(!g.connected)this.body.quaternion.identity();
  document.getElementById('gyroModelState').textContent=g.fresh?'实时姿态 · 偏航为相对角度':!g.connected?'未连接 · 水平参考姿态':'等待有效数据 · 姿态已冻结';
  for(const [id,key] of [['gyroRollValue','roll'],['gyroPitchValue','pitch'],['gyroYawValue','yaw']])document.getElementById(id).textContent=g.fresh&&p?.[key]!=null?`${p[key].toFixed(1)}°`:'—';
  this.renderer.render(this.scene,this.camera);this.frame=requestAnimationFrame(()=>this.draw());
 }
 dispose(){this.setVisible(false);this.observer.disconnect();document.removeEventListener('visibilitychange',this.onVisibility);this.scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.renderer.dispose();}
}
