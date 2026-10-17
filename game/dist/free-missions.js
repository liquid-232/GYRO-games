// 任务状态与渲染分离；先关闭活动任务再结算，确保重复击毁/回调不能重复发奖。
export const CONTRACTS=Object.freeze({
 intercept:{title:'空中拦截',reward:300,description:'前往北部空域，击落三架指定巡逻机。',point:[-500,130,-450]},
 strike:{title:'雷达突袭',reward:400,description:'摧毁两座防空炮台，再摧毁雷达核心。',point:[520,0,-320]},
 escort:{title:'运输机护送',reward:500,description:'在西南空域会合，护送运输机通过三个航点。',point:[-450,120,460]}
});
export class FreeMissions {
 constructor(progress,notify=()=>{}){this.progress=progress;this.notify=notify;this.active=null;this.serial=0;}
 accept(kind){if(this.active||!Object.hasOwn(CONTRACTS,kind))return false;this.active={kind,id:++this.serial,stage:'travel',kills:0,turrets:0,waypoint:0,waves:0};this.notify('已接取：'+CONTRACTS[kind].title);return true;}
 arrive(){if(this.active?.stage==='travel'){this.active.stage='active';return true;}return false;}
 destroyed(role,missionId){const m=this.active;if(!m||m.id!==missionId||m.stage!=='active')return false;if(m.kind==='intercept'&&role==='interceptor'&&++m.kills>=3)return this.complete();if(m.kind==='strike'){if(role==='turret')m.turrets++;if(role==='radar'&&m.turrets>=2)return this.complete();}return false;}
 complete(){if(!this.active)return false;const spec=CONTRACTS[this.active.kind];this.active=null;this.progress.reward(spec.reward,true);this.notify(`任务完成 · ${spec.title} · +${spec.reward} 摩拉`);return true;}
 fail(reason='任务已放弃'){if(!this.active)return;this.active=null;this.notify(reason+' · 可重新接取');}
 reset(){this.active=null;}
}
