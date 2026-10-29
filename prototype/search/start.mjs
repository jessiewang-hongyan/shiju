/** Start the local prototype independently of the interactive terminal. */
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const port=process.env.PORT||'4180';
const url=`http://127.0.0.1:${port}`;
try { const r=await fetch(url+'/api/catalog',{signal:AbortSignal.timeout(1000)}); const data=await r.json();if(r.ok&&data.version&&Array.isArray(data.collections)){console.log('服务已运行：'+url);process.exit(0);}throw Error('端口已有其他服务'); }
catch(e){if(e.message==='端口已有其他服务')throw e;}
const log=join(tmpdir(),'shiju-search-service.log');const fd=openSync(log,'a');
const child=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs',import.meta.url))],{cwd:fileURLToPath(new URL('../../',import.meta.url)),env:{...process.env,SONG_DATA:process.env.SONG_DATA||'/tmp/shiju-song-eval'},detached:true,stdio:['ignore',fd,fd]});
child.unref();closeSync(fd);
for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,200));try{const r=await fetch(url+'/api/catalog',{signal:AbortSignal.timeout(1000)});const data=await r.json();if(r.ok&&data.version){console.log(JSON.stringify({url,pid:child.pid,records:data.total,log}));process.exit(0);}}catch{}}
throw Error('启动失败，请查看 '+log);
