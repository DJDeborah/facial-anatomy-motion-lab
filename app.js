/* Web anatomy lab. Rendering: viewer.js. Evidence: data/book-anatomy.json. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {data:null, viewer:null, selected:null, side:'both', region:'all', query:'', expression:null, manual:false, intensity:0, playing:false, pulse:false, start:0, isolate:false, hidden:new Set(), left:{}, right:{}, jaw:0,studyMode:'ensemble',heldIntensity:.85,overrides:{},explorer:null,actionPreview:null,combination:null,combinationJaw:0,multiselect:false,workbench:null,displayMode:'context'};
  const regions = {upper:'额部与眼周',mid:'鼻部与面颊',lower:'口部与下颏',neck:'颈部与下颌'};
  const upper = /frontalis|occipitalis|oculi|supercilii|procerus|palpebrae|tarsal/;
  const mid = /nasi|naris|nasalis|zygomaticus|labii_superioris/;
  const neck = /platysma|sternocleidomastoid|masseter|temporalis|pterygoid/;
  const getRegion = m => upper.test(m.id)?'upper':neck.test(m.id)?'neck':mid.test(m.id)?'mid':'lower';
  const pct = n => Math.round((Number(n)||0)*100)+'%';
  const text = v => Array.isArray(v)?v.join('；'):typeof v==='object'&&v!==null?Object.values(v).join('；'):v??'—';
  const pages = item => {
    const p=item?.bookPages || item?.pages || [];
    return (Array.isArray(p)?p:[p]).map(x=>typeof x==='object'?(x.pdfPage??x.pdf??x.page):x).filter(x=>Number.isFinite(Number(x))).map(Number);
  };
  function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),2600);}
  function average(id){const side=state.combination?.[id]?.side||state.actionPreview?.side||state.side;return side==='left'?(state.left[id]||0):side==='right'?(state.right[id]||0):((state.left[id]||0)+(state.right[id]||0))/2;}
  function applyPose(){state.viewer.setActivations(state.left,'left');state.viewer.setActivations(state.right,'right');state.viewer.setJawOpen?.(state.jaw);}
  function zeroPose(){for(const m of state.data.muscles){state.left[m.id]=0;state.right[m.id]=0;}state.jaw=0;}
  function stop(){state.playing=false;state.pulse=false;state.phase='定格';$('play-expression').textContent='▶ 播放动作';$('stage-play').textContent='▶ 播放';$('pulse-muscle').textContent='▶ 本表情收缩';}
  function updateControls(){
    if(state.selected){$('activation').value=average(state.selected);$('activation-value').textContent=pct(average(state.selected));}
    $('expression-intensity').value=state.intensity;$('intensity-value').textContent=pct(state.intensity);
    for(const el of document.querySelectorAll('.activation-mini')){const id=el.dataset.muscle;const v=Math.max(state.left[id]||0,state.right[id]||0);el.textContent=v>.005?pct(v):'';}
    if(state.manual)renderCustomTags();
    $('stage-progress').textContent=pct(state.intensity);$('stage-progress-fill').style.width=pct(state.intensity);
    $('stage-phase').textContent=state.intensity<.03?'静息':state.intensity>.96?'峰值':state.phase||'定格';
    state.explorer?.frame();
    state.workbench?.frame();
  }
  function renderMuscles(){
    const list=state.data.muscles.filter(m=>(state.region==='all'||getRegion(m)===state.region)&&(!state.query||[m.nameZh,m.nameEn,m.id].join(' ').toLowerCase().includes(state.query)));
    $('visible-count').textContent=list.length;
    $('muscle-list').innerHTML=list.map(m=>`<div class="muscle-row"><input type="checkbox" data-pick="${escape(m.id)}" aria-label="加入组合：${escape(m.nameZh)}" ${state.combination?.[m.id]?'checked':''}><button class="muscle-item ${m.id===state.selected?'selected':''} ${state.hidden.has(m.id)?'is-hidden':''}" data-muscle="${escape(m.id)}" aria-pressed="${m.id===state.selected}"><i class="muscle-mark"></i><span><strong>${escape(m.nameZh)}</strong><small>${escape(m.nameEn)}</small></span><span class="activation-mini" data-muscle="${escape(m.id)}"></span></button></div>`).join('') || '<p class="empty-note" style="padding:15px">未找到匹配的肌肉</p>';
    updateControls();
  }
  function selectMuscle(id){
    const m=state.data.muscles.find(m=>m.id===id);if(!m)return;
    if(state.pulse)stop();
    if(state.actionPreview&&!(id in state.actionPreview.activations)){stop();state.actionPreview=null;state.studyMode='ensemble';configureContext();setExpressionIntensity(state.intensity);}
    state.referenceSelection=null;state.selected=id;state.viewer.setSelected(id);
    for(const key of ['activation','pulse-muscle','relax-muscle','combine-focused'])$(key).disabled=false;
    if(state.isolate)state.viewer.setIsolation(id);
    $('selected-name').textContent=m.nameZh;$('selected-en').textContent=m.nameEn;
    $('selected-region').textContent=regions[getRegion(m)];
    $('selected-distribution').textContent=text(m.distribution);$('selected-origin').textContent=text(m.origin);$('selected-insertion').textContent=text(m.insertion);$('selected-action').textContent=text(m.action)+(m.caution?' '+text(m.caution):'');
    const p=pages(m);$('selected-pages').textContent=p.length?'PDF 第 '+p.join('、')+' 页 · 印刷页码 '+p.map(n=>n-2).join('、'):'原书未单独详述；见方法说明';
    $('book-link').style.display=p.length?'':'none';
    const geometry=state.viewer.getAvailableMuscles?.().find(x=>x.id===id);
    $('geometry-badge').textContent=geometry?.source==='open'?'● 开放解剖网格 · '+(geometry.meshes||'')+' 个结构':'◇ 自建示意肌束 · 原数据缺失或需细分';
    $('hide-muscle').textContent=state.hidden.has(id)?'显示':'隐藏';
    if(state.studyMode!=='ensemble'&&!state.manual)setExpressionIntensity(state.intensity);
    renderMuscles();
    state.explorer?.contextChanged();
  }
  function selectReference(record){
    if(!record?.name)return;
    state.referenceSelection=record;state.selected=null;state.viewer.setSelectedReference?.(record.name);
    const entry=state.workbench?.neck?.muscles?.find(m=>m.sourceMeshNames?.includes(record.name));
    renderMuscles();state.explorer?.contextChanged();
    $('selected-name').textContent=entry?.nameZh||'解剖参考结构';$('selected-en').textContent=record.name;
    $('selected-region').textContent=entry?.category||'独立来源网格';
    $('selected-distribution').textContent=entry?.noteZh||'此结构可选择、分层、隐藏和单独观察；当前没有独立运动绑定。';
    $('selected-origin').textContent='未建立该结构的数值附着约束';$('selected-insertion').textContent='未建立该结构的数值附着约束';
    $('selected-action').textContent=entry?.requiredCoupling||'未绑定主动形变；保留参考位置。';
    $('selected-pages').textContent='解剖模型参考结构 · 不计入 29 组可动控制';$('book-link').style.display='none';
    $('geometry-badge').textContent='● 开放解剖网格 · 参考结构';
    $('hide-muscle').textContent=state.hidden.has(record.name)?'显示':'隐藏';
    $('member-action').textContent='仅用于位置与分层参照，尚无独立可播放的动作模式。';$('member-part').textContent='';$('member-motion').textContent='';$('member-regions').innerHTML='';
    for(const key of ['activation','pulse-muscle','relax-muscle','combine-focused'])$(key).disabled=true;
    $('activation').value=0;$('activation-value').textContent='未绑定';state.workbench?.render();
  }
  function faceIcon(id){
    const k=id.toLowerCase();let eyes='<path d="M12 17h3m10 0h3"/>',brows='',mouth='<path d="M15 27h10"/>';
    if(/smile|happy|joy|laugh/.test(k)){mouth='<path d="M13 25q7 9 14 0"/>';eyes='<path d="M11 18q3-3 6 0m6 0q3-3 6 0"/>';}
    if(/sad|grief|cry/.test(k)){mouth='<path d="M14 29q6-6 12 0"/>';brows='<path d="M11 14l6-3m6 0l6 3"/>';}
    if(/anger|angry|furious|rage/.test(k)){brows='<path d="M10 12l7 3m6 0l7-3"/>';mouth=/furious|rage/.test(k)?'<rect x="14" y="24" width="12" height="7" rx="2"/>':'<path d="M14 28q6-3 12 0"/>';}
    if(/fear|shock|surprise/.test(k)){brows='<path d="M10 10q4-3 7 0m6 0q4-3 7 0"/>';mouth='<ellipse cx="20" cy="28" rx="4" ry="5"/>';eyes='<circle cx="14" cy="17" r="1.5"/><circle cx="26" cy="17" r="1.5"/>';}
    if(/contempt/.test(k))mouth='<path d="M14 27q8 2 13-4"/>';
    if(/disgust/.test(k)){brows='<path d="M11 14l6 1m6 0l6-3"/>';mouth='<path d="M14 27q3-6 7-2l5 2"/>';}
    if(/pout|kiss/.test(k))mouth='<path d="M18 25q6-3 5 2q1 4-5 2"/>';
    return `<svg viewBox="0 0 40 44" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 18C5 6 11 2 20 2s15 4 15 16c0 14-7 22-15 22S5 32 5 18Z"/>${brows}${eyes}<path d="M20 19l-1 4h2"/>${mouth}</svg>`;
  }
  function renderExpressions(){
    $('expression-list').innerHTML=state.data.expressions.map(e=>`<button class="expression-card ${!state.manual&&state.combination===null&&state.expression?.id===e.id?'active':''}" data-expression="${escape(e.id)}" aria-pressed="${!state.manual&&state.combination===null&&state.expression?.id===e.id}">${faceIcon(e.id)}<strong>${escape(e.nameZh)}</strong><small>${escape(e.nameEn)}</small></button>`).join('');
  }
  function renderCustomTags(){const active=state.data.muscles.filter(m=>Math.max(state.left[m.id]||0,state.right[m.id]||0)>.005);$('active-count').textContent=active.length;$('active-muscle-tags').innerHTML=active.map(m=>`<button class="muscle-tag" data-muscle="${escape(m.id)}">${escape(m.nameZh)}<small>L ${pct(state.left[m.id])} · R ${pct(state.right[m.id])}</small></button>`).join('')||'<span class="empty-note">全部肌肉静息</span>';}
  function markCustom(){state.manual=true;$('expression-name').textContent='自定义肌肉组合';$('expression-description').textContent='保留当前表情的局部动作方式，独立编辑激活参数。';$('expression-evidence').textContent='手动组合 · 左右激活值独立保存；使用表情强度滑块会恢复所选表情配方。';renderExpressions();renderCustomTags();}
  function expressionMap(e){
    const raw=e.activations||e.muscles||{};
    if(Array.isArray(raw))return Object.fromEntries(raw.map(m=>[m.id||m.muscleId,m.strength??m.weight??m.activation??.6]));
    return raw;
  }
  function getContext(){if(state.actionPreview)return state.actionPreview;if(state.combination!==null){const activations={},actions=[];for(const [id,row] of Object.entries(state.combination)){const muscle=state.data.muscles.find(m=>m.id===id);activations[id]={weight:row.weight,side:row.side};actions.push({muscleId:id,kind:'contract',mode:row.mode,part:row.part||'whole',side:row.side,directionZh:row.directionZh||muscle?.action||'',bookPages:[],evidence:'custom-combination'});}return{id:'combination',nameZh:'自定义组合',nameEn:'Free composition',activations,actions,jawOpen:state.combinationJaw,bookPages:[]};}return state.expression;}
  function currentWeight(id){if(state.actionPreview)return Number(state.actionPreview.activations[id]||0);return state.combination!==null?state.combination[id]?.weight||0:state.overrides[state.expression?.id]?.[id]??Number(expressionMap(state.expression||{})[id]||0);}
  function restoreVisibility(){for(const id of state.hidden)state.viewer.setHidden(id,false);state.hidden.clear();state.isolate=false;state.viewer.setIsolation(null);state.viewer.setIsolationGroup?.(null);if(state.displayMode==='single')state.displayMode='context';$('isolate').classList.remove('active');$('isolate').textContent='单独显示';}
  function configureContext(){const e=getContext();state.viewer.setActionContext?.(e);const followers=[...new Set([...(e?.relaxed||[]),...(e?.actions||[]).filter(a=>a.kind==='passive').map(a=>a.muscleId)])];const ids=Object.keys(expressionMap(e||{}));state.viewer.setHighlightGroup?.(ids,{relaxed:followers,side:e?.side||'both'});state.viewer.displayPlugin?.setSelection?.(state.combination!==null?ids:[]);state.workbench?.applyDisplay();}
  function setCombination(members,{jaw=state.combinationJaw,intensity=state.intensity||.8}={}){stop();state.actionPreview=null;state.combination={};state.combinationJaw=Math.max(0,Math.min(1,Number(jaw)||0));for(const raw of members){const id=raw.id||raw.muscleId;if(!state.data.muscles.some(m=>m.id===id))continue;state.combination[id]={mode:raw.mode||'fiber-shortening',part:raw.part||'whole',directionZh:raw.directionZh||'',weight:Math.max(0,Math.min(1,Number(raw.weight??.7))),side:['left','right'].includes(raw.side)?raw.side:'both'};}state.studyMode='ensemble';state.manual=false;state.viewer.setExpressionMode(null);configureContext();$('expression-name').textContent='自定义组合 · Free composition';$('expression-description').textContent='任意肌群共激活；每行独立设置模式、侧别与幅值。';$('expression-evidence').textContent='组合是探索性运动学设定，未施加生理互斥或接触约束。';renderExpressions();setExpressionIntensity(Object.keys(state.combination).length?intensity:0);renderCustomTags();renderMuscles();state.explorer?.contextChanged();}
  function updateCombination(id,patch){const members=Object.entries(state.combination||{}).map(([id,row])=>({id,...row}));const row=members.find(x=>x.id===id);if(row)Object.assign(row,patch);setCombination(members,{intensity:state.intensity});}
  function toggleCombination(id){const existing=state.combination!==null,members=Object.entries(state.combination||{}).map(([id,row])=>({id,...row}));const index=members.findIndex(x=>x.id===id);if(index>=0)members.splice(index,1);else{const a=(getContext()?.actions||[]).find(a=>a.muscleId===id&&a.kind==='contract');members.push({id,weight:state.combination?.[id]?.weight||.7,side:state.side,mode:a?.mode||'fiber-shortening',part:a?.part||'whole',directionZh:a?.directionZh||''});}setCombination(members,{intensity:existing?state.intensity:state.intensity||.8});selectMuscle(id);}
  function pickMuscle(id){if(state.multiselect)toggleCombination(id);else selectMuscle(id);}
  function setStudyMode(mode){stop();state.manual=false;if(mode==='context')state.heldIntensity=state.intensity;state.studyMode=mode;configureContext();setExpressionIntensity(state.intensity);state.explorer?.contextChanged();}
  function playStudy(){if(state.playing||state.pulse){stop();return;}if(state.combination!==null&&!Object.keys(state.combination).length){toast('先勾选要一起运动的肌肉');return;}if(state.combination===null&&!state.actionPreview&&(!state.expression||state.expression.id==='neutral'))setExpression('smile');state.manual=false;state.playing=true;state.start=performance.now();$('play-expression').textContent='Ⅱ 暂停';$('stage-play').textContent='Ⅱ 暂停';}
  function setMemberWeight(id,v){if(state.combination!==null){updateCombination(id,{weight:Number(v)});return;}stop();const value=Math.min(1,Math.max(0,Number(v)));if(state.actionPreview){state.actionPreview.activations[id]=value;configureContext();setExpressionIntensity(state.intensity);state.explorer?.contextChanged();return;}state.manual=false;const e=state.expression;if(!e)return;(state.overrides[e.id]??={})[id]=value;configureContext();setExpressionIntensity(state.intensity);state.explorer?.contextChanged();}
  function previewAction(id,mode){if(mode.id!=='fiber-shortening'&&state.viewer.canPreviewAction&&!state.viewer.canPreviewAction(id,mode))return;stop();state.combination=null;restoreVisibility();state.selected=id;state.viewer.setSelected(id);state.actionPreview={id:'candidate-'+mode.id,nameZh:'单肌动作',bookPages:mode.bookPages||[],side:state.side,parts:{[id]:mode.part||mode.id},activations:{[id]:.75},actions:[{muscleId:id,part:mode.part,mode:mode.id,kind:'contract',directionZh:mode.directionZh}]};state.studyMode='solo';state.manual=false;configureContext();selectMuscle(id);state.playing=true;state.start=performance.now();$('play-expression').textContent='Ⅱ 暂停';$('stage-play').textContent='Ⅱ 暂停';$('expression-name').textContent='单肌动作 · '+(mode.label||mode.id);$('expression-description').textContent=mode.directionZh||'';$('expression-evidence').textContent='单独模式的示意运动；幅值可编辑。';state.explorer?.contextChanged();}
  function setExpressionIntensity(v){
    state.intensity=Math.min(1,Math.max(0,Number(v)||0));zeroPose();
    const e=getContext();
    if(e){for(const [id,raw] of Object.entries(expressionMap(e))){
      if(!(id in state.left))continue;
      const weight=state.actionPreview?.activations[id]??currentWeight(id);
      const side=(typeof raw==='object'&&raw.side)||e.side||'both';
      let factor=state.studyMode==='context'&&id!==state.selected?state.heldIntensity:state.intensity;
      if(state.studyMode==='solo'&&id!==state.selected)factor=0;
      if(side!=='right')state.left[id]=Math.min(1,Math.max(0,weight*factor));
      if(side!=='left')state.right[id]=Math.min(1,Math.max(0,weight*factor));
    }
    state.jaw=(e.jawOpen??0)*(state.studyMode==='solo'?0:state.studyMode==='context'?state.heldIntensity:state.intensity);
    }
    applyPose();updateControls();
  }
  function setExpression(id,{autoplay=false}={}){
    stop();state.combination=null;state.combinationJaw=0;state.actionPreview=null;state.studyMode='ensemble';state.manual=false;state.expression=state.data.expressions.find(e=>e.id===id);if(!state.expression)return;restoreVisibility();
    const e=state.expression;state.viewer.setExpressionMode?.(e.id==='neutral'?null:e.id);$('expression-name').textContent=e.nameZh+' · '+e.nameEn;$('expression-description').textContent=text(e.description);
    configureContext();
    const pairs=Object.entries(expressionMap(e)).filter(([id,v])=>state.data.muscles.some(m=>m.id===id)&&Number(typeof v==='object'?(v.weight??v.strength??v.activation):v)>0);
    $('active-count').textContent=pairs.length;
    $('active-muscle-tags').innerHTML=pairs.map(([id,v])=>`<button class="muscle-tag" data-muscle="${escape(id)}">${escape(state.data.muscles.find(m=>m.id===id).nameZh)}<small>${pct(typeof v==='object'?(v.weight??v.strength??v.activation):v)}</small></button>`).join('')||'<span class="empty-note">全部肌肉静息</span>';
    const p=pages(e);$('expression-evidence').textContent=(p.length?'原书 PDF '+p.join('、')+' 页 · ':'')+(e.side==='left'?'左侧示范 · ':'')+'肌肉组合参考原书；激活权重和时序为演示设定。';
    
    renderExpressions();setExpressionIntensity(e.id==='neutral'?0:.85);renderMuscles();
    if(pairs.length)selectMuscle(pairs[0][0]);
    state.explorer?.contextChanged();
    if(autoplay&&id!=='neutral')playStudy();
  }
  function buildSources(){
    $('sources-content').innerHTML=`<p class="source-intro">参考 Uldis Zarins 的 <i>Anatomy of Facial Expression</i>，把肌肉位置、独立动作和表情组合整理为可编辑的数据。公开网页保留书名与页码引用，不提供原书 PDF 或扫描图片。</p><table class="source-table"><thead><tr><th>组件</th><th>来源与许可</th><th>当前用途</th></tr></thead><tbody>
    <tr><td>颅骨、颈椎、面颈肌网格</td><td><a href="https://github.com/Charleeh/ecorche" target="_blank" rel="noopener">Écorché ↗</a><small>CC BY-SA 4.0 · 基于 BodyParts3D / Z-Anatomy</small></td><td>网站所用的独立结构，可分层与选择</td></tr>
    <tr><td>原始解剖数据</td><td><a href="https://lifesciencedb.jp/bp3d/?lng=en" target="_blank" rel="noopener">BodyParts3D ↗</a> · <a href="https://www.z-anatomy.com/" target="_blank" rel="noopener">Z-Anatomy ↗</a><small>保留上游署名和许可说明</small></td><td>解剖形态基础，未提供此应用所需表情绑定</td></tr>
    <tr><td>三维渲染、拾取与相机</td><td><a href="https://github.com/mrdoob/three.js" target="_blank" rel="noopener">Three.js 0.160.1 ↗</a><small>MIT · 与网站一起提供，无第三方 CDN 依赖</small></td><td>WebGL 渲染与交互</td></tr>
    <tr><td>肌肉动作与表情动画</td><td>本项目实现<small>MIT 源码；动画参数为人工设定</small></td><td>肌肉缩短、环肌收拢、皮肤示意响应</td></tr>
    </tbody></table><p class="source-intro">模型署名：Écorché（Charleeh），基于 BodyParts3D © The Database Center for Life Science 与 Z-Anatomy（Gauthier Kervyn）。本站抽取头颈结构、重组为 JSON，并添加示意绑定；衍生网格沿用 CC BY-SA 4.0。<br><a href="assets/source-models/ecorche/ATTRIBUTION.md" target="_blank" rel="noopener">完整上游署名</a> · <a href="assets/source-models/ecorche/LICENSES/CC-BY-SA-4.0.txt" target="_blank" rel="noopener">模型许可全文</a> · <a href="vendor/LICENSE-three.txt" target="_blank" rel="noopener">Three.js 许可</a> · <a href="LICENSE" target="_blank" rel="noopener">应用源码 MIT 许可</a></p><div class="method-box"><strong>如何理解这份复刻</strong><p>开放模型提供静态形态。缺失或需要细分的肌群使用自建示意几何，右侧会逐项标注。皮肤是与解剖参考配准的简化表面。表情由多个肌肉激活参数与独立下颌开合参数组合，非肌肉力学预测。</p><p>原书列出的肌肉和 AU 是动作依据；百分比、收缩幅度与播放时间不来自书中测量。现已分开演示眼轮匝肌眶部/睑部、额肌内外侧、鼻肌翼部/横部以及紧唇/噘嘴/漏斗唇模式；这些是局部运动学近似，不代表完整的独立神经通道。候选动作中尚未实现的区域分支会明确标注。</p><p>本网站由云端提供静态文件，模型加载完成后在浏览器中交互。首次访问和重新载入需要网络；无需启动个人电脑上的服务。公开说明列出使用方式、模型范围和来源许可。</p></div><p style="font-size:11px;margin-top:18px"><a href="methods.html#sources" target="_blank" rel="noopener">模型来源与许可 ↗</a>　<a href="methods.html#book" target="_blank" rel="noopener">书籍与页码引用 ↗</a>　<a href="methods.html#usage" target="_blank" rel="noopener">网页使用说明 ↗</a></p>`;
  }
  function bind(){
    $('muscle-list').addEventListener('click',e=>{const b=e.target.closest('button[data-muscle]');if(b)selectMuscle(b.dataset.muscle);});
    $('muscle-list').addEventListener('change',e=>{if(e.target.matches('[data-pick]'))toggleCombination(e.target.dataset.pick);});
    $('active-muscle-tags').addEventListener('click',e=>{const b=e.target.closest('button[data-muscle]');if(b)selectMuscle(b.dataset.muscle);});
    $('search-muscle').addEventListener('input',e=>{state.query=e.target.value.trim().toLowerCase();renderMuscles();});
    document.querySelectorAll('[data-region]').forEach(b=>b.onclick=()=>{state.region=b.dataset.region;document.querySelectorAll('[data-region]').forEach(x=>x.classList.toggle('active',x===b));renderMuscles();});
    document.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>{state.side=b.dataset.side;document.querySelectorAll('[data-side]').forEach(x=>x.classList.toggle('active',x===b));updateControls();});
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.viewer.setView(b.dataset.view);document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));});
    for(const layer of ['skin','muscles','bones'])$('layer-'+layer).onchange=e=>state.viewer.setLayer(layer,e.target.checked,layer==='skin'?Number($('skin-opacity').value):1);
    $('skin-opacity').oninput=e=>{$('skin-opacity-value').textContent=pct(e.target.value);state.viewer.setLayer('skin',$('layer-skin').checked,Number(e.target.value));};
    $('activation').oninput=e=>{stop();const value=Number(e.target.value);if(state.combination!==null){if(!state.combination[state.selected])toggleCombination(state.selected);const factor=state.intensity||1;updateCombination(state.selected,{weight:Math.min(1,value/factor)});if(!state.intensity)setExpressionIntensity(1);return;}markCustom();if(state.side!=='right')state.left[state.selected]=value;if(state.side!=='left')state.right[state.selected]=value;applyPose();updateControls();};
    $('pulse-muscle').onclick=()=>{
      if(state.pulse||(state.playing&&state.studyMode==='solo')){stop();return;}
      const participates=Object.prototype.hasOwnProperty.call(expressionMap(getContext()||{}),state.selected);
      if(participates){
        if(state.actionPreview){stop();state.studyMode='solo';state.manual=false;configureContext();setExpressionIntensity(state.intensity);state.explorer?.contextChanged();}
        else setStudyMode('solo');
        playStudy();return;
      }
      stop();markCustom();state.pulse=true;state.start=performance.now();$('pulse-muscle').textContent='Ⅱ 暂停收缩';
    };
    $('relax-muscle').onclick=()=>{
      stop();const side=state.combination?.[state.selected]?.side||state.actionPreview?.side||state.side;
      markCustom();if(side!=='right')state.left[state.selected]=0;if(side!=='left')state.right[state.selected]=0;
      applyPose();updateControls();
    };
    $('isolate').onclick=()=>{if(state.workbench){state.workbench.setDisplay(state.displayMode==='single'?'context':'single');$('isolate').classList.toggle('active',state.isolate);$('isolate').textContent=state.isolate?'取消单独显示':'单独显示';}else{state.isolate=!state.isolate;state.viewer.setIsolation(state.isolate?state.selected:null);}};
    $('hide-muscle').onclick=()=>{const id=state.referenceSelection?.name||state.selected;if(!id)return;if(state.hidden.has(id))state.hidden.delete(id);else state.hidden.add(id);state.viewer.setHidden(id,state.hidden.has(id));if(state.referenceSelection)selectReference(state.referenceSelection);else selectMuscle(id);};
    $('restore-visible').onclick=()=>{restoreVisibility();state.workbench?.setDisplay('context');selectMuscle(state.selected);};
    $('expression-list').onclick=e=>{const b=e.target.closest('[data-expression]');if(b)setExpression(b.dataset.expression,{autoplay:true});};
    $('expression-intensity').oninput=e=>{const v=e.target.value;stop();if(state.combination===null&&!state.actionPreview){if(!state.expression||state.expression.id==='neutral'){setExpression(state.data.expressions.find(x=>x.id!=='neutral').id);}else if(state.manual)setExpression(state.expression.id);}setExpressionIntensity(v);};
    $('play-expression').onclick=$('stage-play').onclick=playStudy;
    $('reset-all').onclick=()=>{stop();setExpression('neutral');toast('所有肌肉已恢复静息');};
    $('export-pose').onclick=()=>{const payload={schemaVersion:3,date:new Date().toISOString(),expression:state.manual?'custom':getContext()?.id,combination:state.combination,combinationJaw:state.combinationJaw,surfaceBinding:state.viewer.getSkinBindingDiagnostics?.(),sourcePreset:state.combination!==null||state.actionPreview?null:state.expression?.id,studyMode:state.studyMode,focusedMuscle:state.selected,actionContext:getContext(),overrides:state.overrides[state.expression?.id]||{},deformationMode:state.viewer.expressionMode||null,intensity:state.manual?null:state.intensity,activations:{left:state.left,right:state.right},jawOpen:state.jaw,interpretation:'Illustrative kinematic activation parameters, not measured muscle forces.',bookPages:pages(getContext())};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='facial-pose-'+(state.manual?'custom':getContext()?.id||'custom')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前姿态参数');};
    document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x===b));const expression=b.dataset.mode==='expression';$('stage-title').textContent=expression?'表情 · 肌肉与表面联动':'面颈部 · 分层解剖';if(state.workbench)state.workbench.setDisplay(expression?'overlay':'context');else{$('layer-skin').checked=expression;$('skin-opacity').value=expression?.82:.35;$('skin-opacity-value').textContent=pct($('skin-opacity').value);state.viewer.setLayer('skin',expression,Number($('skin-opacity').value));}if(expression){if(state.combination===null&&!state.actionPreview&&state.expression?.id==='neutral')setExpression(state.data.expressions.find(x=>/smile|happy|joy/.test(x.id))?.id||state.data.expressions[1].id);document.querySelector('.expression-section').scrollIntoView({behavior:'smooth',block:'nearest'});}});
    buildSources();$('sources-open').onclick=$('methods-open').onclick=()=>$('sources-dialog').showModal();
    document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
    document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  }
  let lastUI=0;
  function tick(t){
    if(state.playing||state.pulse){const duration=(state.pulse?3600:6000)/Number($('speed').value);const progress=(t-state.start)/duration;const v=.5-.5*Math.cos(2*Math.PI*(progress%1));
      if(!state.pulse&&progress>=1&&!$('loop').checked){setExpressionIntensity(0);stop();}
      else if(state.pulse){if(state.side!=='right')state.left[state.selected]=v;if(state.side!=='left')state.right[state.selected]=v;applyPose();if(t-lastUI>70){updateControls();lastUI=t;}}
      else {state.phase=progress%1<.5?'收缩':'回到静息';setExpressionIntensity(v);}
    }
    state.explorer?.frame();state.workbench?.frame();
    requestAnimationFrame(tick);
  }
  async function init(){try{
    const response=await fetch('data/book-anatomy.json');if(!response.ok)throw Error('肌肉数据未载入 ('+response.status+')');
    state.data=await response.json();
    if(!Array.isArray(state.data.muscles)||!Array.isArray(state.data.expressions))throw Error('书籍数据格式不完整');
    if(!state.data.expressions.some(e=>e.id==='neutral'))state.data.expressions.unshift({id:'neutral',nameZh:'中性',nameEn:'Neutral',description:'所有肌肉处于静息状态。',activations:{},bookPages:[]});
    state.viewer=new window.AnatomyViewer($('viewer'),{onSelect:id=>pickMuscle(typeof id==='string'?id:id.id),onReferenceSelect:selectReference});
    await state.viewer.init();
    zeroPose();bind();state.viewer.setLayer('skin',false,.35);state.viewer.setLayer('bones',true);state.viewer.setLayer('muscles',true);
    $('muscle-total').textContent=state.data.muscles.length;$('expression-total').textContent=state.data.expressions.length-1;
    $('model-status').textContent='29 组可动 · 188 个结构';$('loading').classList.add('hidden');renderMuscles();setExpression('neutral');selectMuscle(state.data.muscles.find(m=>m.id==='zygomaticus_major')?.id||state.data.muscles[0].id);
    window.anatomyApp={state,selectMuscle,selectReference,pickMuscle,setExpression,setExpressionIntensity,setStudyMode,setMemberWeight,currentWeight,playStudy,stop,previewAction,getContext,setCombination,updateCombination,toggleCombination,reset:()=>setExpression('neutral'),getState:()=>({selected:state.selected,side:state.side,expression:state.expression?.id,studyMode:state.studyMode,combination:state.combination,displayMode:state.displayMode,intensity:state.intensity,playing:state.playing,pulse:state.pulse,left:{...state.left},right:{...state.right},jawOpen:state.jaw,viewer:state.viewer.getState()})};
    state.explorer=new window.ActionExplorer(window.anatomyApp);await state.explorer.init();
    state.workbench=new window.MuscleWorkbench(window.anatomyApp);await state.workbench.init();
    setExpression('neutral');
    requestAnimationFrame(tick);
  }catch(err){console.error(err);$('loading').innerHTML='<b>模型未能加载</b><span>'+escape(err.message)+'</span><span>请检查网络连接后刷新页面；若仍失败，请使用支持 WebGL 的新版浏览器并开启图形加速。</span>';$('model-status').textContent='载入失败';}}
  init();
})();
