/* Evidence-led expression breakdown and cross-expression action-space explorer. */
(function(global){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>Math.round((Number(v)||0)*100)+'%';
  const asText=v=>typeof v==='string'?v:Array.isArray(v)?v.join('；'):v&&typeof v==='object'?Object.values(v).join('；'):'';
  const roleLabels={contract:'主动收缩',relax:'放松',passive:'被动随动',joint:'关节运动'};
  const partLabels={medial:'内侧',lateral:'外侧',whole:'全区',both:'内外侧',orbital:'眶部',palpebral:'睑部',alar:'鼻翼部',transverse:'横部',inferior:'下头',superior:'上头','lip-tightener':'紧唇','lip-pucker':'噘嘴',incisive:'切牙部','medial+lateral':'内外侧',global:'整体','upper-lid':'上睑',unspecified:'未进一步分部',mandible:'下颌',incisivus_superior:'上切牙束',incisivus_inferior:'下切牙束','incisivus_superior+incisivus_inferior':'上、下切牙束'};
  const partText=p=>partLabels[p]||(/lip-tight/.test(p)?'紧唇模式':/lip-pucker/.test(p)?'噘嘴模式':/lip-funnel/.test(p)?'漏斗唇模式':/medial.*lateral/.test(p)?'内外侧':/fiber-shortening|unspecified/.test(p)?'整体肌腹':'整体');
  class ActionExplorer{
    constructor(api){this.api=api;this.state=api.state;this.space=null;this.atlasMuscle=null;this.lastFrame=0;}
    async init(){
      try{const r=await fetch('data/action-space.json');if(!r.ok)throw Error(r.status);this.space=await r.json();}catch(e){this.space={perMuscle:[],sources:[],overview:'动作空间数据未载入'};console.warn('Action-space data unavailable',e);}
      $('dof-muscle').innerHTML=this.state.data.muscles.map(m=>`<option value="${esc(m.id)}">${esc(m.nameZh)}</option>`).join('');
      $('dof-muscle').onchange=e=>{this.atlasMuscle=e.target.value;this.api.selectMuscle(this.atlasMuscle);this.renderAtlas();};
      $('dof-open').onclick=()=>$('action-space').scrollIntoView({behavior:'smooth',block:'start'});
      document.querySelectorAll('[data-study-mode]').forEach(b=>b.onclick=()=>{this.api.setStudyMode(b.dataset.studyMode);if(this.api.getContext()?.id!=='neutral')this.api.playStudy();document.querySelector('.workspace').scrollIntoView({behavior:'smooth',block:'start'});});
      const analysis=()=>{this.state.viewer.setAnalysisOptions?.({ghost:$('show-ghost').checked,arrows:$('show-arrows').checked,gain:Number($('arrow-gain').value)});$('arrow-scale-label').textContent=$('arrow-gain').value;};
      $('show-ghost').onchange=$('show-arrows').onchange=$('arrow-gain').onchange=analysis;analysis();
      $('cooperation-table').onclick=e=>{const b=e.target.closest('[data-study-muscle]');if(!b)return;this.api.selectMuscle(b.dataset.studyMuscle);if(b.dataset.solo){this.api.setStudyMode('solo');this.api.playStudy();}document.querySelector('.workspace').scrollIntoView({behavior:'smooth',block:'start'});};
      $('cooperation-table').oninput=e=>{if(e.target.matches('[data-weight]'))e.target.nextElementSibling.textContent=pct(e.target.value);};
      $('cooperation-table').onchange=e=>{if(e.target.matches('[data-weight]'))this.api.setMemberWeight(e.target.dataset.weight,e.target.value);};
      $('dof-matrix').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.matrixMuscle){this.atlasMuscle=b.dataset.matrixMuscle;this.api.selectMuscle(this.atlasMuscle);this.renderAtlas();return;}if(b.dataset.matrixExpression){this.api.setExpression(b.dataset.matrixExpression);this.api.selectMuscle(b.dataset.muscle);const a=this.actions().find(x=>x.muscleId===b.dataset.muscle);this.api.setStudyMode(a?.kind==='contract'?'solo':'ensemble');this.api.playStudy();document.querySelector('.workspace').scrollIntoView({behavior:'smooth',block:'start'});}};
      $('dof-detail').onclick=e=>{const b=e.target.closest('[data-preview-mode]');if(!b)return;const item=this.getAtlas(this.atlasMuscle);const mode=item?.modes?.find(m=>m.id===b.dataset.previewMode);if(!mode)return;this.api.previewAction(this.atlasMuscle,mode);document.querySelector('.workspace').scrollIntoView({behavior:'smooth',block:'start'});};
      $('dof-principles').innerHTML='<article class="principle-card"><b>01 · 主动张力沿局部纤维</b><p>主动激活产生张力；负载下可缩短、等长或边受激边拉长。放松或被动伸长不等于主动向外推。滑块控制激活，不等于真实长度缩短率。</p></article><article class="principle-card"><b>02 · 一块肌肉不必只有一种局部模式</b><p>额肌内外侧、眼轮匝肌眶部/睑部、鼻肌翼部/横部、口轮匝肌紧唇/噘嘴，需要分别审视；横向膨胀不能自动算一个独立驱动。</p></article><article class="principle-card"><b>03 · 候选通道不等于已识别的自由度</b><p>这里总结书中支持的区域动作与建模候选。九组表情没有足够的位移、肌电或受力数据，不能据此确定真实独立自由度数。</p></article>';
      const sources=(this.space.sources||[]).filter(x=>x.url).map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.shortTitle||x.title||x.id)} ↗</a>`).join('');
      $('dof-boundary').innerHTML=`<strong>当前示意运动的表示</strong><code>u(x) ≈ Σ aᵣ · wᵣ(x) · dᵣ(x) + uⱼₐw(x, q)　　0 ≤ aᵣ ≤ 1</code><p>aᵣ 是区域激活，dᵣ(x) 是局部位移方向，wᵣ(x) 是影响权重；q 单独表示下颌运动。此式是运动学近似，不是本书给出的力学方程。区域招募、材料各向异性、最终形变自由度是不同层次；候选模式之间也可能相关或互斥。</p><p>当前只支持定性的方向/模式比较。网格轴向跨度和箭头来自本应用的示意网格变化，不能直接作为纤维应变或人体测量。</p><p><a href="methods.html#book" target="_blank">书籍与页码引用 ↗</a><a href="methods.html#limits" target="_blank">动作通道与模型范围 ↗</a></p><p>${sources}</p>`;
      this.contextChanged();
    }
    actions(e=this.api.getContext()){
      if(e?.actions?.length)return e.actions;
      const m=this.state.data.muscles;return [...Object.keys(e?.activations||{}).map(id=>({muscleId:id,kind:'contract',part:e.parts?.[id],directionZh:m.find(x=>x.id===id)?.action||'',bookPages:e.bookPages||[]})),...(e?.relaxed||[]).map(id=>({muscleId:id,kind:'relax',directionZh:'本表情中放松；不施加主动缩短。',bookPages:e.bookPages||[]}))];
    }
    getAtlas(id){return(this.space.perMuscle||[]).find(x=>x.muscleId===id);}
    contextChanged(){
      const s=this.state,e=this.api.getContext(),m=s.data.muscles.find(x=>x.id===s.selected),actions=this.actions(e),a=actions.find(x=>x.muscleId===s.selected);
      document.querySelectorAll('[data-study-mode]').forEach(b=>b.classList.toggle('active',b.dataset.studyMode===s.studyMode));
      const modes={ensemble:'整组协同',solo:'单肌肉',context:'其余保持'};
      $('stage-study-label').textContent=(s.actionPreview?'候选动作':e?.nameZh||'静息')+' · '+modes[s.studyMode]+(s.studyMode!=='ensemble'&&m?' / '+m.nameZh:'');
      $('stage-title').textContent=s.actionPreview?'候选区域动作 · 示意演示':e?.id==='neutral'?'面颈部 · 静息解剖':'全组高亮 · '+actions.filter(x=>x.kind==='contract').length+' 组主动收缩';
      $('study-explanation').textContent=s.studyMode==='ensemble'?'整组按各自参考峰值同步收缩与回到静息；青绿色标记参与肌肉，浅绿色标记选中肌肉，蓝灰色标记被动随动。':s.studyMode==='solo'?'只改变当前肌肉在本表情中的激活，保留其局部分区/动作方式；其他肌肉与下颌暂置于静息。':'其他肌肉和下颌保持切换时的表情强度，仅让选中肌肉在静息与该表情参考峰值之间变化。';
      $('member-action').textContent=a?(roleLabels[a.kind]||a.kind)+' · '+(a.directionZh||'见书中动作说明'):'未列为当前表情的主动参与肌；可在肌肉目录单独探索。';
      $('member-part').textContent=a?'区域：'+partText(a.part)+(a.kind==='contract'?' · 本表情参考峰值 '+pct(s.actionPreview?.activations[s.selected]??this.api.currentWeight(s.selected)):'')+(a.notes?' · '+asText(a.notes):''):'';
      $('pulse-muscle').textContent=s.playing&&s.studyMode==='solo'?'Ⅱ 暂停收缩':a?.kind==='contract'?'▶ 本表情收缩':'▶ 自定义收缩';
      this.renderCooperation();this.atlasMuscle=s.selected||this.atlasMuscle||s.data.muscles[0].id;this.renderAtlas();this.frame(true);s.workbench?.render();
    }
    renderCooperation(){
      const actions=this.actions(),s=this.state;
      if(!actions.length){$('cooperation-table').innerHTML='<p class="dof-empty">选择上方表情，查看整组肌肉及每块肌肉的动作方向。</p>';return;}
      $('cooperation-table').innerHTML=`<table><thead><tr><th>肌肉 / 区域</th><th>动作类型</th><th>本表情中的变化方向</th><th>参考激活峰值 · 可调整</th><th>当前参数 / 单独演示</th><th>依据</th></tr></thead><tbody>${actions.map(a=>{const m=s.data.muscles.find(m=>m.id===a.muscleId);const id=a.muscleId||'joint';const p=(a.bookPages||this.api.getContext()?.bookPages||[])[0];return`<tr class="${s.selected===id?'current':''}" data-action-row="${esc(id)}"><td><button class="muscle-link" data-study-muscle="${esc(id)}">${esc(m?.nameZh||a.nameZh||(a.kind==='joint'?'下颌关节运动':id))}</button><small>${esc(partText(a.part))}</small></td><td><span class="role-badge ${a.kind}">${roleLabels[a.kind]||esc(a.kind)}</span></td><td>${esc(a.directionZh)}${a.notes?'<small>'+esc(asText(a.notes))+'</small>':''}</td><td>${a.kind==='contract'?`<label class="participant-controls"><input type="range" min="0" max="1" step="0.05" value="${this.api.currentWeight(id)}" data-weight="${esc(id)}" aria-label="${esc(m?.nameZh)}本表情参考峰值"><output>${pct(this.api.currentWeight(id))}</output></label>`:'<small>不设主动收缩量</small>'}</td><td><div class="participant-controls"><span class="live-bar"><i data-live-bar="${esc(id)}"></i></span><output data-live-value="${esc(id)}">0%</output>${a.kind==='contract'?`<button data-study-muscle="${esc(id)}" data-solo="true">▶ 单肌肉</button>`:''}</div></td><td>${p?`<span class="reference-link">PDF 第 ${p} 页</span>`:''}<small>${a.evidence?.startsWith?.('book-explicit')?'书中明确':a.evidence?.includes?.('infer')?'方向推断 / 已标注':'见逐图复核'}</small></td></tr>`;}).join('')}</tbody></table>`;
    }
    renderAtlas(){
      const id=this.atlasMuscle;if(!id)return;$('dof-muscle').value=id;
      const m=this.state.data.muscles.find(x=>x.id===id),item=this.getAtlas(id);
      if(!item){$('dof-detail').innerHTML=`<h3>${esc(m?.nameZh)}</h3><p>${esc(m?.action)}</p><p>候选动作通道数据尚未载入；不据此估算自由度数。</p>`;}else{
        $('dof-detail').innerHTML=`<div class="eyebrow">REGIONAL ACTION MODES</div><h3>${esc(m?.nameZh)}</h3><p>${esc(m?.nameEn)}</p><div class="candidate-label">候选模式 ${esc(item.candidateDimension??'—')} · 非实测独立自由度</div>${(item.modes||[]).map(mode=>`<article class="mode-card"><b>${esc(mode.label)}</b><p>${esc(mode.directionZh)}</p><small>${esc(mode.mechanism)}</small><small>涉及表情：${(mode.expressions||[]).map(id=>esc(this.state.data.expressions.find(e=>e.id===id)?.nameZh||id)).join('、')||'本组表情尚未充分覆盖'}</small>${this.state.viewer.canPreviewAction?.(id,mode)?`<button class="mode-preview" data-preview-mode="${esc(mode.id)}">▶ 演示此区域动作</button>`:`<small class="unbound-mode">候选机制 · 尚未绑定独立形变</small>`}</article>`).join('')}<div class="regional-note"><b>区域差异与被动变化</b><p>${esc(asText(item.activeVsPassive))}</p><p>${esc(asText(item.regionalBehavior))}</p><p>${esc(item.limitation)}</p></div>`;
      }
      const expressions=this.state.data.expressions.filter(e=>e.id!=='neutral');
      $('dof-matrix').innerHTML=`<table><thead><tr><th>肌肉 ↓ / 表情 →</th>${expressions.map(e=>`<th>${esc(e.nameZh)}</th>`).join('')}</tr></thead><tbody>${this.state.data.muscles.map(m=>`<tr class="${m.id===id?'current':''}"><td><button class="matrix-muscle" data-matrix-muscle="${m.id}">${esc(m.nameZh)}</button></td>${expressions.map(e=>{const a=this.actions(e).find(a=>a.muscleId===m.id);if(!a)return'<td><span class="matrix-cell empty">—</span></td>';return`<td><button class="matrix-cell ${a.kind} ${this.state.expression?.id===e.id&&id===m.id?'active':''}" data-matrix-expression="${e.id}" data-muscle="${m.id}" title="${esc(a.directionZh)}">${esc(a.kind==='contract'?partText(a.part):roleLabels[a.kind])}</button></td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
    }
    frame(force=false){
      const now=performance.now();if(!force&&now-this.lastFrame<100)return;this.lastFrame=now;
      const s=this.state;for(const out of document.querySelectorAll('[data-live-value]')){const id=out.dataset.liveValue;out.textContent=pct(Math.max(s.left[id]||0,s.right[id]||0));}for(const bar of document.querySelectorAll('[data-live-bar]')){const id=bar.dataset.liveBar;bar.style.width=pct(Math.max(s.left[id]||0,s.right[id]||0));}
      const joint=document.querySelector('[data-action-row="joint"]');if(joint){joint.querySelector('[data-live-value]').textContent=pct(s.jaw);joint.querySelector('[data-live-bar]').style.width=pct(s.jaw);}
      if(s.referenceSelection)return;
      const motion=s.viewer.getMuscleMotion?.(s.selected);if(motion){const max=Number(motion.maxDisplacement)||0;const shortening=Number(motion.shorteningPercent)||0;const ring=motion.sides?.[0]?.metric?.includes('perimeter');$('member-motion').textContent=(ring?'外形周长估计':'沿示意附着轴跨度')+(shortening>=0?'缩短 ':'伸长 ')+Math.abs(shortening).toFixed(1)+'% · 最大位移 '+(max*100).toFixed(1)+' mm（网格估计）';
        const sides=motion.sides||[];const chosen=this.api.getContext()?.actions?.find(a=>a.muscleId===s.selected)?.side||this.api.getContext()?.side;const side=chosen==='right'?'right':chosen==='left'?'left':(s.right[s.selected]||0)>(s.left[s.selected]||0)?'right':s.side==='right'?'right':'left';const regions=sides.find(x=>x.side===side)?.regions||[];
        const byPart=new Map();for(const r of regions){let p=byPart.get(r.part);if(!p){p={count:0,x:0,y:0,z:0};byPart.set(r.part,p);}p.count+=r.vertices;for(const axis of ['x','y','z'])p[axis]+=r.centroidDisplacement[axis]*r.vertices;}
        const direction=p=>{const x=p.x/p.count*100,y=p.y/p.count*100,z=p.z/p.count*100;return[(Math.abs(x)<.05?'横向 0':(x*(side==='left'?1:-1)>0?'外':'内')+' '+Math.abs(x).toFixed(1)),(y>=0?'上':'下')+' '+Math.abs(y).toFixed(1),(z>=0?'前':'后')+' '+Math.abs(z).toFixed(1)].join(' / ');};
        $('member-regions').innerHTML='<span>局部平均位移 · '+(side==='left'?'左':'右')+'侧 · mm</span>'+[...byPart].map(([part,p])=>'<div><b>'+esc(partText(part))+'</b><span>'+direction(p)+'</span></div>').join('')+'<small>整体移动与局部伸缩不同；以上不表示肌纤维应变。</small>';
      }
    }
  }
  global.ActionExplorer=ActionExplorer;
})(window);
