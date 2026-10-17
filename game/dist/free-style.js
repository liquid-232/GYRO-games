// 风格值只由真实交战事件累积；暂停时不推进计时，重复擦过同一弹丸不会刷分。
const RANKS = [[0,'D'],[160,'C'],[360,'B'],[650,'A'],[1000,'S'],[1450,'SS'],[2000,'SSS']];
export class FreeStyle {
 constructor(){this.reset();}
 reset(){this.value=0;this.combo=0;this.chain=0;this.quiet=0;this.last='向前飞，寻找目标';this.flash=0;this.best='D';this.bestIndex=0;this.events=[];}
 update(dt){this.chain=Math.max(0,this.chain-dt);if(!this.chain)this.combo=0;const beforeQuiet=this.quiet;this.quiet+=dt;this.flash=Math.max(0,this.flash-dt);if(this.quiet>5)this.value=Math.max(0,this.value-32*(Math.max(0,this.quiet-5)-Math.max(0,beforeQuiet-5)));}
 add(label,points){this.value=Math.min(2400,this.value+points);this.quiet=0;this.last=label;this.flash=2;this.events.unshift(label+' +'+points);this.events.length=Math.min(3,this.events.length);const rank=this.rankIndex;if(rank>this.bestIndex){this.bestIndex=rank;this.best=RANKS[rank][1];}return points;}
 kill(drifting=false,weapon='gun'){this.combo=this.chain>0?this.combo+1:1;this.chain=8;return this.add(drifting?'漂移击杀':weapon==='missile'?'导弹命中击杀':weapon==='parry'?'弹反击杀':'击毁目标',100+Math.min(5,this.combo-1)*30+(drifting?80:0));}
 hurt(){this.value*=.65;this.combo=0;this.chain=0;this.last='受击 · 拉开距离';}
 get rankIndex(){let i=0;while(i+1<RANKS.length&&this.value>=RANKS[i+1][0])i++;return i;}
 get rank(){return RANKS[this.rankIndex][1];}
 get fill(){const i=this.rankIndex;return i===RANKS.length-1?1:(this.value-RANKS[i][0])/(RANKS[i+1][0]-RANKS[i][0]);}
}
