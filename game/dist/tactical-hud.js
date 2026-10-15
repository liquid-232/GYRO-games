// A forward-looking display of actual game objects, not decorative radar contacts.
const canvas=document.getElementById('tacticalRadar'),ctx=canvas.getContext('2d');
const clock=document.getElementById('missionClock'),route=document.getElementById('missionDistance'),killsLabel=document.getElementById('missionKills');
let previousMode='',lastRefresh=-Infinity;
export function updateTacticalHUD({mode,player,objects,elapsed,distance,kills},now){
  if(mode!==previousMode){document.body.dataset.screen=mode;previousMode=mode;lastRefresh=-Infinity;}
  if(mode!=='playing'||now-lastRefresh<100)return;
  lastRefresh=now;
  const seconds=Math.floor(elapsed);clock.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  route.textContent=`${(distance/1000).toFixed(2)} KM`;killsLabel.textContent=String(kills).padStart(2,'0');
  if(!ctx)return;
  const w=canvas.width,h=canvas.height,px=w/2,py=h-25;
  ctx.clearRect(0,0,w,h);ctx.lineWidth=1;ctx.strokeStyle='#b2c39528';
  for(let x=30;x<w;x+=38){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=15;y<h;y+=36){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  ctx.fillStyle='#a9bd7d0a';ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(30,10);ctx.lineTo(w-30,10);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#c5d9a442';ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px,0);ctx.stroke();ctx.setLineDash([]);
  for(const object of objects){
    const ahead=player.z-object.mesh.position.z,side=object.mesh.position.x-player.x;
    if(ahead<0||ahead>140||Math.abs(side)>20)continue;
    const x=px+side*(w-32)/40,y=py-ahead*(h-38)/140;
    if(object.type==='enemy'){ctx.strokeStyle='#f48769';ctx.fillStyle='#f4876940';ctx.beginPath();ctx.moveTo(x,y-7);ctx.lineTo(x+6,y);ctx.lineTo(x,y+7);ctx.lineTo(x-6,y);ctx.closePath();ctx.fill();ctx.stroke();}
    else if(object.type==='rock'){ctx.fillStyle='#caba8d';ctx.fillRect(x-4,y-4,8,8);}
    else {ctx.fillStyle='#bfd99d';ctx.beginPath();ctx.arc(x,y,2.4,0,Math.PI*2);ctx.fill();}
  }
  ctx.fillStyle='#edf3dc';ctx.beginPath();ctx.moveTo(px,py-8);ctx.lineTo(px+7,py+6);ctx.lineTo(px,py+3);ctx.lineTo(px-7,py+6);ctx.closePath();ctx.fill();
}
