// 生产渲染工具：把同一个本地动画时间轴导出为分镜图或无声 MP4。
// 依赖 Playwright（可用 PLAYWRIGHT_MODULE 指定路径）与 ffmpeg；不访问外部站点。
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const bundle=path.join(process.env.USERPROFILE||'','/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(bundle,'playwright'));
const root=path.resolve(__dirname,'../game/dist'),runtime=path.resolve(__dirname,'../game/.runtime'),output=path.resolve(__dirname,'../assets/animations');
const video=process.argv.includes('--video'),width=1280,height=720,fps=24;
fs.mkdirSync(runtime,{recursive:true});fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{let file;try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/__game_lifecycle'){res.setHeader('Content-Type','application/json');return res.end('{"enabled":false}');}file=path.resolve(root,'.'+decodeURIComponent(url.pathname));}catch{res.writeHead(400);return res.end();}if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.glb':'model/gltf-binary'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{let browser,encoder,encoded=false;const errors=[];try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:process.env.FILM_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--hide-scrollbars']});
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/concept-film.html?render=1`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.conceptFilm,{timeout:60000});
  const seconds=[4,13.5,26.35,35.5,46.5,55.5],stills=[];
  for(let i=0;i<seconds.length;i++){const state=await page.evaluate(t=>window.conceptFilm.renderAt(t),seconds[i]);const name=`concept-film-${i+1}.jpg`,file=path.join(runtime,name);await page.screenshot({path:file,type:'jpeg',quality:90});stills.push(file);console.log(JSON.stringify({shot:i+1,at:seconds[i],...state}));}
  const sharp=require(process.env.FILM_SHARP_MODULE||path.join(bundle,'sharp'));
  const tiles=await Promise.all(stills.map(file=>sharp(file).resize(640,360).toBuffer()));
  const contact=path.join(output,'skystrike-storyboard.jpg');
  await sharp({create:{width:1920,height:720,channels:3,background:'#10232d'}}).composite(tiles.map((input,i)=>({input,left:(i%3)*640,top:Math.floor(i/3)*360}))).jpeg({quality:90}).toFile(contact);
  if(video){
    const file=path.join(output,'skystrike-first-light.mp4');
    encoder=spawn(process.env.FILM_FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','mjpeg','-framerate',String(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',file],{stdio:['pipe','ignore','pipe'],windowsHide:true});
    let encoderError='';encoder.stderr.on('data',chunk=>encoderError+=chunk);encoder.stdin.on('error',()=>{});
    const complete=new Promise((resolve,reject)=>{encoder.on('error',reject);encoder.on('close',code=>code===0?resolve():reject(Error(encoderError||`ffmpeg exited ${code}`)));});
    // 防止后台编码错误成为未处理 rejection，主流程结束时仍会报告。
    complete.catch(()=>{});
    for(let i=0;i<60*fps;i++){
      await page.evaluate(t=>window.conceptFilm.renderAt(t),i/fps);
      const png=await page.screenshot({type:'jpeg',quality:92,animations:'disabled'});
      if(!encoder.stdin.write(png))await new Promise((resolve,reject)=>{const fail=e=>{encoder.stdin.off('drain',done);reject(e);},done=()=>{encoder.stdin.off('error',fail);resolve();};encoder.stdin.once('drain',done);encoder.stdin.once('error',fail);});
      if(i%(fps*5)===0)console.log(`Export ${Math.round(i/(60*fps)*100)}% (${(i/fps).toFixed(0)} / 60s)`);
    }
    encoder.stdin.end();await complete;encoded=true;console.log(`Video: ${file}`);
  }
  console.log(JSON.stringify({storyboard:contact,video:encoded,errors},null,2));if(errors.length)process.exitCode=1;
}finally{if(encoder&&!encoded)encoder.kill();await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
