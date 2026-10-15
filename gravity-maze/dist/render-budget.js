// 按窗口大小限制像素开销；自动档只调整采样，不减少模型面数。
export function createRenderBudget(initial='auto'){
 let quality=initial,scale=1,average=16.7,samples=0,lastChange=0,ignoreUntil=0,fastSince=0;
 return {
  setQuality(value){quality=value;scale=1;average=16.7;samples=0;fastSince=0;},
  suspend(now){ignoreUntil=now+1800;average=16.7;samples=0;fastSince=0;},
  ratio(width,height,dpr=1){
   const target=quality==='ultra'?Math.min(2,Math.max(1.5,dpr)):quality==='balanced'?Math.min(1.25,Math.max(1,dpr)):Math.min(1.5,Math.max(1.25,dpr))*scale;
   const pixels=quality==='ultra'?8000000:quality==='balanced'?2500000:4000000;
   return Math.max(1,Math.min(target,Math.sqrt(pixels/(width*height))));
  },
  observe(now,delta){
   if(quality!=='auto'||now<ignoreUntil||delta<=0||delta>100)return false;
   average+=(delta-average)*.035;samples++;
   if(average>23.5)fastSince=0;else if(average<18.2&&!fastSince)fastSince=now;
   if(samples>90&&average>23.5&&now-lastChange>3000&&scale>.68){scale=Math.max(.68,scale-.1);lastChange=now;samples=0;fastSince=0;return true;}
   if(fastSince&&now-fastSince>12000&&now-lastChange>12000&&scale<1){scale=Math.min(1,scale+.05);lastChange=now;samples=0;fastSince=0;return true;}
   return false;
  }
 };
}