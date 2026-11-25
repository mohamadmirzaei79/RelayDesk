const byId = id => document.getElementById(id);
const states = ['Investigating','Mitigating','Monitoring','Resolved'];
const storageKey = 'relaydesk-demo-v1';
const live = new URLSearchParams(location.search).get('mode') === 'live';
let data = [], selected, screen = 'Queue';
const esc = v => String(v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const badge = r => '<span class="chip sev'+Number(r.severity.slice(-1))+'">'+esc(r.severity)+'</span>';
const when = v => new Date(v).toLocaleString('en-GB',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})+' UTC';
async function fetchJson(url,options){
  const res = await fetch(url, options);
  if(!res.ok) throw Error(res.status===409?'Another operator updated this incident. The queue has been refreshed.':'Request failed ('+res.status+').');
  return res.json();
}
async function load(){
  const payload = await fetchJson(live?'./api/incidents':'./fixtures.json');
  data = payload.incidents;
  if(!live){
    try{const saved=JSON.parse(localStorage.getItem(storageKey)); if(Array.isArray(saved)&&saved.length===data.length&&saved.every((r,i)=>r.id===data[i].id&&states.includes(r.state)&&Array.isArray(r.events))) data=saved;}catch{}
  }
  selected ||= data[0]?.id;
  render();
}
function render(){
  const opened=data.filter(r=>r.state!=='Resolved');
  const cards=[['Open incidents',opened.length,'◴'],['Critical open',opened.filter(r=>r.severity==='SEV-1').length,'!'],['Monitoring',data.filter(r=>r.state==='Monitoring').length,'∿'],['Resolved',data.length-opened.length,'✓']];
  byId('metrics').innerHTML=cards.map(([label,value,icon])=>'<div class="metric"><small>'+label+'</small><b>'+value+'</b><i aria-hidden="true">'+icon+'</i></div>').join('');
  const query=byId('search').value.toLowerCase(), filter=byId('filter').value;
  const visible=data.filter(r=>[r.title,r.service,r.owner,r.id].some(v=>v.toLowerCase().includes(query))&&(filter==='All incidents'||filter==='Open only'&&r.state!=='Resolved'||r.severity===filter||r.state===filter));
  if(!visible.some(r=>r.id===selected))selected=visible[0]?.id;
  const card=r=>'<button class="item" data-id="'+esc(r.id)+'" aria-pressed="'+(r.id===selected)+'"><div class="line between"><span class="id">'+esc(r.id)+'</span>'+badge(r)+'</div><h3>'+esc(r.title)+'</h3><div class="sub">'+esc(r.service)+' · '+esc(r.state)+'</div><div class="laneowner">'+esc(r.owner)+'</div></button>';
  byId('list').innerHTML=states.map(state=>{
    const records=visible.filter(r=>r.state===state);
    return '<section class="lane"><div class="lanehead">'+state+'<span>'+records.length+'</span></div>'+ (records.map(card).join('')||'<p class="empty">No matching incidents</p>')+'</section>';
  }).join('');
  const record=visible.find(r=>r.id===selected);
  byId('detail').innerHTML=record?detail(record):'<p>Select a matching incident to view its timeline.</p>';
  byId('report').innerHTML=[...opened].sort((a,b)=>a.owner.localeCompare(b.owner)).map(r=>'<div class="report"><div class="line">'+badge(r)+'<span class="id">'+esc(r.id)+' · '+esc(r.owner)+'</span></div><h3>'+esc(r.title)+'</h3><p>'+esc(r.state)+' · '+esc(r.events.at(-1).detail||r.events.at(-1).kind)+'</p></div>').join('')||'<p class="empty">No open incidents.</p>';
}
function detail(r){
  const next=states[states.indexOf(r.state)+1];
  const facts=[['Owner',r.owner],['Service',r.service],['Issue reference',r.ticket]];
  return '<div class="line between"><span class="id">'+esc(r.id)+'</span><div class="line">'+badge(r)+'<span class="chip">'+esc(r.state)+'</span></div></div><h2>'+esc(r.title)+'</h2><p>'+esc(r.summary)+'</p><div class="facts">'+facts.map(([k,v])=>'<div><small>'+k+'</small><b>'+esc(v)+'</b></div>').join('')+'</div><div class="over">INCIDENT TIMELINE</div><ol class="timeline">'+r.events.map(e=>'<li><time>'+esc(when(e.time))+'</time><b>'+esc(e.kind)+'</b><p>'+esc(e.detail)+'</p></li>').join('')+'</ol><form id="change"><label for="note">Operator note</label><textarea maxlength="600" id="note" rows="2" placeholder="What should the next operator know?"></textarea><div class="line between"><select id="stage" aria-label="Update type"><option value="">Add note only</option>'+(next?'<option>'+next+'</option>':'')+'</select><button class="action">Save update</button></div></form>';
}
document.addEventListener('submit',async e=>{
  if(e.target.id!=='change')return;
  e.preventDefault();
  const record=data.find(r=>r.id===selected), note=byId('note').value.trim(), state=byId('stage').value;
  if(!note&&!state){byId('message').textContent='Write a note or select the next stage.';return;}
  e.target.querySelector('button').disabled=true;
  try{
    if(live){
      const updated=await fetchJson('./api/incidents/'+record.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note,state:state||null,version:record.version})});
      data[data.indexOf(record)]=updated;
    }else{
      const updated={...record,state:state||record.state,version:record.version+1,events:[...record.events,{kind:state?'Moved to '+state:'Operator note',detail:note,time:new Date().toISOString()}]};
      const result=data.map(r=>r.id===record.id?updated:r);
      localStorage.setItem(storageKey,JSON.stringify(result));data=result;
    }
    byId('message').textContent=live?'Update committed.':'Update saved in this browser.';
  }catch(error){byId('message').textContent=error.message;if(live)await load().catch(()=>{});}
  render();
});
byId('list').onclick=e=>{const item=e.target.closest('[data-id]');if(item){selected=item.dataset.id;render();byId('casefile').showModal();}};
for(const tab of ['Queue','Handoff'])byId('nav'+tab).onclick=()=>{
  screen=tab;const queue=tab==='Queue';byId('queue').hidden=!queue;byId('handoff').hidden=queue;
  byId('title').textContent=byId('crumb').textContent=queue?'Incident desk':'Shift handoff';
  byId('subtitle').textContent=queue?'Triage service disruptions and keep the next shift informed.':'A briefing of open incidents, current owners and recent decisions.';
  for(const t of ['Queue','Handoff'])byId('nav'+t).setAttribute('aria-pressed',String(t===tab));
};
byId('search').oninput=render;byId('filter').onchange=render;
byId('mode').textContent=live?'Connected API':'Browser-local demo';
load().catch(e=>{byId('message').textContent=e.message;});
