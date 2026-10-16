import {AdaptiveResolution} from './frame-timing.js';

// 按像素预算而不是屏幕 DPI 决定实际三维分辨率。默认优先稳定 60 FPS。
const presets=Object.freeze({
 fast:{label:'流畅',fps:60,pixels:1600*900,dpr:1,shadows:false,shadowHz:20,reflectionHz:0,reflectionSize:0,waterDetail:0,effectLimit:2,effectDetail:false},
 balanced:{label:'均衡',fps:60,pixels:1920*1080,dpr:1.2,shadows:true,shadowHz:20,reflectionHz:15,reflectionSize:512,waterDetail:1,effectLimit:4,effectDetail:true},
 high:{label:'精细',fps:120,pixels:2880*1620,dpr:1.6,shadows:true,shadowHz:30,reflectionHz:30,reflectionSize:960,waterDetail:1,effectLimit:6,effectDetail:true}
});
export class GraphicsSettings {
 constructor(renderer,nativeDpr=1) {
  this.renderer=renderer;this.nativeDpr=nativeDpr;this.mode='fast';this.onChange=null;
  try{const saved=localStorage.getItem('gyro-skystrike-graphics-v2');if(presets[saved])this.mode=saved;}catch{}
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  const gpu=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'';
  this.software=/swiftshader|llvmpipe|software/i.test(gpu);
  if(this.software)this.mode='fast';
  this.select=document.getElementById('renderQuality');this.status=document.getElementById('renderStats');
  this.select.value=this.mode;this.select.onchange=()=>this.setMode(this.select.value);
  this.lastDraw=-Infinity;this.frameCount=0;this.fpsAt=null;this.fpsCount=0;this.severeFrames=0;
  this.resize(innerWidth,innerHeight);
 }
 get profile(){return presets[this.mode];}
 setMode(mode){
  if(!presets[mode])return;
  this.mode=mode;this.select.value=mode;this.lastDraw=-Infinity;
  try{localStorage.setItem('gyro-skystrike-graphics-v2',mode);}catch{}
  this.resize(innerWidth,innerHeight);this.onChange?.();
 }
 resize(width,height){
  const maxRatio=Math.min(this.nativeDpr,this.profile.dpr,Math.sqrt(this.profile.pixels/Math.max(1,width*height)));
  this.resolution=new AdaptiveResolution(maxRatio,{minRatio:Math.min(maxRatio,.45)});
  this.renderer.setPixelRatio(this.resolution.ratio);this.renderer.setSize(width,height);
  this.severeFrames=0;
 }
 shouldDraw(now,playing){
  const interval=1000/(playing?this.profile.fps:30),gap=now-this.lastDraw;
  if(gap+.2<interval)return false;
  this.lastDraw=Number.isFinite(gap)?now-Math.max(0,gap-interval)%interval:now;
  this.frameCount++;return true;
 }
 record(now,frameMs,active,idle=false){
  // 大厅主动限制到 30 FPS；仅低于这一目标时才降低清晰度。
  let ratio=this.resolution.observe(frameMs*(idle?.5:1),active||idle);
  // 旧策略忽略所有超过 250 ms 的帧，极低帧率时会一直停留在高分辨率。
  if((active||idle)&&frameMs>250){
   if(++this.severeFrames>=2){
    ratio=Math.max(this.resolution.min,this.resolution.ratio*.75);
    this.resolution.ratio=ratio;this.severeFrames=0;
   }
  }else this.severeFrames=0;
  if(ratio!=null)this.renderer.setPixelRatio(ratio);
  if(this.fpsAt==null){this.fpsAt=now;this.fpsCount=0;return;}
  this.fpsCount++;
  if(now-this.fpsAt<500)return;
  const fps=Math.round(this.fpsCount*1000/(now-this.fpsAt));
  this.status.textContent=fps+' FPS';this.status.dataset.low=String(active&&fps<45);
  this.status.title=this.profile.label+' · '+this.renderer.domElement.width+' × '+this.renderer.domElement.height+
    (this.software?' · 检测到软件渲染，请开启浏览器硬件加速':'');
  this.fpsAt=now;this.fpsCount=0;
 }
}
