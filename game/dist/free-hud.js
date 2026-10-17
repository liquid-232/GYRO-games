import { CONTRACTS } from './free-missions.js';
import { UPGRADES } from './free-progress.js';
const $=id=>document.getElementById(id);
// 自由模式界面只刷新可见仪表；任务和补给面板共享游戏暂停状态。
export class FreeHUD {
 constructor(session){
  this.session=session;this.last=-Infinity;
  const host=document.createElement('div');host.id='freeInterface';host.hidden=true;
  host.innerHTML=`<div class="free-toolbar"><button id="freeTasks">任务 M</button><button id="freeDodge" title="E：翻滚闪避；起手瞬间可反弹近处弹丸">闪避 E</button><button id="freeLevel">摆平 R</button><button id="freeBoost">加速</button><button id="freeBrake" title="按住并转向，刹车漂移">急转 X</button><label>驾驶 <select id="freePilot"><option value="assist">辅助 · 推荐</option><option value="expert">特技 · 全姿态</option></select></label><label>镜头 <select id="freeCamera"><option value="stable">稳定追尾</option><option value="body">机身跟随</option></select></label></div><div id="freeObjective" class="free-objective"></div><div id="freeSaveWarning" role="alert"></div><div id="freeWaypoint" class="free-waypoint"></div><div id="freeLock" class="free-lock" hidden>LOCK</div><div id="freeLock2" class="free-lock" hidden>02</div><div id="freeLock3" class="free-lock" hidden>03</div><div class="ace-style" id="aceStyle"><small>STYLE / 风格</small><b id="aceRank">D</b><div class="ace-meter"><i id="aceMeter"></i></div><span id="aceCombo"></span><p id="aceEvent"></p></div><div id="aceTargetHint" class="ace-target-hint"></div><div id="aceThreat" class="ace-threat" hidden></div><div id="aceTutorial" class="ace-tutorial"></div><section id="freePanel" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="freePanelTitle"><div class="free-panel-content"><span class="eyebrow">FREE FLIGHT / 自由探索</span><h2 id="freePanelTitle"></h2><div id="freePanelBody"></div><button id="freePanelClose" class="primary">返回飞行</button></div></section>`;
  document.getElementById('app').append(host);this.host=host;
  $('freeTasks').onclick=()=>session.openPanel('tasks');$('freeDodge').onclick=()=>session.dodge();$('freePilot').value=session.assisted?'assist':'expert';$('freePilot').onchange=()=>{session.setAssisted($('freePilot').value==='assist');$('freePilot').blur();};$('freeLevel').onclick=()=>session.flight.level();
  $('freeCamera').onchange=()=>{session.bodyCamera=$('freeCamera').value==='body';$('freeCamera').blur();try{localStorage.setItem('gyro-skystrike-free-camera',session.bodyCamera?'body':'stable');}catch{}};
  try{session.bodyCamera=localStorage.getItem('gyro-skystrike-free-camera')==='body';$('freeCamera').value=session.bodyCamera?'body':'stable';}catch{}
  for(const [id,key] of [['freeBoost','boost'],['freeBrake','brake']]){
   const button=$(id);button.onpointerdown=e=>{button.setPointerCapture(e.pointerId);session.touchThrottle[key]=true;};
   for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{session.touchThrottle[key]=false;});
  }
  $('freePanelClose').onclick=()=>session.closePanel();
  $('freePanelBody').onclick=e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.restartSortie!==undefined){session.abandon();session.clearCombat();session.style.reset();session.hp=session.progress.health;session.cooldown=0;session.sortieRequested=true;session.sortie.start();session.closePanel();}if(button.dataset.contract)session.accept(button.dataset.contract);if(button.dataset.upgrade){session.progress.buy(button.dataset.upgrade);session.hp=session.progress.health;this.panel('supply');}if(button.dataset.abandon!==undefined){session.abandon();this.panel('tasks');}};
 }
 visible(on){this.host.hidden=!on;this.last=-Infinity;document.body.classList.toggle('free-flight',on);}
 panel(kind){
  $('freePanel').classList.toggle('hidden',!kind);if(!kind)return;
  const s=this.session,p=s.progress.data,m=s.missions.active;
  $('freePanelTitle').textContent=kind==='supply'?'基地补给 · 已免费维修':'自由任务';
  let content=kind==='supply'?Object.entries(UPGRADES).map(([key,spec])=>{const level=p.upgrades[key],price=level===0?300:600;return `<article><h3>${spec.name} <small>${level}/2</small></h3><p>${spec.detail}</p><button data-upgrade="${key}" ${level>=2||p.balance<price?'disabled':''}>${level>=2?'已满级':price+' 摩拉升级'}</button></article>`;}).join(''):Object.entries(CONTRACTS).map(([key,spec])=>`<article><h3>${spec.title} <small>+${spec.reward} 摩拉</small></h3><p>${spec.description}</p><button data-contract="${key}" ${m||s.sortie.active?'disabled':''}>${m?.kind===key?'执行中':'接取任务'}</button></article>`).join('');
  if(kind==='sortie'){
   $('freePanelTitle').textContent='战区清空 · 王牌速战完成';
   content=`<article><h3>最高风格 ${s.style.best}</h3><p>击毁 ${s.sortie.defeated} 架敌机<br>波次与通关奖励 ${s.sortie.reward} 摩拉，${s.storageWarning?'暂存本次会话，请查看存档提示':'已保存'}。</p><button data-restart-sortie>再来一轮</button></article>`;
  }
  $('freePanelBody').innerHTML=`<p>账户 <b>${p.balance}</b> 摩拉 · 已完成 ${p.completed} 次任务</p><div class="free-contracts">${content}</div>${kind==='tasks'&&(m||s.sortie.active)?'<button data-abandon>结束当前任务 / 速战，返回自由巡航</button>':''}<div class="free-help"><strong>先学三个动作就能开打</strong><br>① A/D 或左右倾斜转向，W/S 或前后倾斜升降。<br>② 把敌机带到机头前方，自动机炮辅助瞄准；Q 锁定导弹。<br>③ 遇到来袭提示按 E 闪避，起手瞬间可弹反近处弹丸。<br>进阶：按住 X/Ctrl 或「急转」再转向，刹车漂移追尾；Shift 加速。<br>辅助模式松手回正、自动避地；切换「特技」可完整滚转和翻筋斗，R 摆平。<br>蓝色补给圈内低速停留 3 秒，免费维修和升级。M / P 暂停。</div>`;
  $('freePanelClose').focus();
 }
 update(now){
  if(!this.session.active||now-this.last<100)return;this.last=now;
  const s=this.session,f=s.flight,m=s.missions.active,p=s.progress.data;
  $('score').textContent=String(s.score).padStart(6,'0');$('coins').textContent=p.balance;
  const health=$('health');if(health.children.length!==s.progress.health)health.innerHTML='<i></i>'.repeat(s.progress.health);[...health.children].forEach((v,i)=>v.classList.toggle('empty',i>=s.hp));
  $('alt').textContent=Math.round(f.position.y+3);$('speed').textContent=Math.round(f.speed*3.6)+' KM/H';$('sector').textContent='自由';
  const seconds=Math.floor(s.elapsed);$('missionClock').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  $('missionDistance').textContent=(f.distance/1000).toFixed(2)+' KM';$('missionKills').textContent=String(s.kills).padStart(2,'0');
  let status='自由巡航 · M 选择任务 · 蓝色航标返回基地';
  if(m){status=CONTRACTS[m.kind].title+' · '+(m.stage==='travel'?'前往任务空域':m.kind==='intercept'?`击落 ${m.kills}/3`:m.kind==='strike'?`炮台 ${m.turrets}/2 · ${m.turrets<2?'雷达护盾开启':'攻击雷达核心'}`:`航点 ${Math.min(3,m.waypoint)}/3 · 运输机 ${Math.max(0,s.transport.hp)}/12`);}
  if(s.sortie.active)status=s.sortie.description;
  if(s.supplyTime>0)status=`补给接入 ${s.supplyTime.toFixed(1)}/3 秒 · 保持减速`;
  if(f.returning)status='已越出战区 · 辅助返航中';else if(Math.hypot(f.position.x,f.position.z)>1050)status+=' · 接近战区边界';
  if(f.groundAssist||s.rescueTimer>0)status+=' · 自动避地';
  $('freeObjective').textContent=status;$('freeSaveWarning').textContent=s.storageWarning||'';
  const point=s.waypoint(),relative=s.scratch.copy(point).sub(f.position),distance=relative.length(),height=relative.y;
  const label=$('freeWaypoint');label.hidden=s.sortie.active;s.project.copy(point).project(s.camera);
  const visible=relative.dot(f.forward)>0&&Math.abs(s.project.x)<.85&&Math.abs(s.project.y)<.7;
  label.style.left=visible?`${(s.project.x*.5+.5)*100}%`:'50%';label.style.top=visible?`${(-s.project.y*.5+.5)*100}%`:(innerWidth<760?'36%':'25%');
  label.textContent=`${s.sortie.active?'◆ 敌机':m?'◆ 任务':'◇ 基地'} ${Math.round(distance)}m · ${height>=0?'↑':'↓'}${Math.round(Math.abs(height))}m${visible?'':' · 转向寻找航标'}`;
  $('aceRank').textContent=s.style.rank;$('aceStyle').dataset.rank=s.style.rank;$('aceMeter').style.transform=`scaleX(${s.style.fill})`;
  $('aceCombo').textContent=s.style.combo>1?`${s.style.combo} 连击`:'连杀 / 擦弹 / 弹反';$('aceEvent').textContent=s.style.flash>0?s.style.last:'';
  $('freeDodge').disabled=!s.canAct()||s.dodgeCooldown>0;$('freeDodge').textContent=s.dodgeCooldown>0?`闪避 ${s.dodgeCooldown.toFixed(1)}s`:'闪避 E';
  const threat=$('aceThreat');threat.hidden=!(s.threatDistance<110);threat.textContent=s.dodgeCooldown>0?'来袭弹丸 · 转向避让':'来袭弹丸 · E 闪避 / 弹反';
  const tutorial=$('aceTutorial');tutorial.hidden=s.elapsed>24;tutorial.textContent=s.assisted?'左右转向 · 上下升降 · 机炮自动瞄准 · Q 导弹 · E 闪避':'A/D 滚转 · W/S 俯仰 · R 摆平 · Q 导弹 · E 闪避';
  const nearest=s.nearestThreat(),hint=$('aceTargetHint');hint.hidden=!nearest;
  if(nearest){s.delta.subVectors(nearest.mesh.position,f.position);const ahead=s.delta.dot(f.forward),side=s.delta.dot(f.right);hint.textContent=ahead<0?`${side>=0?'右':'左'}转寻找身后敌机 · 按住 X 急转`:Math.abs(side)>Math.abs(ahead)*.35?`${side>=0?'→ 右':'← 左'}侧敌机 · ${Math.round(s.delta.length())}m`:Math.abs(s.delta.y)>35?`${s.delta.y>0?'↑ 抬头':'↓ 低头'}寻找敌机 · 高度差 ${Math.round(Math.abs(s.delta.y))}m`:`前方敌机 ${Math.round(s.delta.length())}m · Q 锁定齐射`;}
  this.radar();
 }
 weapon(){
  const s=this.session,targets=s.lockTargets(s.assisted?3:1),target=targets[0],ready=s.canAct()&&s.cooldown<=0&&!!target;
  $('missileSkill').title=`Q：冷启动跟踪导弹 · ${s.missileCooldown} 秒冷却`;$('missileSkill').disabled=!ready;$('missileSkill').setAttribute('data-ready',String(ready));
  $('missileStatus').textContent=s.cooldown>0?s.cooldown.toFixed(1)+' 秒':target?(s.assisted?`${targets.length} 目标锁定 · Q 齐射`:'锁定目标 · Q 发射'):'寻找前方目标';
  $('missileSkill').setAttribute('aria-label','冷启动跟踪导弹，'+$('missileStatus').textContent);
  $('missileProgress').style.transform=`scaleX(${1-s.cooldown/s.missileCooldown})`;
  for(let i=0;i<3;i++){const marker=$(i===0?'freeLock':`freeLock${i+1}`),locked=targets[i];marker.hidden=!locked;if(locked){s.project.copy(locked.mesh.position).project(s.camera);marker.hidden=s.project.z>1||Math.abs(s.project.x)>1||Math.abs(s.project.y)>1;marker.style.left=`${(s.project.x*.5+.5)*100}%`;marker.style.top=`${(-s.project.y*.5+.5)*100}%`;}}
  // 准星指向真实机头射线，避免追尾镜头高度造成近距离瞄准偏差。
  s.project.copy(s.flight.position).addScaledVector(s.flight.forward,180).project(s.camera);
  $('reticle').style.left=`calc(${(s.project.x*.5+.5)*100}% - 14px)`;$('reticle').style.top=`calc(${(-s.project.y*.5+.5)*100}% - 14px)`;
 }
 radar(){
  const s=this.session,c=$('tacticalRadar'),ctx=c.getContext('2d');if(!ctx)return;
  const w=c.width,h=c.height,cx=w/2,cy=h/2,scale=Math.min(w,h)/2400;
  ctx.clearRect(0,0,w,h);ctx.strokeStyle='#779c9144';for(const r of [50,100]){ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();}
  const draw=(point,color,size)=>{ctx.fillStyle=color;ctx.fillRect(cx+(point.x-s.flight.position.x)*scale-size/2,cy+(point.z-s.flight.position.z)*scale-size/2,size,size);};
  draw(s.base, '#6edcfd',8);for(const target of s.targets)if(target.alive)draw(target.mesh.position,target.role==='transport'?'#75e6b0':'#ff8769',5);
  draw(s.waypoint(),'#ffe39c',7);ctx.save();ctx.translate(cx,cy);ctx.rotate(Math.atan2(s.flight.forward.x,-s.flight.forward.z));ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(5,6);ctx.lineTo(-5,6);ctx.closePath();ctx.fill();ctx.restore();ctx.fillStyle='#bfd8cf';ctx.font='16px sans-serif';ctx.fillText('N ↑  /  全向 2.4 km',8,20);
 }
}
