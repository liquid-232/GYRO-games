import { UsbFrameDecoder, usbCommand } from './usb-protocol.js';
export class UsbSerialLink {
  constructor({onMotion,onDisconnect}) {
    this.onMotion=onMotion;this.onDisconnect=onDisconnect;this.connected=false;this.generation=0;
    this.pending=new Map();this.closing=Promise.resolve();
  }
  async connect(){
    const generation=++this.generation;
    // Device selection must begin directly in the connect button's user gesture.
    const port=await navigator.serial.requestPort({filters:[{usbVendorId:0x303a,usbProductId:0x1001}]});
    await this.closing;
    if(generation!==this.generation)throw Error('USB 连接已取消');
    await port.open({baudRate:115200,bufferSize:1024});
    if(generation!==this.generation){await port.close();throw Error('USB 连接已取消');}
    try {
      await port.setSignals({dataTerminalReady:false,requestToSend:false});
      if(generation!==this.generation){await port.close();throw Error('USB 连接已取消');}
      this.port=port;this.reader=port.readable.getReader();this.writer=port.writable.getWriter();this.connected=true;
      const decoder=new UsbFrameDecoder(),reader=this.reader;
      this.readTask=this.readLoop(reader,decoder,generation);
      await this.command(2,crypto.getRandomValues(new Uint32Array(1))[0]);
    } catch(error){
      if(this.port===port)await this.disconnect();else await port.close().catch(()=>{});
      throw error;
    }
  }
  async readLoop(reader,decoder,generation){
    try{
      while(this.connected&&generation===this.generation){
        const {value,done}=await reader.read();if(done)break;
        if(generation!==this.generation)break;
        const {motion,replies}=decoder.push(value);
        for(const reply of replies){
          const command=this.pending.get(reply.getUint32(1,true));
          if(command&&reply.getUint8(0)===command.op)command.resolve(reply);
        }
        if(motion)this.onMotion(motion);
      }
      if(this.connected&&generation===this.generation)this.onDisconnect('USB 连接已断开，请检查数据线并重新连接。');
    }catch(error){if(this.connected&&generation===this.generation)this.onDisconnect('USB 读取中断，请检查数据线和串口占用后重新连接。');}
    finally{reader.releaseLock();}
  }
  async command(op,id){
    if(!this.connected)throw Error('USB 已断开');
    let timer;
    const response=new Promise((resolve,reject)=>{
      this.pending.set(id,{op,resolve,reject});timer=setTimeout(()=>reject(Error('USB 指令超时，请确认已烧录有线固件并关闭串口监视器')),5000);
    });
    // Attach rejection handling while the writer may still be pending.
    response.catch(()=>{});
    try{await this.writer.write(usbCommand(op,id));return await response;}
    finally{clearTimeout(timer);this.pending.delete(id);}
  }
  disconnect(){
    this.generation++;this.connected=false;
    for(const command of this.pending.values())command.reject(Error('USB 已断开'));this.pending.clear();
    const port=this.port,reader=this.reader,writer=this.writer,readTask=this.readTask;
    this.port=this.reader=this.writer=this.readTask=null;
    if(!port)return this.closing;
    this.closing=(async()=>{
      await Promise.allSettled([reader?.cancel(),writer?.abort()]);
      await readTask;writer?.releaseLock();await port.close();
    })().catch(()=>{});
    return this.closing;
  }
}
