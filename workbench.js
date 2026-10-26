/* Local composition, dissection and surface correspondence controls. */
(function(global){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>Math.round((Number(v)||0)*100)+'%';
  class MuscleWorkbench {
    constructor(api){this.api=api;this.s=api.state;this.display=null;this.lastFrame=0;this.neck=null;}
    async init(){
      const s=this.s;
      if(global.MuscleDisplay){this.display=new global.MuscleDisplay(s.viewer);s.viewer.displayPlugin=this.display;this.display.setOptions({fibers:true,depth:'all',contrast:.75,density:1});}
      $('show-fibers').onchange=e=>this.display?.setOptions({fibers:e.target.checked});
      $('muscle-depth').onchange=e=>{this.display?.setOptions({depth:e.target.value});if(e.target.value==='neck')s.viewer.setView('neck');};
      document.querySelectorAll('[data-display]').forEach(b=>b.onclick=()=>this.setDisplay(b.dataset.display));
      $('multi-pick').onchange=e=>{s.multiselect=e.target.checked;$('viewer').classList.toggle('multi-select-enabled',s.multiselect);};
      $('combine-current').onclick=()=>this.fromExpression();
      $('combine-focused').onclick=()=>{if(!s.combination?.[s.selected])this.api.toggleCombination(s.selected);this.scrollCombination();};
      $('combine-clear').onclick=()=>this.api.setCombination([],{jaw:0,intensity:0});
      $('combine-play').onclick=()=>{if(s.combination===null)this.fromExpression();this.api.playStudy();this.render();};
      $('combination-intensity').oninput=e=>{const value=Number(e.target.value);this.api.stop();if(s.combination===null)this.fromExpression();this.api.setExpressionIntensity(value);};
      $('combination-jaw').oninput=e=>{const value=Number(e.target.value);this.api.stop();if(s.combination===null)this.api.setCombination([],{jaw:0});s.combinationJaw=value;this.api.setExpressionIntensity(s.intensity||1);this.frame(true);};
      $('combination-list').onclick=e=>{const remove=e.target.closest('[data-remove]'),focus=e.target.closest('[data-focus]');if(remove){this.api.toggleCombination(remove.dataset.remove);return;}if(focus){this.api.selectMuscle(focus.dataset.focus);document.querySelector('.workspace').scrollIntoView({behavior:'smooth'});}};
      $('combination-list').oninput=e=>{if(e.target.matches('[data-combo-weight]'))e.target.nextElementSibling.textContent=pct(e.target.value);};
      $('combination-list').onchange=e=>{const id=e.target.dataset.id;if(!id)return;if(e.target.matches('[data-combo-weight]'))this.api.updateCombination(id,{weight:Number(e.target.value)});if(e.target.matches('[data-combo-side]'))this.api.updateCombination(id,{side:e.target.value});if(e.target.matches('[data-combo-mode]')){const mode=this.modes(id).find(m=>m.id===e.target.value);this.api.updateCombination(id,{mode:mode?.id||e.target.value,part:mode?.part||'whole',directionZh:mode?.directionZh||''});}};
      $('individual-modes').onclick=e=>{const b=e.target.closest('[data-individual-mode]');if(!b)return;const mode=this.modes(s.selected).find(m=>m.id===b.dataset.individualMode);if(!mode)return;if(s.combination!==null){if(!s.combination[s.selected])this.api.toggleCombination(s.selected);this.api.updateCombination(s.selected,{mode:mode.id,part:mode.part,directionZh:mode.directionZh});this.api.playStudy();}else this.api.previewAction(s.selected,mode);};
      $('binding-audit').onclick=()=>this.audit();
      document.querySelectorAll('[data-neck-demo]').forEach(b=>b.onclick=()=>{const id=b.dataset.neckDemo;this.api.setCombination([{id,weight:.8,side:'both',mode:'fiber-shortening'}],{intensity:.85,jaw:0});this.api.selectMuscle(id);s.viewer.setView('neck');this.setDisplay('overlay');this.api.playStudy();document.querySelector('.workspace').scrollIntoView({behavior:'smooth'});});
      $('neck-fear').onclick=()=>{this.api.setExpression('fear');this.api.selectMuscle('platysma');s.viewer.setView('neck');this.setDisplay('muscles');this.api.playStudy();document.querySelector('.workspace').scrollIntoView({behavior:'smooth'});};
      try{const r=await fetch('data/neck-coverage.json');if(r.ok)this.neck=await r.json();}catch(e){console.warn('Neck coverage unavailable',e);}
      this.renderNeck();this.render();
    }
    modes(id){
      const item=this.s.explorer?.getAtlas(id),m=this.s.data.muscles.find(m=>m.id===id);
      return [{id:'fiber-shortening',label:'整肌示意运动',part:'whole',directionZh:m?.action||'',supported:true},...(item?.modes||[]).map(mode=>({...mode,supported:this.s.viewer.canPreviewAction?.(id,mode)}))];
    }
    fromExpression(){
      const e=this.api.getContext();const members=Object.entries(e?.activations||{}).map(([id,raw])=>{const a=e.actions?.find(a=>a.muscleId===id);return{id,weight:typeof raw==='object'?raw.weight:this.api.currentWeight(id),side:a?.side||e.side||'both',mode:a?.mode||'fiber-shortening',part:a?.part||'whole',directionZh:a?.directionZh||''};});
      if(!members.length&&this.s.selected)members.push({id:this.s.selected,weight:.7,side:this.s.side});
      this.api.setCombination(members,{jaw:e.jawOpen||0,intensity:this.s.intensity||.8});
    }
    groupIds(){const focused=this.s.referenceSelection?.name||this.s.selected;if(this.s.displayMode==='single')return focused?[focused]:[];const ids=Object.keys(this.api.getContext()?.activations||{});return ids.length?ids:focused?[focused]:[];}
    setDisplay(mode){
      this.s.displayMode=mode;this.s.isolate=mode==='single';this.s.viewer.setIsolation(null);
      if(mode!=='context'){$('muscle-depth').value='all';this.display?.setOptions({depth:'all'});}
      const skin=['overlay','surface'].includes(mode),muscles=mode!=='surface';
      $('layer-skin').checked=skin;$('layer-muscles').checked=muscles;$('layer-bones').checked=mode==='context';
      if(skin){$('skin-opacity').value=mode==='surface'?1:.38;$('skin-opacity-value').textContent=pct($('skin-opacity').value);}
      this.s.viewer.setLayer('skin',skin,Number($('skin-opacity').value));this.s.viewer.setLayer('muscles',muscles);this.s.viewer.setLayer('bones',mode==='context');
      this.applyDisplay();this.render();
    }
    applyDisplay(){
      const mode=this.s.displayMode;
      this.s.viewer.setIsolationGroup?.(mode==='context'?null:this.groupIds(),{hideBones:mode!=='context',hideExtras:mode==='muscles'||mode==='single'});
      document.querySelectorAll('[data-display]').forEach(b=>b.classList.toggle('active',b.dataset.display===mode));
    }
    scrollCombination(){$('combination-section').scrollIntoView({behavior:'smooth',block:'start'});}
    render(){
      const s=this.s,rows=Object.entries(s.combination||{}),m=s.data.muscles.find(m=>m.id===s.selected);
      this.applyDisplay();
      document.querySelectorAll('[data-side]').forEach(b=>{b.disabled=s.combination!==null;b.title=s.combination!==null?'组合模式请在该肌肉行设置作用侧':'';b.classList.toggle('active',b.dataset.side===(s.combination?.[s.selected]?.side||s.side));});
      $('combination-status').textContent=s.combination===null?'在左侧勾选肌肉，或从表情开始。':`${rows.length} 组肌肉 · ${s.playing?'正在协同运动':'已定格'} · 不限制共激活组合`;
      $('combine-play').textContent=s.combination!==null&&s.playing?'Ⅱ 暂停组合':'▶ 播放组合';
      $('combination-list').innerHTML=rows.length?rows.map(([id,row])=>{const muscle=s.data.muscles.find(m=>m.id===id),modes=this.modes(id).filter(m=>m.supported);if(!modes.some(m=>m.id===row.mode))modes.push({id:row.mode,label:'表情指定动作'});return`<article class="composition-row ${id===s.selected?'focused':''}"><button class="composition-name" data-focus="${esc(id)}"><strong>${esc(muscle.nameZh)}</strong><small>${esc(muscle.nameEn)}</small></button><label>动作模式<select data-combo-mode data-id="${esc(id)}">${modes.map(m=>`<option value="${esc(m.id)}" ${m.id===row.mode?'selected':''}>${esc(m.label)}</option>`).join('')}</select></label><label>作用侧<select data-combo-side data-id="${esc(id)}"><option value="both" ${row.side==='both'?'selected':''}>双侧</option><option value="left" ${row.side==='left'?'selected':''}>左侧</option><option value="right" ${row.side==='right'?'selected':''}>右侧</option></select></label><label class="composition-weight">峰值激活<span><input type="range" min="0" max="1" step=".01" value="${row.weight}" data-id="${esc(id)}" data-combo-weight><output>${pct(row.weight)}</output></span></label><span class="composition-live" data-combo-live="${esc(id)}">0%</span><button class="remove-composition" data-remove="${esc(id)}" aria-label="移除${esc(muscle.nameZh)}">×</button></article>`;}).join(''):'<div class="composition-empty">从左侧目录勾选任意肌肉。可组合不同区域、左右侧与不同动作模式，再同时播放。</div>';
      if(m){const modes=this.modes(m.id);$('individual-modes').innerHTML=`<div class="mode-heading">这块肌肉的动作模式 <small>${s.combination!==null?'点击修改组合中的模式；侧别在组合行设置':'点击单独播放'}</small></div>${modes.map(mode=>`<button data-individual-mode="${esc(mode.id)}" ${mode.supported?'':'disabled'} title="${esc(mode.supported?mode.directionZh:'当前仅有机制说明，未绑定独立形变')}">${esc(mode.label)}${mode.supported?'':' · 待绑定'}</button>`).join('')}`;}
      else if(s.referenceSelection)$('individual-modes').innerHTML='<div class="mode-heading">参考结构 · 尚未绑定运动</div><p>可单独观察和隐藏。独立伸缩需先定义附着及关节耦合。</p>';
      this.frame(true);
    }
    frame(force=false){const t=performance.now();if(!force&&t-this.lastFrame<120)return;this.lastFrame=t;const s=this.s;for(const x of document.querySelectorAll('[data-combo-live]'))x.textContent=pct(Math.max(s.left[x.dataset.comboLive]||0,s.right[x.dataset.comboLive]||0));$('combination-intensity').value=s.combination!==null?s.intensity:0;$('combination-intensity-value').textContent=pct(s.combination!==null?s.intensity:0);$('combination-jaw').value=s.combinationJaw;$('combination-jaw-value').textContent=pct(s.combinationJaw);$('combine-play').textContent=s.combination!==null&&s.playing?'Ⅱ 暂停组合':'▶ 播放组合';if(s.combination!==null)$('combination-status').textContent=`${Object.keys(s.combination).length} 组肌肉 · ${s.playing?'正在协同运动':'已定格'} · 不限制共激活组合`;}
    audit(){
      const v=this.s.viewer,d=v.verifySkinBinding?.()||v.getSkinBindingDiagnostics?.();
      const coverage=d?.skin?.coverage;
      $('binding-audit-result').textContent=d?.ready?`${d.passed?'当前数值检查通过':'当前数值检查未通过'} · 透明度改变：${d.opacityInvariant?'顶点坐标一致':'尚未确认'} · 重建残差 ${Number(d.currentReconstructionError).toExponential(2)} · 表皮绑定覆盖 ${pct(coverage)}。此检查验证共同驱动关系，不验证人体力学。`:'绑定诊断尚未就绪。';
      this.lastAudit=d;console.info('Skin correspondence audit',d);
    }
    renderNeck(){
      const n=this.neck;if(!n){$('neck-coverage-content').innerHTML='<p>颈阔肌参与原书恐惧表情；胸锁乳突肌另作姿态相关示意。完整核对见下方研究记录。</p>';return;}
      const names={animated:'可动示意',reference:'已载入 · 参考结构',missing:'未载入'};
      $('neck-coverage-content').innerHTML=`<p class="coverage-summary">${esc(n.summaryZh||'颈部显示与驱动覆盖')}</p><div class="coverage-table"><table><thead><tr><th>肌肉 / 肌群</th><th>分类</th><th>当前覆盖</th><th>说明</th></tr></thead><tbody>${(n.muscles||[]).map(m=>`<tr><td><b>${esc(m.nameZh)}</b><small>${esc(m.nameEn)}</small></td><td>${esc(m.category)}</td><td><span class="coverage-status ${esc(m.controlStatus)}">${names[m.controlStatus]||esc(m.controlStatus)}${Number.isFinite(m.meshCount)?' · '+m.meshCount+' 网格':''}</span></td><td>${esc(m.noteZh)}</td></tr>`).join('')}</tbody></table></div><p class="coverage-limit">${(n.limitations||[]).map(esc).join('；')}</p>`;
    }
  }
  global.MuscleWorkbench=MuscleWorkbench;
})(window);
