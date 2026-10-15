/**
 * 原生全屏控制。进入请求在用户点击的同步调用栈中发出，避免浏览器拒绝手势。
 * 模块只管理画面与按钮，不修改游戏的运行、暂停或计时状态。
 */
export function createFullscreenControls({viewport,enterButton,exitButton,onChange=()=>{},onError=()=>{}}){
 let disposed=false,transitioning=false,transitionTimer=0,pending=null;
 const isFullscreen=()=>document.fullscreenElement===viewport;
 const clearTransition=()=>{clearTimeout(transitionTimer);transitionTimer=0;transitioning=false;};
 const beginTransition=(duration=1500)=>{
  clearTimeout(transitionTimer);transitioning=true;
  // 浏览器拒绝、取消或者未派发 change 时也会恢复普通失焦保护。
  transitionTimer=setTimeout(clearTransition,duration);
 };
 function sync(notify=true){
  const expanded=isFullscreen();
  enterButton.textContent=expanded?'退出全屏 ↙':'全屏查看 ⛶';
  enterButton.setAttribute('aria-pressed',String(expanded));
  enterButton.setAttribute('aria-label',expanded?'退出全屏，继续当前挑战':'全屏查看迷宫');
  enterButton.setAttribute('aria-controls',viewport.id);
  exitButton.hidden=!expanded;
  if(notify)onChange(expanded);
 }
 function failed(message,error){
  clearTransition();
  // 延后提示，避免被同一次“开始挑战”点击中的常规状态文字覆盖。
  return Promise.resolve().then(()=>{if(!disposed)onError(message,error);return false;});
 }
 function request(entering){
  if(disposed)return Promise.resolve(false);
  if(isFullscreen()===entering)return Promise.resolve(entering);
  if(pending)return pending;
  if(entering&&(!viewport.requestFullscreen||document.fullscreenEnabled===false)){
   return failed('当前浏览器不支持全屏，仍可在窗口中游玩。');
  }
  if(!entering&&!document.exitFullscreen)return failed('请按 Esc 退出全屏，挑战可继续进行。');
  beginTransition();
  let operation;
  try{
   // 不在此调用前 await：保留开始、继续和全屏按钮的用户手势权限。
   operation=entering?viewport.requestFullscreen():document.exitFullscreen();
  }catch(error){return failed(entering?'浏览器暂未允许全屏，仍可在窗口中游玩；可再点击“全屏查看”。':'暂时未能退出全屏，请按 Esc 返回窗口。',error);}
  pending=Promise.resolve(operation).then(()=>isFullscreen()).catch(error=>failed(
   entering?'浏览器暂未允许全屏，仍可在窗口中游玩；可再点击“全屏查看”。':'暂时未能退出全屏，请按 Esc 返回窗口。',error
  )).finally(()=>{pending=null;});
  return pending;
 }
 const enter=()=>request(true),exit=()=>request(false),toggle=()=>request(!isFullscreen());
 const onEnterClick=()=>{enterButton.blur();void toggle();};
 const onExitClick=()=>{exitButton.blur();void exit();};
 const onFullscreenChange=()=>{
  if(disposed)return;
  beginTransition(350);sync();
  // 全屏按钮藏起后，将键盘焦点留在游戏区，不截住方向键。
  if(document.activeElement===enterButton||document.activeElement===exitButton)viewport.focus({preventScroll:true});
 };
 const onEscape=event=>{
  // Esc 交给浏览器退出；提前标记过渡，主循环可避免误把退出视为暂停。
  if(event.code==='Escape'&&isFullscreen())beginTransition();
 };
 enterButton.addEventListener('click',onEnterClick);
 exitButton.addEventListener('click',onExitClick);
 document.addEventListener('fullscreenchange',onFullscreenChange);
 document.addEventListener('keydown',onEscape,true);
 sync(false);
 return {
  enter,exit,toggle,
  get isFullscreen(){return isFullscreen();},
  get isTransitioning(){return transitioning;},
  dispose(){
   disposed=true;clearTransition();
   enterButton.removeEventListener('click',onEnterClick);
   exitButton.removeEventListener('click',onExitClick);
   document.removeEventListener('fullscreenchange',onFullscreenChange);
   document.removeEventListener('keydown',onEscape,true);
  }
 };
}