import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

async function port(){
  const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
  const value=socket.address().port;socket.close();await once(socket,'close');return value;
}
test('operator submits a note through Node and reads the committed timeline',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'relaydesk-e2e-'));
  const apiPort=await port(), gatewayPort=await port();
  const env={...process.env,PGHOST:'',LEDGER_PATH:join(folder,'db.sqlite3'),RELAY_TOKEN:'integration-only',
    API_URL:'http://127.0.0.1:'+apiPort,PORT:String(gatewayPort)};
  const python=process.env.PYTHON||'python', children=[];
  try{
    assert.equal(spawnSync(python,['ledger.py'],{env}).status,0);
    children.push(spawn(python,['-m','uvicorn','api:app','--port',String(apiPort)],{env,stdio:'inherit'}));
    children.push(spawn(process.execPath,['gateway.mjs'],{env,stdio:'inherit'}));
    const url='http://127.0.0.1:'+gatewayPort;
    for(let i=0;i<80;i++){
      try{if((await fetch(env.API_URL+'/ready')).ok&&(await fetch(url+'/healthz')).ok)break;}catch{}
      await delay(150);
    }
    const headers={Authorization:'Basic '+Buffer.from('operator:integration-only').toString('base64'),'Content-Type':'application/json'};
    assert.equal((await fetch(url+'/api/incidents')).status,401);
    const call=()=>fetch(url+'/api/incidents/INC-1042',{method:'POST',headers,body:JSON.stringify({version:1,note:'Canary traffic restored'})});
    assert.equal((await call()).status,200);
    assert.equal((await call()).status,409);
    const payload=await (await fetch(url+'/api/incidents',{headers})).json();
    assert.equal(payload.incidents[0].events.at(-1).detail,'Canary traffic restored');
  }finally{
    await Promise.all(children.map(async child=>{if(child.exitCode===null&&child.signalCode===null){const closed=once(child,'exit');child.kill();await closed;}}));
    await rm(folder,{recursive:true,force:true});
  }
});

