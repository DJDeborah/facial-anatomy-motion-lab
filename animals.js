/* Comparative motion controls. Amplitudes and timing are illustrative, not physiological measurements. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 0;
  const icons = {
    fish:'M5 16Q20 0 35 15L46 7V25L35 18Q20 34 5 16Z M26 9Q21 16 26 24 M12 14h1',
    frog:'M7 17Q1 5 11 5Q18 4 19 11H30Q32 2 40 6Q47 10 42 19Q38 30 24 29Q10 29 7 17Z M12 10v3 M37 10v3 M13 21Q24 25 37 21',
    lizard:'M3 22L12 14L25 11L38 15L47 24L24 25Z M17 16h2 M12 23L7 28 M33 25L39 31 M21 26L29 33L32 26',
    cat:'M8 15L6 2L19 9H30L43 2L41 17Q45 32 25 33Q5 31 8 15Z M14 16l5 1 M30 17l5-1 M22 23h5l-2 3Z M2 22l13 2 M0 28l15-1 M35 24l13-2 M35 28h13',
    dog:'M13 9L6 6L1 25L11 23 M35 9L42 6L48 25L37 23 M13 10Q25 2 35 10L39 24Q35 35 25 35Q14 35 10 24Z M16 17h3 M30 17h3 M20 25h10l-5 5Z',
    human:'M16 5Q25-1 33 5L36 18L32 30L25 34L18 30L13 18Z M17 14h4 M29 14h4 M25 15v8h3 M21 28h9'
  };
  const icon = id => `<svg class="species-icon" viewBox="0 0 50 38" aria-hidden="true"><path d="${icons[id]}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  let data, viewer, frameId, playbackStart = 0, playbackOffset = 0, lastUiTime = 0, toastTimer;
  const state = {speciesId:'fish',selectedChannel:'jaw',values:{},presetId:null,intensity:0,playing:false,layers:{skin:true,muscles:true,bones:true}};
  const species = () => data.species.find(s => s.id === state.speciesId);
  const source = id => data.sources.find(s => s.id === id);
  const effective = () => Object.fromEntries(species().channels.map(c => [c.id, clamp(state.values[c.id]) * state.intensity]));
  const sourcesHtml = ids => (ids || []).map(id => {
    const s = source(id); return s ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>` : '';
  }).join('');
  function toast(message) { $('animal-toast').textContent = message; $('animal-toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('animal-toast').classList.remove('visible'),3200); }
  function stop() { state.playing=false; $('play-motion').textContent='▶ 播放组合'; }
  function applyPose() { viewer.setPose(effective()); }
  function updateControls() {
    const pose=effective();
    for(const c of species().channels){
      const input=document.querySelector(`input[data-control="${c.id}"]`);
      if(input) input.value=pose[c.id];
      const output=document.querySelector(`[data-value="${c.id}"]`);
      if(output) output.textContent=`${Math.round(pose[c.id]*100)}%`;
    }
    $('master-intensity').value=state.intensity; $('master-value').textContent=`${Math.round(state.intensity*100)}%`;
    const p=species().presets.find(p=>p.id===state.presetId);
    $('preset-title').textContent=p ? p.name : Object.values(state.values).some(v=>v>0) ? '自由组合' : '中性姿态';
    document.querySelectorAll('[data-preset]').forEach(b=>{b.classList.toggle('active',b.dataset.preset===state.presetId);b.setAttribute('aria-pressed',b.dataset.preset===state.presetId);});
  }
  function selectChannel(id) {
    const c=species().channels.find(c=>c.id===id); if(!c)return;
    state.selectedChannel=id; viewer.selectChannel(id);
    document.querySelectorAll('.channel-row').forEach(row=>{const selected=row.dataset.row===id;row.classList.toggle('selected',selected);row.querySelector('button').setAttribute('aria-pressed',selected);});
    $('channel-title').textContent=c.name; $('channel-en').textContent=c.en;
    $('channel-kind').textContent=({skeletal:'骨骼 / 关节动作',sensory:'感觉器官运动','soft-tissue':'软组织动作',display:'展示机构'})[c.kind] || c.kind; $('channel-structure').textContent=c.structure;
    $('channel-mechanism').textContent=c.mechanism; $('channel-limit').textContent=c.limit;
    $('channel-code').textContent=c.code ? `${c.codeSystem || '动作编码'} · ${c.code}（可见动作参照；本模型未经编码一致性验证）` : '教学动作通道 · 不指定一对一 FACS 编码';
    $('channel-sources').innerHTML=sourcesHtml(c.sources);
  }
  function setChannel(id,value) {
    if(!species().channels.some(c=>c.id===id))return;
    const current=effective();stop();state.values={...current,[id]:clamp(value)};state.intensity=1;state.presetId=null;
    selectChannel(id);applyPose();updateControls();
  }
  function setPreset(id) {
    const preset=species().presets.find(p=>p.id===id);if(!preset)return;
    stop();state.presetId=id;state.intensity=1;
    state.values=Object.fromEntries(species().channels.map(c=>[c.id,clamp(preset.values[c.id])]));
    const leading=species().channels.reduce((best,c)=>!best||state.values[c.id]>state.values[best.id]?c:best,null);
    if(leading&&state.values[leading.id]>0)selectChannel(leading.id);
    applyPose();updateControls();$('preset-note').textContent=`${preset.description} 时间曲线与幅度为教学编排，未拟合真实录像。`;
  }
  function setIntensity(value) {stop();state.intensity=clamp(value);applyPose();updateControls();}
  function reset() {
    stop();state.values=Object.fromEntries(species().channels.map(c=>[c.id,0]));state.intensity=0;state.presetId=null;
    applyPose();updateControls();$('preset-note').textContent='组合和时间曲线为教学编排，未拟合真实运动录像。';
  }
  function setSpecies(id,updateHash=true) {
    const next=data.species.find(s=>s.id===id);if(!next)return;
    stop();state.speciesId=id;state.presetId=null;state.intensity=0;state.values=Object.fromEntries(next.channels.map(c=>[c.id,0]));
    viewer.setSpecies(id);viewer.setLayers(state.layers);viewer.setView('threequarter');
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='threequarter'));
    document.querySelectorAll('.species-card[data-species]').forEach(b=>{b.classList.toggle('active',b.dataset.species===id);b.setAttribute('aria-pressed',b.dataset.species===id);});
    $('species-title').textContent=`${next.name} · ${next.en}`; $('species-latin').textContent=next.latin;
    $('animal-viewer').setAttribute('aria-label',`${next.name}头部三维机制示意，可拖动旋转`);
    $('channel-count').textContent=`${next.channels.length} 个示意通道`;
    $('channel-list').innerHTML=next.channels.map(c=>`<div class="channel-row" data-row="${esc(c.id)}"><button class="channel-select" data-channel="${esc(c.id)}" aria-pressed="false"><span><strong>${esc(c.name)}</strong><small>${esc(c.en)}</small></span><span aria-hidden="true">↗</span></button><div class="channel-range"><input type="range" data-control="${esc(c.id)}" aria-label="${esc(c.name)}动画幅度" min="0" max="1" step="0.01" value="0"><output data-value="${esc(c.id)}">0%</output></div></div>`).join('');
    $('preset-list').innerHTML=next.presets.map((p,i)=>`<button class="preset-card" data-preset="${esc(p.id)}" aria-pressed="false"><span class="preset-number">0${i+1}</span><span><strong>${esc(p.name)}</strong><p>${esc(p.description)}</p><span class="preset-tags">${next.channels.filter(c=>p.values[c.id]>0).map(c=>esc(c.name)).join(' + ')}</span></span></button>`).join('');
    $('about-title').textContent=`${next.name}：${next.tag}`; $('species-summary').textContent=next.summary;
    $('species-mechanism').textContent=next.mechanism; $('species-limit').textContent=next.limit;
    $('preset-note').textContent='组合和时间曲线为教学编排，未拟合真实运动录像。';
    selectChannel(next.channels[0].id);applyPose();updateControls();
    if(updateHash&&location.hash!==`#${id}`)history.replaceState(null,'',`#${id}`);
  }
  function getExport() {
    return {schemaVersion:1,type:'animal-facial-motion-demo',exportedAt:new Date().toISOString(),species:state.speciesId,scientificName:species().latin,presetId:state.presetId,channels:{...state.values},intensity:state.intensity,effectivePose:effective(),selectedChannel:state.selectedChannel,layers:{...state.layers},animation:{playing:state.playing,loop:$('loop-motion').checked,speed:Number($('motion-speed').value)},model:{geometry:'procedural-mechanism-schematic',bilateral:true,units:'normalized illustration amplitude; not muscle activation or force',validation:'No specimen-specific anatomical, physiological or AnimalFACS validation'},sources:species().referenceIds.map(id=>source(id)).filter(Boolean)};
  }
  function play() {
    if(state.playing){stop();return;}
    if(!Object.values(state.values).some(v=>v>0)){
      const moving=species().presets.find(p=>Object.values(p.values).some(v=>v>0));
      if(!moving)return;
      setPreset(moving.id);state.intensity=0;
    }
    playbackOffset=Math.acos(1-2*state.intensity);playbackStart=performance.now();state.playing=true;$('play-motion').textContent='Ⅱ 暂停';
  }
  function tick(now) {
    frameId=requestAnimationFrame(tick);
    if(!state.playing)return;
    const phase=playbackOffset+(now-playbackStart)*Number($('motion-speed').value)*Math.PI/2000;
    if(phase>=Math.PI*2&&!$('loop-motion').checked){state.intensity=0;stop();}else state.intensity=(1-Math.cos(phase))/2;
    applyPose();if(now-lastUiTime>45||!state.playing){updateControls();lastUiTime=now;}
  }
  function renderResearch() {
    $('framing').textContent=data.framing;
    $('species-path').innerHTML=data.species.map((s,i)=>`<button class="species-card" data-species="${esc(s.id)}" aria-pressed="false"><span class="species-topline"><span>0${i+1}</span><span>${s.channels.length} 通道</span></span>${icon(s.id)}<strong>${esc(s.name)}</strong><small>${esc(s.tag)}</small></button>`).join('')+`<a class="species-card" href="./"><span class="species-topline"><span>06</span><span>已有实验室 ↗</span></span>${icon('human')}<strong>人类</strong><small>逐肌群与皮肤协同</small></a>`;
    $('comparison-body').innerHTML=data.species.map(s=>`<tr><td>${esc(s.name)}<small>${esc(s.latin)}</small></td><td>${s.channels.length}：${s.channels.map(c=>esc(c.name)).join(' / ')}</td><td>${esc(s.tag)}</td><td><button data-jump="${esc(s.id)}">进入观察 ↗</button></td></tr>`).join('')+'<tr><td>人类<small>Homo sapiens</small></td><td>已有 29 个肌群控件 + 下颌</td><td>分部动作、多肌协同与表面传递</td><td><a href="./">打开原实验室 ↗</a></td></tr>';
    $('correction-list').innerHTML=data.corrections.map(c=>`<article class="correction"><h3>${esc(c.claim)}</h3><p>${esc(c.correction)}</p><div class="correction-links">${(c.sources||[]).map((id,i)=>{const s=source(id);return s?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">依据 ${i+1} ↗</a>`:'';}).join('')}</div></article>`).join('');
    $('source-count').textContent=`${data.sources.length} 项`;
    $('source-list').innerHTML=data.sources.map((s,i)=>`<article id="ref-${esc(s.id)}"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${String(i+1).padStart(2,'0')} · ${esc(s.title)} ↗</a><p>${esc(s.note)}</p></article>`).join('');
  }
  async function init() {
    try {
      const response=await fetch('data/animal-anatomy.json');if(!response.ok)throw new Error(`资料载入失败 (${response.status})`);data=await response.json();
      viewer=new AnimalViewer($('animal-viewer'),{onSelect:selectChannel});
      renderResearch();
      document.addEventListener('click',event=>{
        const b=event.target.closest('button');if(!b)return;
        if(b.dataset.species)setSpecies(b.dataset.species);
        if(b.dataset.channel)selectChannel(b.dataset.channel);
        if(b.dataset.preset)setPreset(b.dataset.preset);
        if(b.dataset.jump){setSpecies(b.dataset.jump);document.querySelector('.lab').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
        if(b.dataset.view){viewer.setView(b.dataset.view);document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));}
      });
      $('channel-list').addEventListener('input',event=>{if(event.target.dataset.control)setChannel(event.target.dataset.control,event.target.value);});
      $('master-intensity').addEventListener('input',event=>setIntensity(event.target.value));
      $('play-motion').addEventListener('click',play);$('reset-motion').addEventListener('click',reset);
      $('motion-speed').addEventListener('change',()=>{if(state.playing){stop();play();}});
      for(const layer of ['skin','muscles','bones'])$('layer-'+layer).addEventListener('change',event=>{state.layers[layer]=event.target.checked;viewer.setLayers(state.layers);});
      $('export-animal').addEventListener('click',()=>{
        const payload=getExport(),url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download=`animal-motion-${state.speciesId}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前姿态、组合参数与文献来源。');
      });
      window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if(data.species.some(s=>s.id===id)&&id!==state.speciesId)setSpecies(id,false);});
      window.addEventListener('pagehide',()=>{stop();cancelAnimationFrame(frameId);viewer.dispose();});
      window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
      const initial=location.hash.slice(1);setSpecies(data.species.some(s=>s.id===initial)?initial:'fish',false);
      window.animalApp={state,viewer,data,setSpecies,selectChannel,setChannel,setPreset,setIntensity,reset,stop,getExport};
      frameId=requestAnimationFrame(tick);
    } catch(error) {
      console.error(error);$('canvas-status').textContent=`无法启动：${error.message}`;
      $('species-path').innerHTML='<p class="load-error">动物实验室未能载入。请检查网络连接后刷新页面；若仍失败，请使用支持 WebGL 的新版浏览器并开启图形加速。</p>';
    }
  }
  init();
})();
