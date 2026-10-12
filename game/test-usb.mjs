import assert from 'node:assert/strict';
import { crc16, usbCommand, UsbFrameDecoder } from './dist/usb-protocol.js';
import { UsbSerialLink } from './dist/usb-link.js';
assert.equal(crc16(new TextEncoder().encode('123456789')),0x29b1);
const wrap=(magic,payload)=>{const bytes=new Uint8Array(payload.length+6);bytes.set(new TextEncoder().encode(magic));bytes.set(payload,4);new DataView(bytes.buffer).setUint16(bytes.length-2,crc16(bytes.subarray(0,-2)),true);return bytes;};
const pose=(sequence,roll=0)=>{const b=new Uint8Array(20),v=new DataView(b.buffer);b.set([71,89,66,50]);v.setUint32(4,sequence,true);v.setUint32(8,Math.round(performance.now()*1000)>>>0,true);v.setInt16(12,roll*100,true);v.setUint8(16,5);return wrap('GYU2',b);};
const ack=(op,id)=>{const b=new Uint8Array(9),v=new DataView(b.buffer);v.setUint8(0,op);v.setUint32(1,id,true);v.setUint32(5,Math.round(performance.now()*1000)>>>0,true);return wrap('GYA2',b);};
const join=(...parts)=>{const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}return bytes;};
for(let cut=1;cut<26;cut++){const decoder=new UsbFrameDecoder(),p=pose(42);assert.equal(decoder.push(p.slice(0,cut)).motion,null);assert.equal(decoder.push(p.slice(cut)).motion.getUint32(4,true),42);}
const bad=pose(1);bad[12]^=1;
const decoder=new UsbFrameDecoder();const batch=decoder.push(join(new Uint8Array([9,8,7]),bad,pose(2),ack(2,23),pose(3)));
assert.equal(batch.motion.getUint32(4,true),3,'only newest pose from a batch is applied');assert.equal(batch.replies[0].getUint32(1,true),23);
const shifted=join(new Uint8Array(7),pose(7));assert.equal(new UsbFrameDecoder().push(shifted.subarray(7)).motion.getUint32(4,true),7);
const bytes=usbCommand(1,0x12345678);assert.equal(new DataView(bytes.buffer).getUint32(5,true),0x12345678);assert.equal(crc16(bytes.subarray(0,9)),new DataView(bytes.buffer).getUint16(9,true));
// Reuse real controller DOM/BLE fixtures, then attach an actual Web Streams serial mock.
await import('./test-ble.mjs');
let input,opens=0,closes=0,sequence=0,signals;
const port={
 async open(){opens++;this.readable=new ReadableStream({start(c){input=c;}});this.writable=new WritableStream({write(bytes){
   const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);assert.equal(crc16(bytes.subarray(0,9)),v.getUint16(9,true));
   const op=v.getUint8(4),id=v.getUint32(5,true);input.enqueue(ack(op,id+1));input.enqueue(ack(op,id));input.enqueue(pose(++sequence));
 }});},async setSignals(s){signals=s;},async close(){closes++;}
};
navigator.serial={requestPort:async()=>port};
let samples=0,disconnections=0;
const link=new UsbSerialLink({onMotion(){samples++;},onDisconnect(){disconnections++;void link.disconnect();}});
await link.connect();assert.equal(link.connected,true);assert.ok(samples);assert.deepEqual(signals,{dataTerminalReady:false,requestToSend:false});
assert.equal((await link.command(1,99)).getUint32(1,true),99,'unrelated acknowledgments are ignored');
await link.disconnect();assert.equal(link.connected,false);assert.equal(closes,1);
await link.connect();input.close();await new Promise(r=>setTimeout(r,0));await link.closing;
assert.equal(disconnections,1);assert.equal(link.connected,false);
let resolveChooser;navigator.serial.requestPort=()=>new Promise(resolve=>{resolveChooser=resolve;});
const opening=link.connect();await link.disconnect();resolveChooser(port);await assert.rejects(opening,/取消/);assert.equal(opens,2,'cancelled selection cannot reopen a port');
navigator.serial.requestPort=async()=>port;
const {GyroController}=await import('./dist/gyro.js');
const controller=new GyroController({onInterrupt(){}});clearInterval(controller.uiTimer);
const $=id=>document.getElementById(id);$('controlMode').value='usb';$('controlMode').onchange();
assert.equal(controller.wired,true);await controller.connect();assert.equal(controller.connected,true);assert.equal($('gyroConnect').textContent,'连接 USB');
for(let i=0;i<20;i++)input.enqueue(pose(++sequence));await new Promise(r=>setTimeout(r,0));
controller.center();assert.equal(controller.canFly,true);input.enqueue(pose(++sequence,25));await new Promise(r=>setTimeout(r,0));assert.ok(controller.sample(.1).x>.99);
const neutral=controller.neutral;$('controlMode').value='keyboard';$('controlMode').onchange();assert.equal(controller.sample(.1),null);assert.equal(controller.neutral,neutral);
$('controlMode').value='gyro';$('controlMode').onchange();await controller.usb.closing;
assert.equal(controller.connected,false);assert.equal(controller.neutral,null);assert.equal(port.readable.locked,false);assert.equal(port.writable.locked,false);
console.log('PASS: USB CRC, splitting/batching/noise/corruption, handshakes, cancellation, disconnect/reconnect, serial locks and controller tilt/mode switching.');
