/* MuscleDisplay: original procedural display aids for the anatomy surfaces.
 * No 3DBody assets are used. The direction field is an anatomical teaching
 * approximation, not measured fascicles, a segmentation, or a mechanical model.
 * Surface traces store triangle barycentric coordinates and follow the actual
 * deformed mesh; this module never changes source/base or position arrays.
 */
(function (global) {
  'use strict';
  const T = global.THREE;
  if (!T) throw new Error('Load Three.js before muscle-display.js');
  const clamp = (x,a,b) => Math.max(a,Math.min(b,Number(x)||0));
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const sub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm = a => {const l=Math.hypot(...a)||1;return a.map(x=>x/l);};
  const point = (p,i) => [p[i*3],p[i*3+1],p[i*3+2]];
  const distance2 = (a,b) => dot(sub(a,b),sub(a,b));
  const DEEP = new Set(['corrugator_supercilii','depressor_supercilii','buccinator','levator_anguli_oris','depressor_septi_nasi','levator_palpebrae_superioris','superior_tarsal','medial_pterygoid','lateral_pterygoid']);
  const NECK = /platysma|sternocleidomastoid|sternohyoid|omohyoid|thyrohyoid|sternothyroid|geniohyoid|mylohyoid|digastric|stylohyoid|scalen|capitis|cervicis|trapezius|levator scapulae|multifidus|semispinalis|longissimus|splenius/i;
  const LAYERS = [
    {id:'all',label:'全部肌肉',description:'所有来源网格，包含尚无独立动作控件的参考肌肉。'},
    {id:'superficial',label:'浅层肌肉',description:'按来源分层及已知解剖分部筛选；不是统一深度阈值。'},
    {id:'deep',label:'深层肌肉',description:'移除浅层遮挡，显示深层表情肌、咀嚼肌及深颈肌。'},
    {id:'neck',label:'颈部范围',description:'区域筛选，包含浅/深颈肌及舌骨相关参考肌；不表示新增动作自由度。'}
  ];

  function metadata(mesh) {
    const u=mesh.userData,n=mesh.name||'',sourceLayer=u.sourceLayer||'';
    const connective=/aponeurosis|tendon|ligament/i.test(n)||/tendon|aponeurosis/i.test(u.tissue||'');
    let layer=/deep/i.test(sourceLayer)?'deep':/superficial/i.test(sourceLayer)?'superficial':DEEP.has(u.id)?'deep':'superficial';
    if(/deep part|pterygoid|levator palpebrae|superior tarsal/i.test(n))layer='deep';
    const bounds=u.bounds||mesh.geometry.boundingBox;
    const neck=NECK.test(n)||(!u.id&&bounds&&bounds.min.y<-.5&&bounds.max.y<.5);
    return {name:n,muscleId:u.id||null,side:u.side||'midline',layer,region:neck?'neck':'face',connective,
      sourceLayer:sourceLayer||null,classificationEvidence:sourceLayer?'source-mesh-layer':'name-and-anatomy-inference',
      directionEvidence:connective?'not-a-contractile-muscle':u.origin&&u.insertion?'shape-and-attachment-approximation':'shape-principal-axis-approximation'};
  }

  function principalAxis(p) {
    const mean=[0,0,0],count=p.length/3;
    for(let i=0;i<p.length;i++)mean[i%3]+=p[i]/count;
    const c=Array(9).fill(0);
    for(let i=0;i<p.length;i+=3){const q=[p[i]-mean[0],p[i+1]-mean[1],p[i+2]-mean[2]];for(let a=0;a<3;a++)for(let b=0;b<3;b++)c[a*3+b]+=q[a]*q[b];}
    let v=norm([.3,1,.2]);
    for(let k=0;k<14;k++)v=norm([dot(c.slice(0,3),v),dot(c.slice(3,6),v),dot(c.slice(6,9),v)]);
    return v;
  }

  function barycentric(p,t) {
    const q=sub(p,t.a),v0=t.v0,v1=t.v1,d00=dot(v0,v0),d01=dot(v0,v1),d11=dot(v1,v1),den=d00*d11-d01*d01;
    if(Math.abs(den)<1e-16)return [1/3,1/3,1/3];
    const v=(d11*dot(q,v0)-d01*dot(q,v1))/den,w=(d00*dot(q,v1)-d01*dot(q,v0))/den;
    return [1-v-w,v,w];
  }
  function fromWeights(t,w) {return [0,1,2].map(k=>t.a[k]+t.v0[k]*w[1]+t.v1[k]*w[2]);}

  class MuscleDisplay {
    constructor(viewer,options={}) {
      if(!viewer||!viewer.muscles)throw new Error('MuscleDisplay requires an initialized AnatomyViewer.');
      this.viewer=viewer;
      this.options={fibers:true,texture:true,depth:'all',contrast:.65,density:.72,contextOpacity:1,boneOpacity:.82,...options};
      this.selectedIds=new Set();this.records=new Map();this.disposed=false;
      this.group=new T.Group();this.group.name='Approximate surface-attached muscle directions';
      viewer.model.add(this.group);viewer.displayPlugin=this;
      this.notice='依据形态与附着点生成的肌束走向示意；贴合当前网格，不是实测纤维场。颈部参考肌的形态轴不等于已建立动作控制。';
      this._ensureRecords();this.updateVisibility();this.updateGeometry();
      viewer._refreshVisibility();
    }

    getLayerOptions(){return LAYERS.map(x=>({...x}));}
    getMeshInfo(){return Array.from(this.records.values(),r=>({...r.meta,traces:r.traceCount,segments:r.samples.length/2}));}
    getState(){return {...this.options,selectedIds:[...this.selectedIds],meshCount:this.records.size,traceCount:[...this.records.values()].reduce((s,r)=>s+r.traceCount,0),segmentCount:[...this.records.values()].reduce((s,r)=>s+r.samples.length/2,0),notice:this.notice};}
    setSelection(ids=[]) {this.selectedIds=new Set(ids);this.viewer._refreshVisibility();return this;}
    setOptions(values={}) {
      const oldDensity=this.options.density;
      for(const name of ['fibers','texture'])if(name in values)this.options[name]=!!values[name];
      if(LAYERS.some(x=>x.id===values.depth))this.options.depth=values.depth;
      if('contrast'in values)this.options.contrast=clamp(values.contrast,0,1);
      if('density'in values)this.options.density=clamp(values.density,.25,2);
      if('contextOpacity'in values)this.options.contextOpacity=clamp(values.contextOpacity,.12,1);
      if('boneOpacity'in values)this.options.boneOpacity=clamp(values.boneOpacity,.15,1);
      if(oldDensity!==this.options.density)for(const r of this.records.values())this._buildTraces(r);
      for(const r of this.records.values())r.uniform.value=this.options.texture?this.options.contrast:0;
      this._setDepthFlags();this.viewer._refreshVisibility();this.update();return this;
    }
    update(){this.updateVisibility();this.updateGeometry();}

    _ensureRecords() {
      for(const mesh of this.viewer.muscles)if(!this.records.has(mesh.uuid)) {
        const base=mesh.userData.base||mesh.geometry.attributes.position.array,meta=metadata(mesh);
        const r={mesh,base,meta,triangles:[],samples:[],traceCount:0,axis:principalAxis(base),uniform:{value:this.options.texture?this.options.contrast:0}};
        this.records.set(mesh.uuid,r);mesh.userData.displayInfo=meta;
        if(!meta.connective){this._buildTopology(r);this._installTexture(r);this._buildTraces(r);}
      }
    }

    _buildTopology(r) {
      const indices=r.mesh.geometry.index?.array||Array.from({length:r.base.length/3},(_,i)=>i),edges=new Map();
      for(let i=0;i+2<indices.length;i+=3) {
        const ids=[indices[i],indices[i+1],indices[i+2]],a=point(r.base,ids[0]),b=point(r.base,ids[1]),c=point(r.base,ids[2]),v0=sub(b,a),v1=sub(c,a),normal=cross(v0,v1),area=Math.hypot(...normal)/2;
        const t={ids,a,v0,v1,normal:norm(normal),area,neighbors:[-1,-1,-1],center:a.map((x,k)=>(x+b[k]+c[k])/3)};
        const ti=r.triangles.length;r.triangles.push(t);
        for(let k=0;k<3;k++) {
          const e=[ids[(k+1)%3],ids[(k+2)%3]].sort((x,y)=>x-y).join(':');
          if(edges.has(e)){const prev=edges.get(e);t.neighbors[k]=prev[0];r.triangles[prev[0]].neighbors[prev[1]]=ti;}
          else edges.set(e,[ti,k]);
        }
      }
      r.area=r.triangles.reduce((s,t)=>s+t.area,0);
    }

    _direction(r,p) {
      const u=r.mesh.userData,id=u.id,sign=u.side==='right'?-1:1;
      if(id==='orbicularis_oculi')return [-(p[1]-.962)/(.15*.15),(p[0]-sign*.30)/(.24*.24),0];
      if(id==='orbicularis_oris')return [-(p[1]-.343)/(.12*.12),p[0]/(.32*.32),0];
      if(['temporalis','depressor_anguli_oris','levator_labii_superioris','levator_anguli_oris','buccinator'].includes(id)&&u.insertion)return sub(u.insertion.toArray(),p);
      if(id==='frontalis')return [sign*.08*(Math.abs(p[0])-.25),1,-.15];
      if(id==='platysma')return [sign*.22*(Math.abs(p[0])-.20),-1,-.10];
      // One unsplit source: lower alar and upper transverse axes are a display
      // approximation, not a new segmentation of the original nasalis surface.
      if(id==='nasalis')return p[1]<.84?[sign*.22,1,.10]:[-sign,.10,.15];
      if(u.origin&&u.insertion)return sub(u.insertion.toArray(),u.origin.toArray());
      return r.axis;
    }

    _installTexture(r) {
      const {mesh,base}=r,u=mesh.userData,id=u.id,sign=u.side==='right'?-1:1;
      let axis=u.origin&&u.insertion?norm(sub(u.insertion.toArray(),u.origin.toArray())):r.axis;
      let across=norm(cross(axis,Math.abs(axis[2])>.8?[0,1,0]:[0,0,1]));
      const uv=new Float32Array(base.length/3*2);
      for(let i=0;i<base.length;i+=3) {
        const p=point(base,i/3);let phase=dot(p,across)*70;
        if(id==='orbicularis_oculi')phase=Math.hypot((p[0]-sign*.30)/.24,(p[1]-.962)/.15)*24;
        else if(id==='orbicularis_oris')phase=Math.hypot(p[0]/.32,(p[1]-.343)/.12)*22;
        else if(id==='temporalis'&&u.insertion)phase=Math.atan2(p[2]-u.insertion.z,p[1]-u.insertion.y)*28;
        else if(['depressor_anguli_oris','levator_labii_superioris','levator_anguli_oris','buccinator'].includes(id)&&u.insertion){const q=sub(p,u.insertion.toArray());phase=Math.atan2(dot(q,across),Math.abs(dot(q,axis))+.02)*24;}
        else if(id==='frontalis')phase=(p[0]-.025*Math.sin(p[1]*2))*75;
        else if(id==='platysma')phase=(p[0]+sign*.035*(p[1]+1)**2)*65;
        else if(id==='nasalis')phase=p[1]<.84?p[0]*90:p[1]*85;
        uv[i/3*2]=phase;uv[i/3*2+1]=dot(p,axis);
      }
      mesh.geometry.setAttribute('mdFiberCoord',new T.BufferAttribute(uv,2));
      r.previousCompile=mesh.material.onBeforeCompile;r.previousCacheKey=mesh.material.customProgramCacheKey;
      mesh.material.onBeforeCompile=shader=>{
        if(r.previousCompile)r.previousCompile.call(mesh.material,shader);
        shader.uniforms.mdFiberContrast=r.uniform;
        shader.vertexShader='attribute vec2 mdFiberCoord; varying vec2 vMDFiber;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMDFiber = mdFiberCoord;');
        shader.fragmentShader='uniform float mdFiberContrast; varying vec2 vMDFiber;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float mdPhase = vMDFiber.x + 0.035 * sin(vMDFiber.y * 38.0);
          float mdWave = abs(sin(mdPhase * 3.14159265));
          float mdAA = max(0.10, fwidth(mdPhase) * 2.0);
          float mdRidge = 1.0 - smoothstep(0.03, mdAA + 0.13, mdWave);
          float mdDetail = 1.0 - smoothstep(0.55, 1.40, fwidth(mdPhase));
          diffuseColor.rgb *= 1.0 + mdFiberContrast * mdDetail * (mdRidge * 0.23 - 0.045);
        `);
      };
      mesh.material.customProgramCacheKey=()=> 'muscle-display-surface-fiber-v1';
      mesh.material.extensions={...(mesh.material.extensions||{}),derivatives:true};mesh.material.needsUpdate=true;
    }

    _walk(r,startIndex,sign,maxLength) {
      let ti=startIndex,w=[1/3,1/3,1/3],length=0,previous=null;const out=[],visited=new Map();
      for(let step=0;step<70&&length<maxLength;step++) {
        const t=r.triangles[ti];if(!t||t.area<1e-12)break;
        const p=fromWeights(t,w);let dir=this._direction(r,p),dn=dot(dir,t.normal);dir=norm(dir.map((x,k)=>x-dn*t.normal[k]));
        if(previous){if(dot(dir,previous)<0)dir=dir.map(x=>-x);}else dir=dir.map(x=>x*sign);
        if(Math.hypot(...dir)<.01)break;
        const bw=barycentric(p.map((x,k)=>x+dir[k]),t),dw=bw.map((x,k)=>x-w[k]);
        let travel=Infinity,edge=-1;
        for(let k=0;k<3;k++)if(dw[k]<-1e-10){const v=-w[k]/dw[k];if(v>1e-8&&v<travel){travel=v;edge=k;}}
        if(!Number.isFinite(travel))break;
        const stop=length+travel>maxLength;travel=Math.min(travel,maxLength-length);
        const end=w.map((x,k)=>clamp(x+dw[k]*travel,0,1));
        out.push({triangle:ti,w:w.slice()},{triangle:ti,w:end});length+=travel;
        if(stop||edge<0||t.neighbors[edge]<0)break;
        const next=t.neighbors[edge],visits=(visited.get(next)||0)+1;visited.set(next,visits);if(visits>2)break;
        const q=fromWeights(t,end);ti=next;w=barycentric(q,r.triangles[ti]).map(x=>Math.max(.00001,x));
        const total=w.reduce((s,x)=>s+x,0);w=w.map(x=>x/total);previous=dir;
      }
      return out;
    }

    _buildTraces(r) {
      if(r.line){this.group.remove(r.line);r.line.geometry.dispose();r.line.material.dispose();r.line=null;}
      r.samples=[];r.traceCount=0;if(r.meta.connective||!r.area)return;
      const count=Math.round(clamp(Math.sqrt(r.area)*24*this.options.density,4,36*this.options.density));
      const spacing=Math.sqrt(r.area/count)*.40,seeds=[];let accumulated=0,target=r.area/(count*2),candidate=0;
      const maxLength=clamp(Math.sqrt(r.area)*.90,.045,1.0);
      for(let ti=0;ti<r.triangles.length&&seeds.length<count;ti++) {
        const t=r.triangles[ti];accumulated+=t.area;if(accumulated<target)continue;target+=r.area/(count*2);candidate++;
        if(t.area<1e-12||seeds.some(p=>distance2(p,t.center)<spacing*spacing))continue;
        const segments=[...this._walk(r,ti,1,maxLength),...this._walk(r,ti,-1,maxLength)];
        if(segments.length<4)continue;seeds.push(t.center);r.samples.push(...segments);r.traceCount++;
      }
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(r.samples.length*3),3));
      const material=new T.LineBasicMaterial({color:0xe3b1a0,transparent:true,opacity:.30,depthTest:true,depthWrite:false});
      const line=new T.LineSegments(geometry,material);line.name=r.mesh.name+' — approximate surface directions';
      line.userData={displayOnly:true,approximate:true};line.raycast=()=>{};line.frustumCulled=false;line.renderOrder=2;
      r.line=line;this.group.add(line);
    }

    styleMesh(mesh,a=0) {
      const r=this.records.get(mesh.uuid);if(!r)return;
      const v=this.viewer,u=mesh.userData,selected=(!!u.id&&(this.selectedIds.has(u.id)||v.selected===u.id))||v.referenceSelectedName===mesh.name;
      const grouped=v.highlightGroup?.size&&v._inHighlight(mesh),relaxed=v.relaxedGroup?.has(u.id);
      const c=new T.Color(r.meta.connective?0xd4c5ad:r.meta.layer==='deep'?0xaa554b:0xb96959);
      if(selected)c.lerp(new T.Color(0x88b68d),.82);
      else if(grouped)c.lerp(new T.Color(0x63aca0),.72);
      else if(relaxed)c.lerp(new T.Color(0x8b9caa),.32);
      else if(a>0)c.lerp(new T.Color(0xba493e),a*.23);
      mesh.material.color.copy(c);mesh.material.roughness=.82;mesh.material.metalness=0;
      mesh.material.emissive.setHex(selected?0x173b24:0x000000);mesh.material.emissiveIntensity=selected?.12:0;
      const contextual=(v.highlightGroup?.size||this.selectedIds.size)&&!grouped&&!selected;
      const opacity=v.layers.muscles.opacity*(contextual?this.options.contextOpacity:1);
      const transparent=opacity<.995;if(mesh.material.transparent!==transparent){mesh.material.transparent=transparent;mesh.material.needsUpdate=true;}
      mesh.material.opacity=opacity;mesh.material.depthWrite=!transparent;mesh.renderOrder=0;
      if(r.line){r.line.material.color.setHex(selected?0xd6e6b9:0xe7b9a5);r.line.material.opacity=(.12+.29*this.options.contrast)*(transparent?opacity:1);}
    }

    _setDepthFlags() {
      const depth=this.options.depth;
      for(const r of this.records.values())r.mesh.userData.displayHidden=depth!=='all'&&(depth==='neck'?r.meta.region!=='neck':r.meta.layer!==depth);
    }
    updateVisibility() {
      if(this.disposed)return;this._ensureRecords();this._setDepthFlags();
      const v=this.viewer;
      this.group.visible=this.options.fibers&&v.layers.muscles.visible&&v.layers.fibers?.visible!==false;
      // Replace the older detached attachment-axis ticks with surface traces.
      if(v.fiberGroup)v.fiberGroup.visible=false;
      for(const r of this.records.values()) {
        if(r.mesh.userData.displayHidden)r.mesh.visible=false;
        if(r.line){r.line.visible=r.mesh.visible&&!r.mesh.userData.displayHidden&&r.mesh.material.opacity>.12;r.line.position.copy(r.mesh.position);}
      }
      // Readability default: opaque muscles with a restrained bone backdrop.
      for(const mesh of v.bones) {
        const opacity=Math.min(v.layers.bones.opacity,this.options.boneOpacity);
        if(v.isolation||v.isolationGroup?.size)continue;
        const transparent=opacity<.995;if(mesh.material.transparent!==transparent){mesh.material.transparent=transparent;mesh.material.needsUpdate=true;}
        mesh.material.opacity=opacity;mesh.material.depthWrite=!transparent;
      }
    }
    updateGeometry() {
      if(this.disposed)return;
      if(this.viewer.fiberGroup)this.viewer.fiberGroup.visible=false;
      for(const r of this.records.values()) {
        if(!r.line)continue;
        r.line.visible=this.options.fibers&&r.mesh.visible&&!r.mesh.userData.displayHidden;
        if(!r.line.visible)continue;
        const p=r.mesh.geometry.attributes.position.array,n=r.mesh.geometry.attributes.normal?.array,out=r.line.geometry.attributes.position.array;
        for(let k=0;k<r.samples.length;k++) {
          const sample=r.samples[k],ids=r.triangles[sample.triangle].ids,w=sample.w;
          for(let axis=0;axis<3;axis++) {
            let value=0,normal=0;for(let j=0;j<3;j++){value+=p[ids[j]*3+axis]*w[j];if(n)normal+=n[ids[j]*3+axis]*w[j];}
            out[k*3+axis]=value+normal*.0011;
          }
        }
        r.line.geometry.attributes.position.needsUpdate=true;r.line.position.copy(r.mesh.position);
      }
    }
    dispose() {
      if(this.disposed)return;this.disposed=true;
      for(const r of this.records.values()) {
        if(r.line){r.line.geometry.dispose();r.line.material.dispose();}
        if(r.previousCompile){r.mesh.material.onBeforeCompile=r.previousCompile;r.mesh.material.customProgramCacheKey=r.previousCacheKey;r.mesh.material.needsUpdate=true;}
        r.mesh.geometry.deleteAttribute('mdFiberCoord');delete r.mesh.userData.displayHidden;
      }
      this.viewer.model.remove(this.group);if(this.viewer.displayPlugin===this)this.viewer.displayPlugin=null;this.records.clear();
    }
  }
  global.MuscleDisplay=MuscleDisplay;
})(window);
