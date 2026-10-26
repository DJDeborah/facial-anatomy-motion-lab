/* Local kinematic correspondence. No constitutive law, force solve or anatomical
 * skin reconstruction is implied. A fixed neutral offset plus a convex weighted
 * sum of actual source-vertex displacements drives every registered target. */
(function(global){
  'use strict';
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  class MuscleSkinBinding {
    constructor(sourceMeshes,options={}) {
      this.options={cellSize:.14,radius:.48,neighbors:12,perSource:4,sampleSpacing:.035,...options};
      this.sources=sourceMeshes.map((mesh,index)=>({mesh,index,id:mesh.userData.id||(/mandible/i.test(mesh.name)?'joint:jaw':'context'),name:mesh.name,side:mesh.userData.side||'midline',base:mesh.userData.base||new Float32Array(mesh.geometry.attributes.position.array)}));
      this.hash=new Map();this.targets=[];this.samples=0;
      const cell=this.options.cellSize,spacing=this.options.sampleSpacing,all=[];
      for(const source of this.sources) {
        const seen=new Set(),p=source.base;
        for(let vertex=0;vertex<p.length/3;vertex++) {
          const i=vertex*3,x=p[i],y=p[i+1],z=p[i+2],voxel=[Math.round(x/spacing),Math.round(y/spacing),Math.round(z/spacing)].join(',');
          if(seen.has(voxel))continue;seen.add(voxel);
          const key=[Math.floor(x/cell),Math.floor(y/cell),Math.floor(z/cell)].join(',');
          if(!this.hash.has(key))this.hash.set(key,[]);
          const sample={source:source.index,vertex,x,y,z};this.hash.get(key).push(sample);all.push(sample);this.samples++;
        }
      }
      const build=(points,depth=0)=>{if(!points.length)return null;const axis=['x','y','z'][depth%3];points.sort((a,b)=>a[axis]-b[axis]);const middle=points.length>>1;return {sample:points[middle],axis,left:build(points.slice(0,middle),depth+1),right:build(points.slice(middle+1),depth+1)};};
      this.tree=build(all);
    }
    _neighbors(x,y,z,options={}) {
      const radius=options.radius||this.options.radius,r2=radius*radius;
      const chosen=[],limit=options.neighbors||this.options.neighbors,perSource=options.perSource||this.options.perSource,point={x,y,z};
      // A balanced spatial tree avoids scanning hundreds of empty hash cells for
      // every target. Source caps retain contributions from neighboring tissues.
      const visit=node=>{
        if(!node)return;
        const sample=node.sample,axis=node.axis,difference=point[axis]-sample[axis];
        const near=difference<0?node.left:node.right,far=difference<0?node.right:node.left;visit(near);
        const dx=sample.x-x,dy=sample.y-y,dz=sample.z-z,d2=dx*dx+dy*dy+dz*dz;
        if(d2<r2&&(!options.filter||options.filter(this.sources[sample.source],x,y,z))&&(!options.sampleFilter||options.sampleFilter(this.sources[sample.source],sample,x,y,z))) {
          const same=[];for(let i=0;i<chosen.length;i++)if(chosen[i].source===sample.source)same.push(i);
          if(same.length<perSource||d2<chosen[same[same.length-1]].d2) {
            if(same.length>=perSource)chosen.splice(same[same.length-1],1);
            chosen.push({...sample,d2});chosen.sort((a,b)=>a.d2-b.d2);if(chosen.length>limit)chosen.pop();
          }
        }
        const bound=chosen.length===limit?Math.min(r2,chosen[chosen.length-1].d2):r2;
        if(difference*difference<bound)visit(far);
      };visit(this.tree);
      let total=0;
      for(const sample of chosen){const distance=Math.sqrt(sample.d2),fade=Math.pow(Math.max(0,1-distance/radius),2);sample.weight=fade/Math.pow(sample.d2+.0064,1.5)*(options.weightScale?options.weightScale(this.sources[sample.source],x,y,z):1);total+=sample.weight;}
      if(total<=0)return [];
      for(const sample of chosen)sample.weight/=total;
      return chosen;
    }
    bindMesh(mesh,options={}) {
      const base=mesh.userData.base||new Float32Array(mesh.geometry.attributes.position.array),count=base.length/3,neighbors=options.neighbors||this.options.neighbors;
      const source=new Int16Array(count*neighbors);source.fill(-1);
      const vertex=new Int32Array(count*neighbors),weights=new Float32Array(count*neighbors),offset=new Float64Array(base.length),distances=new Float32Array(count);
      let bound=0;
      for(let i=0;i<count;i++) {
        const x=base[i*3],y=base[i*3+1],z=base[i*3+2],near=this._neighbors(x,y,z,options);
        offset[i*3]=x;offset[i*3+1]=y;offset[i*3+2]=z;distances[i]=near.length?Math.sqrt(near[0].d2):-1;
        if(near.length)bound++;
        for(let k=0;k<near.length;k++) {
          const sample=near[k],n=i*neighbors+k;source[n]=sample.source;vertex[n]=sample.vertex;weights[n]=sample.weight;
          // Offset uses the stored float weight, making neutral reconstruction exact.
          const w=weights[n];offset[i*3]-=w*sample.x;offset[i*3+1]-=w*sample.y;offset[i*3+2]-=w*sample.z;
        }
      }
      const target={mesh,base,source,vertex,weights,offset,distances,neighbors,count,bound,options};
      this.targets.push(target);return target;
    }
    bindCorrespondences(mesh,records) {
      const base=mesh.userData.base||new Float32Array(mesh.geometry.attributes.position.array),count=base.length/3,neighbors=Math.max(1,...records.map(r=>r?.length||0));
      const source=new Int16Array(count*neighbors);source.fill(-1);
      const vertex=new Int32Array(count*neighbors),weights=new Float32Array(count*neighbors),offset=new Float64Array(base),distances=new Float32Array(count);distances.fill(-1);let bound=0;
      for(let i=0;i<count;i++) {
        const refs=records[i]||[];if(refs.length)bound++;let nearest=Infinity;
        for(let k=0;k<refs.length;k++) {
          const ref=refs[k],slot=i*neighbors+k,p=this.sources[ref.source].base,n=ref.vertex*3;source[slot]=ref.source;vertex[slot]=ref.vertex;weights[slot]=ref.weight;
          for(let axis=0;axis<3;axis++)offset[i*3+axis]-=weights[slot]*p[n+axis];
          nearest=Math.min(nearest,Math.hypot(base[i*3]-p[n],base[i*3+1]-p[n+1],base[i*3+2]-p[n+2]));
        }
        if(refs.length)distances[i]=nearest;
      }
      const target={mesh,base,source,vertex,weights,offset,distances,neighbors,count,bound,options:{explicitBarycentric:true}};this.targets.push(target);return target;
    }
    delta(target,index,onlyId) {
      let x=0,y=0,z=0;
      for(let k=0;k<target.neighbors;k++) {
        const slot=index*target.neighbors+k,sourceId=target.source[slot];if(sourceId<0)continue;
        const source=this.sources[sourceId];if(onlyId&&source.id!==onlyId)continue;
        const p=source.mesh.geometry.attributes.position.array,b=source.base,vertex=target.vertex[slot]*3,w=target.weights[slot];
        x+=w*(p[vertex]-b[vertex]);y+=w*(p[vertex+1]-b[vertex+1]);z+=w*(p[vertex+2]-b[vertex+2]);
      }
      return [x,y,z];
    }
    update({additive=false,recomputeNormals=true}={}) {
      for(const target of this.targets) {
        const p=target.mesh.geometry.attributes.position.array,b=target.base;
        for(let i=0;i<target.count;i++) {
          const d=this.delta(target,i),n=i*3;
          if(additive){p[n]+=d[0];p[n+1]+=d[1];p[n+2]+=d[2];}
          else{p[n]=b[n]+d[0];p[n+1]=b[n+1]+d[1];p[n+2]=b[n+2]+d[2];}
        }
        target.mesh.geometry.attributes.position.needsUpdate=true;
        if(recomputeNormals)target.mesh.geometry.computeVertexNormals();
      }
    }
    samplePoint(point,options={}) {
      const near=this._neighbors(point[0],point[1],point[2],options),out=point.slice();
      for(const sample of near) {
        const source=this.sources[sample.source],p=source.mesh.geometry.attributes.position.array,b=source.base,n=sample.vertex*3;
        for(let k=0;k<3;k++)out[k]+=sample.weight*(p[n+k]-b[n+k]);
      }
      return out;
    }
    closestNeutral(point,options={}) {
      const near=this._neighbors(point[0],point[1],point[2],options);if(!near.length)return null;
      const p=[0,0,0];for(const sample of near){p[0]+=sample.weight*sample.x;p[1]+=sample.weight*sample.y;p[2]+=sample.weight*sample.z;}
      return {point:p,distance:Math.sqrt(near[0].d2),samples:near};
    }
    correspondence(targetIndex,vertexIndex) {
      const target=this.targets[targetIndex];if(!target||vertexIndex<0||vertexIndex>=target.count)return null;
      const entries=[],n=vertexIndex*3,p=target.mesh.geometry.attributes.position.array,delta=this.delta(target,vertexIndex);
      for(let k=0;k<target.neighbors;k++) {
        const slot=vertexIndex*target.neighbors+k,sourceIndex=target.source[slot];if(sourceIndex<0)continue;
        const source=this.sources[sourceIndex],v=target.vertex[slot],index=v*3,current=source.mesh.geometry.attributes.position.array;
        entries.push({muscleId:source.id,sourceMesh:source.name,side:source.side,vertexIndex:v,weight:target.weights[slot],neutral:[...source.base.slice(index,index+3)],current:[...current.slice(index,index+3)]});
      }
      return {targetMesh:target.mesh.name,vertexIndex,bound:entries.length>0,neutral:[...target.base.slice(n,n+3)],current:[...p.slice(n,n+3)],offset:[...target.offset.slice(n,n+3)],sourceDistance:target.distances[vertexIndex],predictedDelta:delta,reconstructionError:Math.hypot(p[n]-target.base[n]-delta[0],p[n+1]-target.base[n+1]-delta[1],p[n+2]-target.base[n+2]-delta[2]),sources:entries};
    }
    diagnostics() {
      let total=0,bound=0,sumDistance=0,maxDistance=0,neutralError=0,reconstructionError=0,weightError=0,finite=true;
      const regions={face:{vertices:0,bound:0},neck:{vertices:0,bound:0},shoulderBase:{vertices:0,bound:0}},perMuscle={};
      for(const target of this.targets) {
        const p=target.mesh.geometry.attributes.position.array;
        for(let i=0;i<target.count;i++) {
          const n=i*3,y=target.base[n+1],region=regions[y>.15?'face':y>=-1.25?'neck':'shoulderBase'];region.vertices++;total++;
          if(target.distances[i]>=0){region.bound++;bound++;sumDistance+=target.distances[i];maxDistance=Math.max(maxDistance,target.distances[i]);}
          let sum=0,q=[target.offset[n],target.offset[n+1],target.offset[n+2]];
          for(let k=0;k<target.neighbors;k++) {
            const slot=i*target.neighbors+k,s=target.source[slot];if(s<0)continue;
            const source=this.sources[s],v=target.vertex[slot]*3,w=target.weights[slot];sum+=w;for(let axis=0;axis<3;axis++)q[axis]+=w*source.base[v+axis];
            const key=source.id,entry=perMuscle[key]||(perMuscle[key]={weightSum:0,correspondences:0});entry.weightSum+=w;entry.correspondences++;
          }
          if(sum>0)weightError=Math.max(weightError,Math.abs(1-sum));
          neutralError=Math.max(neutralError,Math.hypot(q[0]-target.base[n],q[1]-target.base[n+1],q[2]-target.base[n+2]));
          const d=this.delta(target,i),error=Math.hypot(p[n]-target.base[n]-d[0],p[n+1]-target.base[n+1]-d[1],p[n+2]-target.base[n+2]-d[2]);
          if(!Number.isFinite(error))finite=false;else reconstructionError=Math.max(reconstructionError,error);
        }
      }
      for(const region of Object.values(regions))region.coverage=region.vertices?region.bound/region.vertices:0;
      return {method:'fixed neutral offsets + convex local source-vertex displacement transfer',physiologicalValidation:false,vertices:total,boundVertices:bound,coverage:total?bound/total:0,unboundPolicy:'remain at registered neutral position',meanNearestSourceDistance:bound?sumDistance/bound:0,maxNearestSourceDistance:maxDistance,neutralReconstructionError:neutralError,currentReconstructionError:reconstructionError,maxWeightSumError:weightError,finite,regions,perMuscle,sourceMeshes:this.sources.length,sampledSourceVertices:this.samples};
    }
    contribution(id,{includeVectors=false}={}) {
      let affected=0,total=0,max=0;const sum=[0,0,0],vectors=[];
      this.targets.forEach((target,targetIndex)=>{for(let i=0;i<target.count;i++) {
        let weight=0;for(let k=0;k<target.neighbors;k++){const slot=i*target.neighbors+k,s=target.source[slot];if(s>=0&&this.sources[s].id===id)weight+=target.weights[slot];}
        if(weight<1e-8)continue;affected++;const d=this.delta(target,i,id),length=Math.hypot(...d);total+=length;max=Math.max(max,length);for(let k=0;k<3;k++)sum[k]+=d[k];
        if(includeVectors)vectors.push({targetIndex,vertexIndex:i,weight,delta:d});
      }});
      return {muscleId:id,affectedVertices:affected,meanContributionMagnitude:affected?total/affected:0,maxContributionMagnitude:max,meanContribution:sum.map(x=>affected?x/affected:0),interpretation:'direct weighted contribution from this source; downstream passive oral transfer is reported under orbicularis_oris',...(includeVectors?{vectors}:{})};
    }
  }
  global.MuscleSkinBinding=MuscleSkinBinding;
})(typeof window!=='undefined'?window:globalThis);
