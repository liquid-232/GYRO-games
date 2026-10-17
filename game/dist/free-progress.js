// 空战收益独立存档；沿用旧键名以保留已有余额和升级，结算及购买立即保存。
export const SAVE_KEY='gyro-skystrike-free-v1';
export const UPGRADES=Object.freeze({armor:{name:'机体装甲',detail:'每级增加 1 格生命'},cannon:{name:'穿甲机炮',detail:'每级增加 20% 伤害'},missile:{name:'导弹整备',detail:'每级减少 1 秒冷却'}});
const initial=()=>({version:1,balance:0,completed:0,upgrades:{armor:0,cannon:0,missile:0}});
const integer=(v,max=1e9)=>Number.isSafeInteger(v)&&v>=0?Math.min(v,max):0;
export class FreeProgress {
 constructor(storage,warning=()=>{}){this.storage=storage;this.warning=warning;this.data=initial();this.writable=true;try{const raw=storage.getItem(SAVE_KEY);if(raw){const value=JSON.parse(raw);if(value.version!==1)throw Error('不支持的存档版本');this.data={version:1,balance:integer(value.balance),completed:integer(value.completed),upgrades:Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,integer(value.upgrades?.[k],2)]))};}}catch{this.writable=false;warning('存档读取失败：本次进度暂存于当前页面，原存档未覆盖。');}}
 save(){if(!this.writable){this.warning('进度尚未保存，请勿关闭页面。');return false;}try{this.storage.setItem(SAVE_KEY,JSON.stringify(this.data));return true;}catch{this.warning('浏览器保存失败：进度仅保留在当前页面。');return false;}}
 reward(amount,mission=false){this.data.balance=Math.min(1e9,this.data.balance+amount);if(mission)this.data.completed++;this.save();}
 buy(kind){if(!Object.hasOwn(UPGRADES,kind))return false;const level=this.data.upgrades[kind],price=level===0?300:600;if(level>=2||this.data.balance<price)return false;this.data.balance-=price;this.data.upgrades[kind]++;this.save();return true;}
 get health(){return 5+this.data.upgrades.armor;}
 get damage(){return 1+this.data.upgrades.cannon*.2;}
 get cooldown(){return 12-this.data.upgrades.missile;}
}
