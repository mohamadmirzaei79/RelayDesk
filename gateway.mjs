import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';

const assets = new Map([['/', ['index.html','text/html']],['/desk.css',['desk.css','text/css']],['/desk.js',['desk.js','text/javascript']],['/fixtures.json',['fixtures.json','application/json']]]);
const token=process.env.RELAY_TOKEN;
if(!token) throw Error('RELAY_TOKEN must be configured');
const expected=Buffer.from('Basic '+Buffer.from('operator:'+token).toString('base64'));
const server=http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/healthz'){res.writeHead(200).end('ok');return;}
  const supplied=Buffer.from(req.headers.authorization||'');
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){
    res.writeHead(401,{'WWW-Authenticate':'Basic realm="RelayDesk operators"'}).end();return;
  }
  try{
    if(path==='/' && !req.url.includes('?mode=live')){res.writeHead(302,{Location:'/?mode=live'}).end();return;}
    if(req.method==='GET'&&assets.has(path)){
      const [file,type]=assets.get(path); const body=await readFile(new URL(file,import.meta.url));
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8'}).end(body);return;
    }
    const list=req.method==='GET'&&path==='/api/incidents';
    const update=req.method==='POST'&&/^\/api\/incidents\/INC-[0-9]+$/.test(path);
    if(!list&&!update){res.writeHead(404).end();return;}
    if(update&&req.headers['content-type']!=='application/json'){res.writeHead(415).end();return;}
    if(update&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){res.writeHead(403).end();return;}
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>8192){res.writeHead(413).end();return;}chunks.push(chunk);}
    const upstream=await fetch(process.env.API_URL+path,{method:req.method,signal:AbortSignal.timeout(6000),
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:update?Buffer.concat(chunks):undefined});
    res.writeHead(upstream.status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(await upstream.text());
  }catch{res.writeHead(502).end('Service unavailable');}
});
server.listen(Number(process.env.PORT||8080),'0.0.0.0');
