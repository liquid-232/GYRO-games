export function crc16(bytes) {
  let crc=0xffff;
  for(const byte of bytes){crc^=byte<<8;for(let bit=0;bit<8;bit++)crc=((crc&0x8000)?(crc<<1)^0x1021:crc<<1)&0xffff;}
  return crc;
}
export function usbCommand(op,id) {
  const bytes=new Uint8Array(11);bytes.set([71,89,67,50]);
  const view=new DataView(bytes.buffer);view.setUint8(4,op);view.setUint32(5,id,true);view.setUint16(9,crc16(bytes.subarray(0,9)),true);
  return bytes;
}
export class UsbFrameDecoder {
  constructor(){this.buffer=new Uint8Array();}
  push(chunk){
    const bytes=new Uint8Array(this.buffer.length+chunk.length);bytes.set(this.buffer);bytes.set(chunk,this.buffer.length);
    let offset=0,motion=null;const replies=[];
    while(bytes.length-offset>=4){
      if(bytes[offset]!==71||bytes[offset+1]!==89||bytes[offset+3]!==50||![85,65].includes(bytes[offset+2])){offset++;continue;}
      const length=bytes[offset+2]===85?26:15;
      if(bytes.length-offset<length)break;
      const view=new DataView(bytes.buffer,offset,length);
      if(crc16(bytes.subarray(offset,offset+length-2))!==view.getUint16(length-2,true)){offset++;continue;}
      const payload=bytes.slice(offset+4,offset+length-2);
      if(length===26)motion=new DataView(payload.buffer);else replies.push(new DataView(payload.buffer));
      offset+=length;
    }
    this.buffer=bytes.slice(offset);
    return {motion,replies}; // Only the newest pose from a batch enters game control.
  }
}
