import assert from 'node:assert/strict';
const frame=(seq,us,flags=5)=>{const v=new DataView(new ArrayBuffer(20));v.setUint32(0,0x32425947,true);v.setUint32(4,seq,true);v.setUint32(8,us,true);v.setUint8(16,flags);return v;};
for(const path of ['./dist/ble-protocol.js','../gravity-maze/dist/ble-protocol.js']) {
  const {MotionFeed}=await import(path);const feed=new MotionFeed();
  feed.ingest(frame(1,1000000),1000);assert.equal(feed.receptionLatency(1000),null,'no clock sync');
  feed.anchorClock(1000000,1020,1000);feed.ingest(frame(2,1010000),1040);
  assert.deepEqual(feed.receptionLatency(1040),{min:9,max:31,clockAt:1020});
  assert.deepEqual(feed.receptionLatency(1100),feed.receptionLatency(1040),'arrival delay is not sample age');
  feed.ingest(frame(2,1010000),1100);assert.equal(feed.receptionLatency(1190),null,'duplicates cannot revive stale data');
  feed.ingest(frame(3,1020000,0),1110);assert.equal(feed.receptionLatency(1110),null,'sensor fault');
  feed.clear();feed.anchorClock(0xffffff00,1020,1000);feed.ingest(frame(1,0x2610),1040);
  assert.deepEqual(feed.receptionLatency(1040),{min:9,max:31,clockAt:1020},'microsecond wrap');
  feed.clear();feed.anchorClock(1000000,1020,1000);feed.ingest(frame(1,3000000),3030);
  assert.equal(feed.receptionLatency(3030),null,'stale clock anchor');
  feed.clear();assert.equal(feed.receptionLatency(0),null,'disconnect clears estimate');
}
await import('./test-ble.mjs');
const {GyroController}=await import('./dist/gyro.js');
const ctrl=new GyroController({onInterrupt(){}});clearInterval(ctrl.uiTimer);
ctrl.device={name:'test',gatt:{connected:true,disconnect(){this.connected=false;}}};ctrl.motion={};ctrl.control={};
const now=performance.now();ctrl.feed.anchorClock(1000000,now-20,now-40);ctrl.feed.ingest(frame(1,1010000),now);
ctrl.renderStatus();assert.equal(document.getElementById('gyroReceiveDelay').textContent,'9.0–31.0 ms');
ctrl.transport='usb';ctrl.renderStatus();assert.equal(document.getElementById('gyroReceiveDelay').textContent,'—');
ctrl.transport='ble';ctrl.disconnect();ctrl.renderStatus();assert.equal(document.getElementById('gyroReceiveDelay').textContent,'—');
console.log('PASS: both games receive-delay bounds, freshness, duplicates, clock wrap, sensor faults, disconnect and USB UI.');
