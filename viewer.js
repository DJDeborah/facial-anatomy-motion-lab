/* Facial Atlas viewer. Uses the bundled Three.js UMD build; no third-party CDN dependencies.
 * Anatomy surfaces: Écorché / BodyParts3D / Z-Anatomy (see assets attribution).
 * Motion and skin are authored educational approximations, not a validated solver.
 */
(function (global) {
  'use strict';
  const T = global.THREE;
  if (!T) throw new Error('Load vendor/three.min.js before viewer.js');
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, Number(v) || 0));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const vec = a => new T.Vector3(a[0], a[1], a[2]);
  const IDS = [
    'frontalis', 'occipitalis', 'orbicularis_oculi', 'corrugator_supercilii',
    'depressor_supercilii', 'procerus', 'nasalis', 'dilator_naris',
    'compressor_naris', 'depressor_septi_nasi', 'levator_labii_superioris_alaeque_nasi',
    'levator_labii_superioris', 'zygomaticus_minor', 'zygomaticus_major',
    'levator_anguli_oris', 'risorius', 'buccinator', 'orbicularis_oris',
    'depressor_anguli_oris', 'depressor_labii_inferioris', 'mentalis', 'platysma',
    'masseter', 'temporalis', 'sternocleidomastoid', 'levator_palpebrae_superioris',
    'superior_tarsal', 'medial_pterygoid', 'lateral_pterygoid'
  ];
  const PALETTE = { bone: 0xe7deca, cartilage: 0xb0c1c2, muscle: 0xac5249, deep: 0x954c47, selected: 0x17a592, active: 0xda6352, skin: 0xd8b49b };
  // Explicit atlas allow-list: an anatomical description is not automatically a
  // working action preview. Joint mechanics and unimplemented subdivisions remain theory.
  const PREVIEW_MODES = {
    frontalis:['medial_raise','lateral_raise'],
    corrugator_supercilii:['brow_medial_lower'],procerus:['glabella_lower'],
    depressor_supercilii:['medial_brow_lower'],orbicularis_oculi:['orbital_cheek_raise','palpebral_tighten'],
    levator_palpebrae_superioris:['upper_lid_raise'],superior_tarsal:['autonomic_tone'],
    nasalis:['alar_dilate','transverse_compress'],dilator_naris:['alar_rim_dilate'],
    depressor_septi_nasi:['septum_tip_lower'],compressor_naris:['nostril_compress'],
    levator_labii_superioris:['upper_lip_raise'],zygomaticus_minor:['upper_lip_oblique_raise'],
    zygomaticus_major:['corner_oblique_raise'],levator_anguli_oris:['corner_raise'],
    risorius:['corner_lateral_retract'],buccinator:['cheek_compress'],
    orbicularis_oris:['incisive_pucker','lip_tightener','peripheral_funnel'],
    depressor_anguli_oris:['corner_lower'],depressor_labii_inferioris:['lower_lip_lower'],mentalis:['chin_lower_lip_raise']
  };
  const ANCHORS = {
    frontalis: [[.30,1.77,.82],[.28,1.09,1.01]],
    occipitalis: [[.31,1.55,-.78],[.30,1.02,-.83]],
    corrugator_supercilii: [[.08,1.15,1.00],[.34,1.19,.96]],
    depressor_supercilii: [[.10,1.00,.96],[.16,1.20,1.04]],
    procerus: [[.06,.94,1.09],[.06,1.18,1.02]],
    nasalis: [[.13,.70,1.13],[.03,.89,1.16]],
    dilator_naris: [[.18,.57,1.10],[.11,.65,1.28]],
    compressor_naris: [[.15,.69,1.11],[.025,.77,1.22]],
    depressor_septi_nasi: [[.035,.42,1.09],[.02,.59,1.26]],
    levator_labii_superioris_alaeque_nasi: [[.10,1.05,1.07],[.13,.43,1.11]],
    levator_labii_superioris: [[.23,.83,1.00],[.18,.43,1.09]],
    zygomaticus_minor: [[.43,.79,.86],[.20,.44,1.07]],
    zygomaticus_major: [[.54,.80,.68],[.29,.33,1.00]],
    levator_anguli_oris: [[.23,.68,.95],[.28,.34,1.03]],
    risorius: [[.62,.35,.64],[.29,.33,1.04]],
    buccinator: [[.54,.39,.59],[.27,.34,.96]],
    depressor_anguli_oris: [[.39,.04,.73],[.28,.34,1.01]],
    depressor_labii_inferioris: [[.22,.045,.88],[.13,.27,1.09]],
    mentalis: [[.10,.26,1.00],[.10,.12,1.08]],
    platysma: [[.49,-1.50,.57],[.40,.08,.81]],
    masseter: [[.56,.80,.43],[.47,.12,.43]],
    temporalis: [[.65,1.57,.18],[.49,.51,.46]],
    sternocleidomastoid: [[.13,-1.16,.64],[.55,.73,-.12]],
    levator_palpebrae_superioris: [[.28,1.02,.44],[.30,1.05,.86]],
    superior_tarsal: [[.29,1.12,.80],[.30,1.02,.91]],
    medial_pterygoid: [[.31,.70,.44],[.41,.17,.34]],
    lateral_pterygoid: [[.20,.65,.55],[.47,.65,.27]]
  };
  function muscleId(name) {
    const n = name.toLowerCase();
    if (n.includes('orbicularis oculi')) return 'orbicularis_oculi';
    if (n.includes('masseter')) return 'masseter';
    if (n.includes('lateral pterygoid')) return 'lateral_pterygoid';
    for (const id of IDS) if (n.includes(id.replace(/_/g, ' '))) return id;
    return null;
  }
  function interpProfile(y, profile, column) {
    for (let i = 1; i < profile.length; i++) {
      if (y <= profile[i][0]) {
        const a = profile[i-1], b = profile[i];
        return lerp(a[column], b[column], smooth((y-a[0])/(b[0]-a[0])));
      }
    }
    return profile[profile.length-1][column];
  }
  function surfaceMesh(positions, indices, material) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setIndex(indices); g.computeVertexNormals();
    return new T.Mesh(g, material);
  }

  class AnatomyViewer {
    constructor(container, options = {}) {
      this.container = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.container) throw new Error('AnatomyViewer: container is required');
      this.options = options;
      this.meshes = []; this.muscles = []; this.bones = []; this.skinMeshes = []; this.features = [];
      this.selected = null; this.referenceSelectedName = null; this.isolation = null; this.isolationGroup = null; this.isolationOptions = {}; this.hidden = new Set();
      this.highlightGroup = new Set(); this.relaxedGroup = new Set(); this.highlightSide = 'both';
      this.actionContext = null; this.actionIndex = new Map(); this.actionModes = {left:{},right:{}};
      this.analysisOptions = {ghost:false,arrows:false,gain:1}; this.ghostCache = new Map(); this.motionCache = new Map();
      this.analysisDiagnostics = {arrowCount:0,ghostMeshes:0,arrowGain:1};
      this.activation = { left: {}, right: {} }; this.current = { left: {}, right: {} };
      IDS.forEach(id => { this.activation.left[id] = this.activation.right[id] = this.current.left[id] = this.current.right[id] = 0; });
      this.layers = { skin: {visible:false, opacity:.28}, bones:{visible:true,opacity:1}, muscles:{visible:true,opacity:1}, fibers:{visible:true,opacity:1} };
      this.explode = 0; this.jawTarget = 0; this.jaw = 0; this.dirty = true; this.expressionMode = null;
      this.orbit = { yaw: -.14, pitch: .045, distance: 7.9, target: new T.Vector3(0,.10,.08) };
      this.orbitTarget = {...this.orbit};
      this.drag = null; this.ready = false; this.disposed = false; this.lastTime = 0;
      this._buildScene(); this._bindInteraction();
      this._frame = this._frame.bind(this);
      this._raf = requestAnimationFrame(this._frame);
    }

    _buildScene() {
      this.scene = new T.Scene();
      this.scene.background = new T.Color(0xf3f5f3);
      this.scene.fog = new T.Fog(0xf3f5f3, 16, 26);
      this.camera = new T.PerspectiveCamera(37,1,.05,70);
      this.renderer = new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.3;
      this.renderer.setClearColor(0xf3f5f3);
      this.renderer.domElement.setAttribute('aria-label','Interactive 3D head and neck anatomy; drag to rotate, scroll to zoom, click a muscle to select.');
      this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
      this.renderer.domElement.tabIndex = 0;
      this.container.appendChild(this.renderer.domElement);
      this.scene.add(new T.HemisphereLight(0xffffff,0x9da69d,2.5));
      const key = new T.DirectionalLight(0xfff7e8,3.1); key.position.set(-3,5,6); this.scene.add(key);
      const fill = new T.DirectionalLight(0xdce8ed,1.8); fill.position.set(4,2,3); this.scene.add(fill);
      const rim = new T.DirectionalLight(0xffffff,2.3); rim.position.set(1,4,-4); this.scene.add(rim);
      this.model = new T.Group(); this.scene.add(this.model);
      this.boneGroup = new T.Group(); this.muscleGroup = new T.Group(); this.skinGroup = new T.Group();
      this.eyeGroup = new T.Group(); this.fiberGroup = new T.Group();
      this.analysisGroup = new T.Group(); this.ghostGroup = new T.Group(); this.arrowGroup = new T.Group();
      this.analysisGroup.add(this.ghostGroup,this.arrowGroup);
      this.model.add(this.boneGroup,this.muscleGroup,this.skinGroup,this.eyeGroup,this.fiberGroup,this.analysisGroup);
      const floor = new T.Mesh(new T.CircleGeometry(2.3,100),new T.MeshBasicMaterial({color:0xe9eeea,transparent:true,opacity:.7,depthWrite:false}));
      floor.rotation.x = -Math.PI/2; floor.position.y = -2.09; this.scene.add(floor);
      const ring = new T.Mesh(new T.RingGeometry(1.97,1.985,96),new T.MeshBasicMaterial({color:0xb8c5be,transparent:true,opacity:.35,side:T.DoubleSide}));
      ring.rotation.x = -Math.PI/2; ring.position.y = -2.085; this.scene.add(ring);
      this.raycaster = new T.Raycaster(); this.pointer = new T.Vector2();
      this.resize();
      this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this.container);
    }

    async init() {
      const url = this.options.assetUrl || 'assets/source-models/head-neck.json';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Anatomy asset could not load: '+response.status+' '+url);
      const data = await response.json();
      if (!Array.isArray(data.meshes)) throw new Error('Invalid anatomy mesh manifest');
      for (const record of data.meshes) this._addSourceMesh(record);
      this._addSupplements();
      this._createSkin(); this._createFeatures();
      if(!global.MuscleSkinBinding)throw new Error('Load skin-binding.js before initializing the viewer');
      this._createSkinBinding();
      this._refreshVisibility(); this.ready = true; this.dirty = true;
      this.options.onReady?.(this.getState());
      return this;
    }

    _addSourceMesh(record) {
      const g = new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(record.positions,3));
      if (record.normals?.length) g.setAttribute('normal',new T.Float32BufferAttribute(record.normals,3));
      if (record.indices?.length) g.setIndex(record.indices);
      if (!record.normals?.length) g.computeVertexNormals();
      const id = muscleId(record.name);
      const isMuscle = /muscle/.test(record.layer);
      const isEye = /sclera|cornea/.test(record.name.toLowerCase());
      const isEar = /external ear/i.test(record.name);
      const color = isEye ? 0xf2f0e9 : isEar ? 0xc9a38b : isMuscle ? (record.layer === 'deep muscles' ? PALETTE.deep : PALETTE.muscle) : record.tissue === 'cartilage' ? PALETTE.cartilage : PALETTE.bone;
      const mat = new T.MeshStandardMaterial({color,roughness:isEye?.35:.72,metalness:0,side:T.DoubleSide});
      if(/cornea/i.test(record.name)){mat.transparent=true;mat.opacity=.16;mat.depthWrite=false;mat.roughness=.12;}
      // Baked AO / tendons are kept, but tint is deliberately restrained for readability.
      if (record.colors?.length && !isEye && !isEar) {
        const colors = new Float32Array(record.colors.length);
        for(let i=0;i<colors.length;i+=3) {
          const luminance = (record.colors[i]+record.colors[i+1]+record.colors[i+2])/3;
          const value = .52 + .48 * luminance;
          colors[i]=colors[i+1]=colors[i+2]=value;
        }
        g.setAttribute('color',new T.BufferAttribute(colors,3)); mat.vertexColors = true;
      }
      const mesh = new T.Mesh(g,mat); mesh.name = record.name;
      mesh.userData = {id,side:record.side || 'midline',source:'open',anatomySource:record.source,layer:isMuscle?'muscles':'bones',sourceLayer:record.layer,tissue:record.tissue,recordName:record.name,base:new Float32Array(record.positions),baseColor:color,isEye,isEar};
      g.computeBoundingBox(); mesh.userData.bounds = g.boundingBox.clone();
      if (isMuscle) { this.muscles.push(mesh); this.muscleGroup.add(mesh); }
      else if (isEye) { this.eyeGroup.add(mesh); }
      else { this.bones.push(mesh); this.boneGroup.add(mesh); }
      this.meshes.push(mesh);
      if (id) this._prepareDeformation(mesh);
    }

    _prepareDeformation(mesh) {
      const id = mesh.userData.id, side = mesh.userData.side;
      const sign = side === 'right' ? -1 : 1;
      const bounds = mesh.userData.bounds;
      const pair = ANCHORS[id];
      if (pair) {
        mesh.userData.origin = vec([pair[0][0]*sign,pair[0][1],pair[0][2]]);
        mesh.userData.insertion = vec([pair[1][0]*sign,pair[1][1],pair[1][2]]);
      } else {
        mesh.userData.origin = new T.Vector3(sign*.3,1,.85);
        mesh.userData.insertion = bounds.getCenter(new T.Vector3());
      }
      mesh.userData.radial = bounds.getCenter(new T.Vector3());
      mesh.userData.radial.y = 0;
      if (mesh.userData.radial.length()<.01) mesh.userData.radial.set(sign*.2,0,.5);
      mesh.userData.radial.normalize();
    }

    _addSupplements() {
      const specs = {
        occipitalis:{width:.18}, depressor_supercilii:{width:.035},
        levator_labii_superioris_alaeque_nasi:{width:.027}, levator_anguli_oris:{width:.055},
        buccinator:{width:.14}, platysma:{width:.28},
        levator_palpebrae_superioris:{width:.045}, superior_tarsal:{width:.025},
        dilator_naris:{width:.025}, depressor_septi_nasi:{width:.022}, compressor_naris:{width:.024}
      };
      for(const [id,spec] of Object.entries(specs)) {
        if(this.muscles.some(m=>m.userData.id===id)) continue;
        for(const side of ['left','right']) {
          const sign = side==='left'?1:-1;
          const a=ANCHORS[id][0], b=ANCHORS[id][1];
          const start=vec([sign*a[0],a[1],a[2]]), end=vec([sign*b[0],b[1],b[2]]);
          const mid=start.clone().lerp(end,.5); mid.z += id==='platysma'?.11:.025;
          const curve = new T.CatmullRomCurve3([start,mid,end]);
          const positions=[],indices=[], segments=25, around=10;
          for(let j=0;j<=segments;j++) {
            const t=j/segments, p=curve.getPoint(t), tangent=curve.getTangent(t).normalize();
            const normal=new T.Vector3(0,0,1); if(Math.abs(tangent.z)>.8) normal.set(0,1,0);
            const widthAxis = new T.Vector3().crossVectors(tangent,normal).normalize();
            const depthAxis = new T.Vector3().crossVectors(widthAxis,tangent).normalize();
            const width=spec.width*(.32+.68*Math.pow(Math.sin(Math.PI*t),.55));
            for(let k=0;k<=around;k++) {
              const theta=k/around*Math.PI*2;
              const q=p.clone().addScaledVector(widthAxis,Math.cos(theta)*width).addScaledVector(depthAxis,Math.sin(theta)*Math.min(width*.18,.025));
              positions.push(q.x,q.y,q.z);
              if(j<segments&&k<around) { const n=j*(around+1)+k; indices.push(n,n+1,n+around+1,n+1,n+around+2,n+around+1); }
            }
          }
          const mesh=surfaceMesh(positions,indices,new T.MeshStandardMaterial({color:0xbc695d,roughness:.8,side:T.DoubleSide}));
          mesh.name=side+' '+id.replace(/_/g,' ')+' (schematic)';
          mesh.geometry.computeBoundingBox();
          mesh.userData={id,side,source:'schematic',anatomySource:'Authored schematic',layer:'muscles',base:new Float32Array(positions),baseColor:0xbc695d,bounds:mesh.geometry.boundingBox.clone()};
          this._prepareDeformation(mesh); this.muscles.push(mesh); this.meshes.push(mesh); this.muscleGroup.add(mesh);
        }
      }
    }

    _createSkin() {
      const material = new T.MeshStandardMaterial({color:PALETTE.skin,roughness:.74,side:T.FrontSide,transparent:true,opacity:.28,depthWrite:false,depthTest:true});
      const profile = [
        [-.30,.45,.74,-.52],[-.08,.36,.89,-.20],[.03,.40,1.02,-.02],[.25,.53,1.09,-.23],[.48,.64,1.07,-.44],
        [.75,.72,1.03,-.65],[1.02,.74,1.00,-.78],[1.30,.74,1.08,-.86],[1.58,.71,1.04,-.89],
        [1.82,.64,.90,-.80],[2.03,.45,.61,-.58],[2.17,.12,.20,-.20],[2.19,.006,.02,-.02]
      ];
      const positions=[],indices=[], rows=108, columns=144;
      for(let j=0;j<=rows;j++) {
        const y=lerp(-.30,2.19,j/rows), r=interpProfile(y,profile,1), front=interpProfile(y,profile,2), back=interpProfile(y,profile,3);
        for(let k=0;k<=columns;k++) {
          const angle=k/columns*Math.PI*2, x=Math.sin(angle)*r, c=Math.cos(angle), fw=Math.pow(Math.max(c,0),8);
          let z=(front+back)/2+(front-back)/2*c;
          // Surface offsets form a continuous nose bridge, cheek and orbital depression.
          z+=fw*(.255*Math.exp(-Math.pow(x/.105,2)-Math.pow((y-.65)/.17,2))+.115*Math.exp(-Math.pow(x/.095,2)-Math.pow((y-.88)/.29,2)));
          z-=fw*.13*(Math.exp(-Math.pow((x-.30)/.18,2)-Math.pow((y-.96)/.13,2))+Math.exp(-Math.pow((x+.30)/.18,2)-Math.pow((y-.96)/.13,2)));
          positions.push(x,y,z);
          if(j<rows&&k<columns) {
            const ny=y+2.49/rows/2, na=angle+Math.PI/columns, nx=Math.sin(na)*interpProfile(ny,profile,1);
            const eyeHole = Math.cos(na)>.7 && (((nx-.30)/.143)**2+((ny-.962)/.068)**2<1 || ((nx+.30)/.143)**2+((ny-.962)/.068)**2<1);
            const mouthHole = Math.cos(na)>.8 && (nx/.245)**2+((ny-.343)/.033)**2<1;
            if(!eyeHole&&!mouthHole) { const n=j*(columns+1)+k; indices.push(n,n+1,n+columns+1,n+1,n+columns+2,n+columns+1); }
          }
        }
      }
      // Fit the authored shell outside the real surfaces. This is a smoothed
      // radial envelope, not reconstructed facial tissue or a patient's skin.
      const envelope=new Float32Array((rows+1)*columns);
      for(const mesh of this.meshes) {
        if(mesh.userData.isEar||mesh.userData.isEye)continue;
        const p=mesh.userData.base;
        for(let i=0;i<p.length;i+=3) {
          const y=p[i+1];if(y<-.30||y>2.19)continue;
          const center=(interpProfile(y,profile,2)+interpProfile(y,profile,3))/2;
          let angle=Math.atan2(p[i],p[i+2]-center);if(angle<0)angle+=Math.PI*2;
          const row=Math.min(rows,Math.max(0,Math.round((y+.30)/2.49*rows))),col=Math.round(angle/(Math.PI*2)*columns)%columns;
          const index=row*columns+col,r=Math.hypot(p[i],p[i+2]-center);
          envelope[index]=Math.max(envelope[index],r);
        }
      }
      const radii=new Float32Array(envelope.length),floors=new Float32Array(envelope.length);
      for(let j=0;j<=rows;j++)for(let k=0;k<columns;k++) {
        const n=(j*(columns+1)+k)*3,y=positions[n+1],center=(interpProfile(y,profile,2)+interpProfile(y,profile,3))/2;
        let radius=Math.hypot(positions[n],positions[n+2]-center),max=0;
        for(let dj=-2;dj<=2;dj++)for(let dk=-2;dk<=2;dk++) {
          const row=Math.max(0,Math.min(rows,j+dj)),col=(k+dk+columns)%columns;
          max=Math.max(max,envelope[row*columns+col]);
        }
        floors[j*columns+k]=max+.022;radii[j*columns+k]=Math.max(radius,max+.030);
      }
      for(let pass=0;pass<12;pass++) {
        const previous=radii.slice();
        for(let j=1;j<rows;j++)for(let k=0;k<columns;k++) {
          let sum=0;for(let dj=-1;dj<=1;dj++)for(let dk=-1;dk<=1;dk++)sum+=previous[(j+dj)*columns+(k+dk+columns)%columns];
          radii[j*columns+k]=sum/9;
        }
      }
      for(let j=0;j<=rows;j++)for(let k=0;k<=columns;k++) {
        const n=(j*(columns+1)+k)*3,y=positions[n+1],center=(interpProfile(y,profile,2)+interpProfile(y,profile,3))/2;
        const old=Math.hypot(positions[n],positions[n+2]-center),radius=radii[j*columns+k%columns]+.018;
        if(old>.001){
          const f=radius/old,c=(positions[n+2]-center)/old,keepX=smooth((c-.3)/.5);
          positions[n]*=lerp(f,1,keepX);
          positions[n+2]=center+Math.sign(c)*Math.sqrt(Math.max(.000001,radius*radius-positions[n]*positions[n]));
        }
      }
      const head = surfaceMesh(positions,indices,material); head.name='Registered authored skin envelope'; head.renderOrder=3;head.userData={base:new Float32Array(positions),skin:true,grid:{rows,columns}};
      this.skinGroup.add(head); this.skinMeshes.push(head);
      const neckProfile=[[-2.04,1.40,.58,-.75],[-1.65,1.40,.67,-.75],[-1.30,1.35,.75,-.68],[-.95,1.10,.73,-.68],[-.45,.55,.66,-.58],[.1,.46,.77,-.52],[.40,.45,.51,-.47]];
      const np=[],ni=[],nr=64,nc=100;
      for(let j=0;j<=nr;j++) {
        const y=lerp(-2.04,.40,j/nr),r=interpProfile(y,neckProfile,1),f=interpProfile(y,neckProfile,2),b=interpProfile(y,neckProfile,3);
        for(let k=0;k<=nc;k++) {
          const angle=k/nc*Math.PI*2; np.push(r*Math.sin(angle),y,(f+b)/2+(f-b)/2*Math.cos(angle));
          if(j<nr&&k<nc) { const n=j*(nc+1)+k; ni.push(n,n+1,n+nc+1,n+1,n+nc+2,n+nc+1); }
        }
      }
      const neckEnvelope=new Float32Array((nr+1)*nc);
      for(const mesh of this.meshes) {
        const p=mesh.userData.base;
        for(let i=0;i<p.length;i+=3) {
          const y=p[i+1];if(y< -2.04||y>.40)continue;
          const center=(interpProfile(y,neckProfile,2)+interpProfile(y,neckProfile,3))/2;
          let angle=Math.atan2(p[i],p[i+2]-center);if(angle<0)angle+=Math.PI*2;
          const row=Math.max(0,Math.min(nr,Math.round((y+2.04)/2.44*nr))),col=Math.round(angle/(Math.PI*2)*nc)%nc,index=row*nc+col;
          neckEnvelope[index]=Math.max(neckEnvelope[index],Math.hypot(p[i],p[i+2]-center));
        }
      }
      for(let j=0;j<=nr;j++)for(let k=0;k<=nc;k++) {
        const n=(j*(nc+1)+k)*3,y=np[n+1],center=(interpProfile(y,neckProfile,2)+interpProfile(y,neckProfile,3))/2;
        let maximum=0;for(let dj=-3;dj<=3;dj++)for(let dk=-3;dk<=3;dk++)maximum=Math.max(maximum,neckEnvelope[Math.max(0,Math.min(nr,j+dj))*nc+(k+dk+nc)%nc]);
        const radius=Math.hypot(np[n],np[n+2]-center),factor=Math.max(1,(maximum+.04)/radius);
        np[n]*=factor;np[n+2]=center+(np[n+2]-center)*factor;
      }
      // Smooth the envelope in its material coordinates to avoid voxel-band steps.
      for(let pass=0;pass<14;pass++) {
        const prior=np.slice();
        for(let j=1;j<nr;j++)for(let k=0;k<nc;k++)for(const axis of [0,2]) {
          let sum=0;for(let dj=-1;dj<=1;dj++)for(let dk=-1;dk<=1;dk++)sum+=prior[((j+dj)*(nc+1)+(k+dk+nc)%nc)*3+axis];
          np[(j*(nc+1)+k)*3+axis]=sum/9;
        }
        for(let j=0;j<=nr;j++)for(const axis of [0,2])np[(j*(nc+1)+nc)*3+axis]=np[j*(nc+1)*3+axis];
      }
      // The upper neck must tuck beneath the face instead of wrapping around
      // jaw/lip source vertices. Keep its front at the neutral neck profile.
      for(let j=0;j<=nr;j++)for(let k=0;k<=nc;k++) {
        const n=(j*(nc+1)+k)*3,y=np[n+1],front=Math.cos(k/nc*Math.PI*2);
        if(y>-.45&&front>.2){const limit=interpProfile(y,neckProfile,2)+.008;np[n+2]=lerp(np[n+2],Math.min(np[n+2],limit),smooth((y+.45)/.22)*smooth((front-.2)/.45));}
      }
      const neck=surfaceMesh(np,ni,material.clone());neck.name='Registered authored neck envelope';neck.renderOrder=2;neck.userData={base:new Float32Array(np),skin:true}; this.skinGroup.add(neck); this.skinMeshes.push(neck);
    }

    _createFeatures() {
      const matte = color => new T.MeshStandardMaterial({color,roughness:.6});
      this.featureGroup = new T.Group(); this.skinGroup.add(this.featureGroup);
      this.browMaterial=matte(0x58473c); this.lipMaterial=matte(0xa2645f); this.lidMaterial=matte(0xb48970);
      this.mouthMaterial=matte(0x472e2c); this.irisMaterial=matte(0x56665c);
      for(const material of [this.browMaterial,this.lipMaterial,this.lidMaterial,this.mouthMaterial]){material.depthTest=true;material.depthWrite=false;material.transparent=true;}
      for(const side of ['left','right']) {
        const sign=side==='left'?1:-1;
        const iris = new T.Mesh(new T.SphereGeometry(.050,24,16),this.irisMaterial);
        iris.scale.set(1,1,.25); iris.position.set(sign*.298,.962,.848); this.eyeGroup.add(iris);
        const pupil=new T.Mesh(new T.SphereGeometry(.023,20,12),matte(0x1e2825)); pupil.scale.z=.2; pupil.position.set(sign*.298,.962,.860); this.eyeGroup.add(pupil);
        const highlight=new T.Mesh(new T.SphereGeometry(.009,12,8),new T.MeshBasicMaterial({color:0xffffff})); highlight.position.set(sign*.298-.014,.976,.864); this.eyeGroup.add(highlight);
        for(const type of ['brow','upperLid','lowerLid']) {
          const mesh = new T.Mesh(new T.BufferGeometry(),type==='brow'?this.browMaterial:this.lidMaterial);
          mesh.userData={type,side};mesh.renderOrder=5; this.featureGroup.add(mesh); this.features.push(mesh);
        }
      }
      for(const type of ['upperLip','lowerLip']) {
        const mesh = new T.Mesh(new T.BufferGeometry(),this.lipMaterial); mesh.userData={type};mesh.renderOrder=5; this.featureGroup.add(mesh); this.features.push(mesh);
      }
      const mouth=surfaceMesh(new Float32Array(65*3),[],this.mouthMaterial); mouth.userData={type:'mouth'};mouth.renderOrder=4; this.featureGroup.add(mouth); this.features.push(mouth);
      // Nostrils follow alar and septal displacement, as does the skin surrounding them.
      for(const side of ['left','right']) {
        const n=new T.Mesh(new T.SphereGeometry(.036,20,12),matte(0x674b40));n.material.depthTest=true;n.material.depthWrite=false;n.material.transparent=true;n.renderOrder=5; n.scale.set(1,.48,.3); n.userData={type:'nostril',side}; this.featureGroup.add(n); this.features.push(n);
      }
      this._updateFeatures();
    }

    _createSkinBinding() {
      const Binding=global.MuscleSkinBinding;
      const mandibles=this.bones.filter(m=>/mandible/i.test(m.name));
      const lipDrivers=new Set(['zygomaticus_major','zygomaticus_minor','levator_labii_superioris','levator_labii_superioris_alaeque_nasi','levator_anguli_oris','risorius','buccinator','depressor_anguli_oris','depressor_labii_inferioris','mentalis','platysma']);
      this.oralBinding=new Binding([...this.muscles.filter(m=>lipDrivers.has(m.userData.id)),...mandibles],{radius:.42,neighbors:24,perSource:3,sampleSpacing:.025});
      for(const mesh of this.muscles.filter(m=>m.userData.id==='orbicularis_oris')) {
        this.oralBinding.bindMesh(mesh,{filter:(source,x,y)=>{
          if(Math.abs(x)>.08&&source.side!=='midline'&&source.side!==(x>0?'left':'right'))return false;
          if(Math.abs(x)>.20)return ['zygomaticus_major','depressor_anguli_oris','risorius','levator_anguli_oris','buccinator','joint:jaw'].includes(source.id);
          const lower=['depressor_labii_inferioris','mentalis','platysma','joint:jaw'];
          return y<.343?lower.includes(source.id):!lower.includes(source.id)&&source.id!=='depressor_anguli_oris';
        }});
      }
      // Static unsegmented context provides neutral anchors in the neck and scalp.
      // Only actual vertex deltas are transferred; a nearby inactive mesh contributes zero.
      const anchors=this.bones.filter(m=>/clavicle|sternum/i.test(m.name));
      this.skinBinding=new Binding([...this.muscles.filter(m=>!['levator_palpebrae_superioris','superior_tarsal','medial_pterygoid','lateral_pterygoid'].includes(m.userData.id)),...mandibles,...anchors],{radius:.48,neighbors:12,perSource:4,sampleSpacing:.035});
      for(const mesh of this.skinMeshes)this.skinBinding.bindMesh(mesh,{sampleFilter:(source,sample,x,y,z)=>{
        // Preserve the aperture's anatomical sides. Pure Euclidean proximity can
        // otherwise bind a lower lip/lid to the upper half across the opening.
        if(z>.85&&Math.abs(x)<.33&&y>.25&&y<.44) {
          if(source.id!=='orbicularis_oris')return false;
          if(Math.abs(x)>.20)return Math.abs(sample.x)>.20&&sample.y>.29&&sample.y<.40;
          return y>=.343?sample.y>=.343:sample.y<.343;
        }
        if(z>.75&&Math.abs(Math.abs(x)-.298)<.17&&y>.88&&y<1.055) {
          if(source.id!=='orbicularis_oculi'||!/palpebral/i.test(source.name))return false;
          return y>=.962?sample.y>=.962:sample.y<.962;
        }
        return true;
      }});

      // Features are registered ON the neutral authored shell and then inherit its
      // displacement, rather than drawing an independent face over the anatomy.
      const head=this.skinMeshes[0],base=head.userData.base,{rows,columns}=head.userData.grid;
      const cells=new Map(),size=.05,triangles=[];
      const addTriangle=(a,b,c)=>{
        const points=[a,b,c].map(v=>[base[v*3],base[v*3+1],base[v*3+2]]);
        if(points.every(p=>p[2]<.35))return;
        const xmin=Math.min(...points.map(p=>p[0])),xmax=Math.max(...points.map(p=>p[0])),ymin=Math.min(...points.map(p=>p[1])),ymax=Math.max(...points.map(p=>p[1]));
        const index=triangles.length;triangles.push({vertices:[a,b,c],points});
        for(let x=Math.floor(xmin/size);x<=Math.floor(xmax/size);x++)for(let y=Math.floor(ymin/size);y<=Math.floor(ymax/size);y++){const key=x+','+y;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(index);}
      };
      // Virtual neutral triangles bridge the eye/mouth aperture only for feature
      // coordinates; no triangles are added to the visible shell or its holes.
      for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){const n=row*(columns+1)+col;addTriangle(n,n+1,n+columns+1);addTriangle(n+1,n+columns+2,n+columns+1);}
      const project=(x,y)=>{
        let result=null;
        for(const index of cells.get(Math.floor(x/size)+','+Math.floor(y/size))||[]) {
          const tri=triangles[index],[a,b,c]=tri.points,det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(det)<1e-12)continue;
          const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/det,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/det,w=1-u-v;
          if(Math.min(u,v,w)<-1e-5)continue;const weights=[u,v,w].map(q=>Math.max(0,q)),sum=weights.reduce((a,b)=>a+b,0);for(let k=0;k<3;k++)weights[k]/=sum;
          const z=weights[0]*a[2]+weights[1]*b[2]+weights[2]*c[2];
          if(!result||z>result.z)result={z,refs:tri.vertices.map((vertex,k)=>({source:0,vertex,weight:weights[k]}))};
        }
        return result;
      };
      this.featureRegistration={method:'same-XY front triangle projection and exact barycentric displacement transfer',vertices:0,meanDepthAdjustment:0,maxDepthAdjustment:0,unregistered:0};
      this.featureBinding=new Binding([head],{radius:.20,neighbors:3,perSource:3,sampleSpacing:.03});
      for(const mesh of this.features) {
        mesh.updateMatrix();mesh.geometry.applyMatrix4(mesh.matrix);mesh.position.set(0,0,0);mesh.scale.set(1,1,1);mesh.rotation.set(0,0,0);mesh.updateMatrix();
        const p=mesh.geometry.attributes.position.array,type=mesh.userData.type,records=[];
        for(let i=0;i<p.length;i+=3) {
          const projected=project(p[i],p[i+1]);
          if(!projected){this.featureRegistration.unregistered++;records.push([]);continue;}
          const lift=type==='mouth'?-.008:type==='nostril'?.014:type.includes('Lip')?.018:.014;
          const nextZ=projected.z+lift,adjustment=Math.abs(nextZ-p[i+2]);
          p[i+2]=nextZ;records.push(projected.refs);this.featureRegistration.vertices++;this.featureRegistration.meanDepthAdjustment+=adjustment;this.featureRegistration.maxDepthAdjustment=Math.max(this.featureRegistration.maxDepthAdjustment,adjustment);
        }
        mesh.name='Registered '+type+(mesh.userData.side?' '+mesh.userData.side:'');
        mesh.userData.base=new Float32Array(p);mesh.geometry.computeVertexNormals();
        this.featureBinding.bindCorrespondences(mesh,records);
      }
      if(this.featureRegistration.vertices)this.featureRegistration.meanDepthAdjustment/=this.featureRegistration.vertices;
      this._updateGeometry();
    }

    _value(id,side) { return this.current[side]?.[id] || 0; }

    _modeFor(id,side='left') {
      if(this.actionModes?.[side]?.[id])return this.actionModes[side][id];
      const expression=this.expressionMode||'';
      if(id==='frontalis')return /sad|fear|grief/.test(expression)?'medial':'medial+lateral';
      if(id==='orbicularis_oculi')return /smile|furious|disgust|contempt/.test(expression)?'orbital':'combined';
      if(id==='orbicularis_oris')return /angry|anger/.test(expression)?'lip-tightener':'lip-pucker';
      if(id==='nasalis')return /^(angry|anger)$/.test(expression)?'alar':'transverse';
      return 'fiber-shortening';
    }
    _compileActionModes() {
      this.actionModes={left:{},right:{}};
      for(const [id,actions] of this.actionIndex)for(const side of ['left','right']) {
        const records=actions.filter(a=>!a.side||a.side==='both'||a.side===side);
        if(!records.length)continue;
        const raw=records.map(a=>[a.mode,a.part].filter(Boolean).join(' ')).join(' ').toLowerCase().replace(/_/g,'-');
        let mode=raw||'fiber-shortening';
        if(id==='frontalis')mode=/medial/.test(raw)&&!/lateral/.test(raw)?'medial':/lateral/.test(raw)&&!/medial/.test(raw)?'lateral':'medial+lateral';
        if(id==='orbicularis_oculi')mode=/palpebral/.test(raw)&&!/orbital/.test(raw)?'palpebral':/orbital/.test(raw)&&!/palpebral/.test(raw)?'orbital':'combined';
        if(id==='orbicularis_oris')mode=/lip-follow/.test(raw)?'lip-follow':/lip-release/.test(raw)?'lip-release':/tight|au23/.test(raw)?'lip-tightener':/funnel|au22/.test(raw)?'lip-funnel':'lip-pucker';
        if(id==='nasalis')mode=/alar|dilat|au38/.test(raw)?'alar':'transverse';
        if(id==='lateral_pterygoid')mode=/inferior/.test(raw)?'inferior':/superior/.test(raw)?'superior':'combined';
        this.actionModes[side][id]=mode;
      }
    }
    _meshPart(mesh) {
      if(mesh.userData.id==='orbicularis_oculi')return /palpebral/i.test(mesh.name)?'palpebral':'orbital';
      if(mesh.userData.id==='lateral_pterygoid')return /inferior/i.test(mesh.name)?'inferior':'superior';
      return this._modeFor(mesh.userData.id,mesh.userData.side);
    }
    _inHighlight(mesh) {
      const {id,side}=mesh.userData;
      if(!this.highlightGroup.has(id)||(this.highlightSide!=='both'&&side!==this.highlightSide))return false;
      const prescribed=(this.actionIndex.get(id)||[]).filter(a=>a.kind==='contract');
      if(prescribed.length&&!prescribed.some(a=>!a.side||a.side==='both'||a.side===side||side==='midline'))return false;
      if(id==='orbicularis_oculi') { const mode=this._modeFor(id,side);return mode==='combined'||mode===this._meshPart(mesh); }
      if(id==='lateral_pterygoid') { const mode=this._modeFor(id,side);return !['inferior','superior'].includes(mode)||mode===this._meshPart(mesh); }
      return true;
    }
    _applyMuscleStyle(mesh,a=0) {
      const ud=mesh.userData,id=ud.id,context=this.highlightGroup.size>0||this.relaxedGroup.size>0;
      const grouped=context&&this._inHighlight(mesh),relaxed=context&&this.relaxedGroup.has(id);
      const selected=id?this.selected===id:this.referenceSelectedName===mesh.name;
      const c=new T.Color(ud.baseColor);
      if(context) {
        if(grouped)c.setHex(0x128e7d).lerp(new T.Color(0x55d9b0),a*.30);
        else if(relaxed)c.setHex(0x7897b1);
        else c.setHex(0xb8afa5);
      } else if(selected)c.setHex(PALETTE.selected);
      else c.lerp(new T.Color(PALETTE.active),a*.65);
      mesh.material.color.copy(c);
      mesh.material.emissive.setHex(context&&selected?0x7c5418:grouped?0x075a47:selected?0x064639:0x4c0d05);
      mesh.material.emissiveIntensity=context&&selected?.30:grouped?.10+a*.18:selected?.13:a*.10;
      const opacity=this.layers.muscles.opacity*(context?(grouped?.98:relaxed?.54:.22):1);
      mesh.material.opacity=opacity;mesh.material.transparent=opacity<.999;mesh.material.depthWrite=!context&&opacity>=.9;
      mesh.renderOrder=context?(grouped?2:relaxed?1:0):0;
      ud.presentationRole=grouped?'contract':relaxed?'relax':'context';
      this.displayPlugin?.styleMesh(mesh,a);
    }

    _facePoint(x,y,z) {
      // Compatibility sampler of the same source displacement transfer used by
      // the surface. There is no independent analytic expression field here.
      return this.skinBinding ? this.skinBinding.samplePoint([x,y,z]) : [x,y,z];
    }

    _deformMuscle(mesh) {
      const ud=mesh.userData, id=ud.id;
      if(!id) {this._applyMuscleStyle(mesh,0);return;}
      this.motionCache?.delete(id);
      const rawActivation=ud.side==='midline'?(this._value(id,'left')+this._value(id,'right'))/2:this._value(id,ud.side);
      const headMode=id==='lateral_pterygoid'?this._modeFor(id,ud.side):null;
      const a=headMode&&['inferior','superior'].includes(headMode)&&headMode!==this._meshPart(mesh)?0:rawActivation;
      const p=mesh.geometry.attributes.position.array, base=ud.base;
      const sign=ud.side==='right'?-1:1;
      const origin=ud.origin, insertion=ud.insertion;
      const vx=insertion.x-origin.x,vy=insertion.y-origin.y,vz=insertion.z-origin.z;
      const length2=vx*vx+vy*vy+vz*vz || 1;
      const eye=id==='orbicularis_oculi', mouth=id==='orbicularis_oris';
      for(let i=0;i<p.length;i+=3) {
        let x=base[i],y=base[i+1],z=base[i+2];
        if(eye) {
          const cx=sign*.30,cy=.962;
          const palpebral=/palpebral/i.test(mesh.name);
          const mode=this._modeFor(id,ud.side),participates=mode==='combined'||(palpebral?mode==='palpebral':mode==='orbital');
          const regionalA=participates?a:0;
          const opening=this._value('levator_palpebrae_superioris',ud.side)+.25*this._value('superior_tarsal',ud.side);
          x=cx+(x-cx)*(1-.10*regionalA); y=cy+(y-cy)*(1-(palpebral?.81:.26)*regionalA);
          if(palpebral&&mode==='orbital') {
            // Passive rim accompaniment of the contracting orbital ring. This
            // moves the actual palpebral source surface before skin transfer.
            y=cy+(y-cy)*(1-.22*a);
            if(y<cy)y+=.028*a*smooth((cy-y)/.08);
          }
          if(palpebral&&y>cy)y+=.055*opening*smooth((y-cy)/.07);
          z+=.022*regionalA;
        } else if(id==='nasalis') {
          // The source is one unsplit nasalis surface. Regional weights distinguish
          // alar AU38 dilation from transverse compression; they are illustrative,
          // not a claim that the source contains separately segmented heads.
          const alar=this._modeFor(id,ud.side)==='alar';
          const weight=alar?smooth((1.0-y)/.32):smooth((y-.68)/.28);
          x+=sign*(alar?.040:-.022)*a*weight;
          z+=.008*a*weight;
        } else if(mouth) {
          const mode=this._modeFor(id,ud.side),tight=mode==='lip-tightener',funnel=mode==='lip-funnel';
          x*=1-(tight?0:funnel?.08:.22)*a;y=.343+(y-.343)*(1-(tight?.40:funnel?-.12:.20)*a);z+=(tight?-.008:funnel?.09:.065)*a;
          // Passive movement from neighboring source muscles is transferred once
          // after every directly driven muscle has been evaluated.
        } else {
          const t=clamp(((x-origin.x)*vx+(y-origin.y)*vy+(z-origin.z)*vz)/length2);
          const mode=this._modeFor(id,ud.side),medialWeight=Math.exp(-Math.pow((Math.abs(x)-.12)/.23,2));
          const regionWeight=id==='frontalis'?(mode==='medial'?medialWeight:mode==='lateral'?1-medialWeight:1):1;
          const contraction=.21*a*smooth(t)*regionWeight;
          x-=vx*contraction;y-=vy*contraction;z-=vz*contraction;
          const bulge=.035*a*Math.sin(Math.PI*t)*regionWeight;
          z+=bulge*(z>=0?1:-1);
          // Shared approximate condylar rotation supplies the mandibular attachment
          // displacement. It is a prescribed joint motion, not contraction strain.
          let jawWeight=['masseter','medial_pterygoid','temporalis','platysma'].includes(id)?t:id==='depressor_anguli_oris'?1-t:['depressor_labii_inferioris','mentalis'].includes(id)?1:0;
          if(jawWeight&&this.jaw) {
            const c=Math.cos(this.jaw*.27),s=Math.sin(this.jaw*.27),dy=y-.72,dz=z-.18;
            y+=jawWeight*(.72+c*dy-s*dz-y);z+=jawWeight*(.18+s*dy+c*dz-z);
          }
        }
        p[i]=x;p[i+1]=y;p[i+2]=z;
      }
      mesh.geometry.attributes.position.needsUpdate=true; mesh.geometry.computeVertexNormals();
      this._applyMuscleStyle(mesh,a);
    }

    _updateGeometry() {
      for(const mesh of this.muscles) this._deformMuscle(mesh);
      // Rotate the actual mandible and lower dentition around approximate condylar axis.
      const pivotY=.72,pivotZ=.18,angle=this.jaw*.27,c=Math.cos(angle),s=Math.sin(angle);
      for(const mesh of this.bones) {
        if(!(/mandible|lower .*tooth/i.test(mesh.name))) continue;
        const p=mesh.geometry.attributes.position.array,b=mesh.userData.base;
        for(let i=0;i<p.length;i+=3) { const y=b[i+1]-pivotY,z=b[i+2]-pivotZ; p[i]=b[i];p[i+1]=pivotY+c*y-s*z;p[i+2]=pivotZ+s*y+c*z; }
        mesh.geometry.attributes.position.needsUpdate=true;mesh.geometry.computeVertexNormals();
      }
      // Acyclic dependency: active source muscles + jaw -> passive lip muscle ->
      // registered skin -> registered surface features. Opacity is absent here.
      this.oralBinding?.update({additive:true});
      this.skinBinding?.update();
      this.featureBinding?.update();
      this._updateFibers();this._updateAnalysis();
      this.displayPlugin?.updateGeometry();
    }

    _updateFeatures() {
      if(this.featureBinding){this.featureBinding.update();return;}
      for(const mesh of this.features) {
        const type=mesh.userData.type,side=mesh.userData.side,sign=side==='right'?-1:1;
        if(type==='nostril') {
          const q=this._facePoint(sign*.108,.588,1.225);mesh.position.set(...q); continue;
        }
        if(type==='mouth') {
          const p=[0,.343,1.148],indices=[];
          const center=this._facePoint(...p),positions=[...center];
          for(let i=0;i<=64;i++) {
            const theta=i/64*Math.PI*2,x=.244*Math.cos(theta),localSide=x>=0?'left':'right';
            const y=.343+(Math.sin(theta)>=0?.023:.033+this.jaw*.11)*Math.sin(theta);
            const q=this._facePoint(x,y,1.143); positions.push(...q);
            if(i>0)indices.push(0,i,i+1);
          }
          mesh.geometry.dispose(); mesh.geometry=new T.BufferGeometry();mesh.geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));mesh.geometry.setIndex(indices);mesh.geometry.computeVertexNormals();continue;
        }
        const points=[];
        for(let i=0;i<=32;i++) {
          const t=i/32;
          if(type==='brow') {
            const x=sign*lerp(.13,.49,t),y=1.18+.055*Math.sin(Math.PI*t)-.028*t,z=1.037-.21*t*t;
            points.push(vec(this._facePoint(x,y,z,true)));
          } else if(type==='upperLid'||type==='lowerLid') {
            const a=this.current[side],theta=t*Math.PI;
            const orbitalOnly=this._modeFor('orbicularis_oculi',side)==='orbital';
            const upperLift=type==='upperLid'?.50*a.levator_palpebrae_superioris+.16*a.superior_tarsal:0;
            const opening=clamp(1-(orbitalOnly?.30:.94)*a.orbicularis_oculi+upperLift,.03,1.65);
            const x=sign*.298+Math.cos(theta)*.143;
            const y=.962+(type==='upperLid'?1:-1)*Math.sin(theta)*.064*opening;
            const z=.855+Math.sin(theta)*.026;
            points.push(vec(this._facePoint(x,y,z,true)));
          } else if(type==='upperLip'||type==='lowerLip') {
            const x=lerp(-.246,.246,t),envelope=Math.sin(Math.PI*t);
            const cupid=type==='upperLip'?.014*Math.exp(-Math.pow((Math.abs(x)-.055)/.038,2)):0;
            const y=.343+(type==='upperLip'?(.017*envelope+cupid):-(.024+this.jaw*.10)*envelope);
            points.push(vec(this._facePoint(x,y,1.151+.008*envelope)));
          }
        }
        const radius=type==='brow'?.018:type.includes('Lid')?.011:.019;
        const curve=new T.CatmullRomCurve3(points);
        mesh.geometry.dispose();mesh.geometry=new T.TubeGeometry(curve,32,radius,7,false);
      }
    }

    _updateFibers() {
      if(this.displayPlugin)return;
      while(this.fiberGroup.children.length) { const m=this.fiberGroup.children[0];m.geometry.dispose();m.material.dispose();this.fiberGroup.remove(m); }
      if(!this.selected || !this.layers.fibers.visible || this.analysisOptions.ghost || this.analysisOptions.arrows) return;
      const meshes=this.muscles.filter(m=>m.userData.id===this.selected&&m.visible);
      for(const mesh of meshes) {
        const ud=mesh.userData,positions=[],b=ud.base,p=mesh.geometry.attributes.position.array;
        // Sparse short surface segments show material deformation without inventing fiber anatomy.
        const stride=Math.max(12,Math.floor(p.length/120/3)*3);
        for(let i=0;i<p.length-3;i+=stride) {
          const origin=ud.origin,dir=ud.insertion.clone().sub(origin).normalize();
          positions.push(p[i],p[i+1],p[i+2]+.008,p[i]+dir.x*.027,p[i+1]+dir.y*.027,p[i+2]+dir.z*.027+.008);
        }
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
        const line=new T.LineSegments(g,new T.LineBasicMaterial({color:0xa0e1cf,transparent:true,opacity:.45,depthWrite:false}));
        line.position.copy(mesh.position);this.fiberGroup.add(line);
      }
    }

    _analysisMeshes() {
      const hasGroup=this.highlightGroup.size>0;
      return this.muscles.filter(mesh=>mesh.visible&&mesh.userData.id&&
        (this.isolation?mesh.userData.id===this.isolation:hasGroup?this._inHighlight(mesh):mesh.userData.id===this.selected));
    }
    _neutralWire(mesh) {
      const source=mesh.geometry.index?.array,base=mesh.userData.base,positions=[];
      if(source) {
        const stride=Math.max(1,Math.ceil(source.length/3/240));
        for(let tri=0;tri<source.length/3;tri+=stride) {
          const a=source[tri*3],b=source[tri*3+1],c=source[tri*3+2];
          for(const [u,v] of [[a,b],[b,c],[c,a]])positions.push(base[u*3],base[u*3+1],base[u*3+2],base[v*3],base[v*3+1],base[v*3+2]);
        }
      }
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      const line=new T.LineSegments(geometry,new T.LineBasicMaterial({color:0x536d7a,transparent:true,opacity:.34,depthTest:false,depthWrite:false}));
      line.renderOrder=7;line.userData={sourceMesh:mesh.name,reference:'unaltered neutral source vertex positions'};
      this.ghostGroup.add(line);this.ghostCache.set(mesh.uuid,line);return line;
    }
    _updateAnalysis() {
      if(!this.analysisGroup)return;
      const options=this.analysisOptions,enabled=this.layers.muscles.visible&&(options.ghost||options.arrows);
      this.analysisGroup.visible=enabled;
      if(!enabled){this.analysisDiagnostics={arrowCount:0,ghostMeshes:0,arrowGain:options.gain,arrows:[]};return;}
      const meshes=this._analysisMeshes();
      for(const ghost of this.ghostCache.values())ghost.visible=false;
      if(options.ghost)for(const mesh of meshes) {
        const ghost=this.ghostCache.get(mesh.uuid)||this._neutralWire(mesh);ghost.visible=true;ghost.position.copy(mesh.position);
        ghost.material.color.setHex(mesh.userData.id===this.selected?0xae791f:0x526d7a);
      }
      this.ghostGroup.visible=options.ghost;
      while(this.arrowGroup.children.length){const child=this.arrowGroup.children[0];child.geometry.dispose();child.material.dispose();this.arrowGroup.remove(child);}
      const positions=[],colors=[],arrows=[];
      if(options.arrows)for(const mesh of meshes) {
        const base=mesh.userData.base,current=mesh.geometry.attributes.position.array,candidates=[];
        const stride=Math.max(1,Math.floor(base.length/3/90));
        for(let vertex=0;vertex<base.length/3;vertex+=stride) {
          const i=vertex*3,d=new T.Vector3(current[i]-base[i],current[i+1]-base[i+1],current[i+2]-base[i+2]);
          if(d.length()>.0008)candidates.push({vertex,d,base:new T.Vector3(base[i],base[i+1],base[i+2])});
        }
        candidates.sort((a,b)=>b.d.lengthSq()-a.d.lengthSq());
        const chosen=[],extent=mesh.userData.bounds.getSize(new T.Vector3()).length(),separation=Math.max(.018,extent*.16);
        for(const candidate of candidates){if(chosen.every(p=>p.base.distanceTo(candidate.base)>separation))chosen.push(candidate);if(chosen.length===4)break;}
        const color=new T.Color(mesh.userData.id===this.selected?0xba7b15:0x126e8b);
        for(const sample of chosen) {
          const origin=sample.base.clone().add(mesh.position),actual=origin.clone().add(sample.d),end=origin.clone().addScaledVector(sample.d,options.gain);
          const direction=sample.d.clone().normalize(),reference=Math.abs(direction.y)>.85?new T.Vector3(1,0,0):new T.Vector3(0,1,0);
          const normal=new T.Vector3().crossVectors(direction,reference).normalize(),length=origin.distanceTo(end),head=Math.min(.055,length*.28);
          const h1=end.clone().addScaledVector(direction,-head).addScaledVector(normal,head*.48),h2=end.clone().addScaledVector(direction,-head).addScaledVector(normal,-head*.48);
          for(const point of [origin,end,end,h1,end,h2]){positions.push(point.x,point.y,point.z);colors.push(color.r,color.g,color.b);}
          arrows.push({id:mesh.userData.id,side:mesh.userData.side,sourceMesh:mesh.name,vertexIndex:sample.vertex,origin:origin.toArray(),actualEnd:actual.toArray(),displayEnd:end.toArray(),displacement:sample.d.toArray(),gain:options.gain});
        }
      }
      if(positions.length) {
        const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
        const lines=new T.LineSegments(geometry,new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.95,depthTest:false,depthWrite:false}));lines.renderOrder=9;this.arrowGroup.add(lines);
      }
      this.arrowGroup.visible=options.arrows;
      this.analysisDiagnostics={arrowCount:arrows.length,ghostMeshes:options.ghost?meshes.length:0,arrowGain:options.gain,arrows};
    }

    _refreshVisibility() {
      const skin=this.layers.skin;
      const grouped=this.isolationGroup!==null,options=this.isolationOptions;
      this.skinGroup.visible=skin.visible&&!this.isolation&&(!grouped||!options.hideSkin);
      this.boneGroup.visible=this.layers.bones.visible&&(!grouped||!options.hideBones);
      this.eyeGroup.visible=grouped&&options.hideExtras?this.skinGroup.visible:(this.layers.bones.visible||this.skinGroup.visible);
      this.muscleGroup.visible=this.layers.muscles.visible;
      for(const mesh of this.skinMeshes) { mesh.material.opacity=skin.opacity;mesh.material.transparent=skin.opacity<.999;mesh.material.depthWrite=skin.opacity>=.999;mesh.material.depthTest=true;mesh.material.needsUpdate=true; }
      if(this.featureGroup)this.featureGroup.visible=true;
      for(const mesh of this.features){mesh.material.opacity=skin.opacity;mesh.material.depthTest=true;mesh.material.needsUpdate=true;}
      for(const mesh of this.bones) {
        const context=this.highlightGroup.size>0||this.relaxedGroup.size>0;
        mesh.material.opacity=this.layers.bones.opacity*(this.isolation?.28:context?.28:1);mesh.material.transparent=mesh.material.opacity<.99;mesh.material.depthWrite=mesh.material.opacity>=.9;mesh.material.needsUpdate=true;
      }
      for(const mesh of this.muscles) {
        mesh.visible=!mesh.userData.displayHidden&&!this.hidden.has(mesh.userData.id)&&!this.hidden.has(mesh.name)&&(!this.isolation||mesh.userData.id===this.isolation||mesh.name===this.isolation)&&(!grouped||this.isolationGroup.has(mesh.userData.id)||this.isolationGroup.has(mesh.name));
        this._applyMuscleStyle(mesh,this._value(mesh.userData.id,mesh.userData.side));mesh.material.needsUpdate=true;
        const radial=mesh.userData.radial;
        if(radial)mesh.position.copy(radial).multiplyScalar(this.explode*(mesh.userData.source==='schematic'?.25:.20));
      }
      this.fiberGroup.visible=this.layers.fibers.visible&&this.layers.muscles.visible;
      this.displayPlugin?.updateVisibility();
      this.dirty=true;
    }

    setActivation(id,value,side='both') {
      if(!IDS.includes(id)) return;
      const v=clamp(value); for(const s of side==='both'?['left','right']:[side]) if(this.activation[s]&&this.activation[s][id]!==v){this.activation[s][id]=v;this.dirty=true;}
    }
    setActivations(map,side='both') {
      if(map?.left||map?.right) { if(map.left)this.setActivations(map.left,'left');if(map.right)this.setActivations(map.right,'right');return; }
      for(const [id,value] of Object.entries(map||{}))this.setActivation(id,value,side);
    }
    setJawOpen(value) { const v=clamp(value);if(this.jawTarget!==v){this.jawTarget=v;this.dirty=true;} }
    setExpressionMode(id) {
      if(this.expressionMode!==id){this.expressionMode=id||null;
        if(this.actionContext?.id!==id){this.actionContext=null;this.actionIndex.clear();this.actionModes={left:{},right:{}};}
        this.dirty=true;this.motionCache.clear();
      }
    }
    setActionContext(expression) {
      this.actionContext=expression||null;this.expressionMode=expression?.id||null;this.actionIndex.clear();
      const actions=Array.isArray(expression?.actions)?expression.actions:Object.entries(expression?.actions||{}).map(([id,value])=>({muscleId:id,...(typeof value==='object'?value:{mode:value})}));
      for(const raw of actions) {
        const id=raw.muscleId||raw.id;if(!IDS.includes(id))continue;
        const action={...raw,muscleId:id,side:raw.side||expression.side||'both'};
        if(!this.actionIndex.has(id))this.actionIndex.set(id,[]);this.actionIndex.get(id).push(action);
      }
      for(const [id,part] of Object.entries(expression?.parts||{})) {
        if(!IDS.includes(id))continue;
        if(!this.actionIndex.has(id))this.actionIndex.set(id,[{muscleId:id,kind:'contract',part:typeof part==='string'?part:part.part||part.mode,side:expression.side||'both'}]);
        else for(const action of this.actionIndex.get(id))if(!action.part)action.part=typeof part==='string'?part:part.part||part.mode;
      }
      this._compileActionModes();this.motionCache.clear();this._refreshVisibility();
    }
    setHighlightGroup(ids,{relaxed=[],side='both'}={}) {
      this.highlightGroup=new Set((ids||[]).filter(id=>IDS.includes(id)));
      this.relaxedGroup=new Set((relaxed||[]).map(value=>typeof value==='string'?value:value.muscleId||value.id).filter(id=>IDS.includes(id)));
      this.highlightSide=['left','right'].includes(side)?side:'both';this._refreshVisibility();
    }
    setAnalysisOptions(options={}) {
      for(const name of ['ghost','arrows'])if(name in options)this.analysisOptions[name]=!!options[name];
      if('gain' in options)this.analysisOptions.gain=clamp(options.gain,1,8);
      this.dirty=true;
    }
    getAnalysisData() { return JSON.parse(JSON.stringify(this.analysisDiagnostics)); }
    canPreviewAction(id,mode) {
      const modeId=typeof mode==='string'?mode:mode?.id;
      return !!PREVIEW_MODES[id]?.includes(modeId);
    }
    getActionPreviewSupport(id,mode) {
      const modeId=typeof mode==='string'?mode:mode?.id,supported=this.canPreviewAction(id,modeId);
      let reason=supported?'已实现局部肌肉/示意皮肤的运动预览；不代表验证过的力学模型。':'该候选动作尚未实现独立区域驱动，仅展示解剖与理论说明。';
      if(!supported&&['masseter','temporalis','medial_pterygoid','lateral_pterygoid','sternocleidomastoid'].includes(id))reason='当前只示意肌肉几何收缩；未求解该模式所需的关节前移、闭颌力矩、盘髁稳定或头颈耦合。';
      if(!supported&&id==='occipitalis')reason='可观察枕肌自身示意收缩，但尚未实现头皮/帽状腱膜后牵与跨区耦合。';
      if(supported&&id==='superior_tarsal')reason='预览较小的上睑位置变化；输入代表自主神经张力参数，不是独立随意骨骼肌动作。';
      return {muscleId:id,modeId,supported,status:supported?'schematic-preview':'theory-only',reason,implementedModes:[...(PREVIEW_MODES[id]||[])],jointMechanics:false,validatedBiomechanics:false};
    }
    reset() { for(const side of ['left','right']) for(const id of IDS)this.activation[side][id]=0;this.jawTarget=0;this.dirty=true; }
    setLayer(name,visible,opacity) {
      if(name==='skeleton')name='bones';if(name==='muscle')name='muscles';
      if(!this.layers[name])return;
      this.layers[name].visible=!!visible;if(opacity!==undefined)this.layers[name].opacity=clamp(opacity);
      this._refreshVisibility();
    }
    setIsolation(id) { this.isolation=id||null;this.isolationGroup=null;this._refreshVisibility(); }
    setIsolationGroup(ids,options={}) {
      this.isolation=null;this.isolationGroup=ids==null?null:new Set(ids.filter(id=>IDS.includes(id)||this.muscles.some(m=>m.name===id)));
      this.isolationOptions={hideBones:true,hideExtras:true,hideSkin:false,...options};this._refreshVisibility();
    }
    setMuscleActionMode(id,mode,side='both') {
      if(!IDS.includes(id))return;
      const kept=(this.actionIndex.get(id)||[]).filter(a=>side!=='both'&&a.side!==side&&a.side!=='both');
      if(side!=='both')for(const a of this.actionIndex.get(id)||[])if(a.side==='both')kept.push({...a,side:side==='left'?'right':'left'});
      kept.push({muscleId:id,kind:'contract',mode,part:mode,side});this.actionIndex.set(id,kept);this._compileActionModes();this.motionCache.clear();this.dirty=true;
    }
    setHidden(id,hidden) { if(hidden)this.hidden.add(id);else this.hidden.delete(id);this._refreshVisibility(); }
    setSelected(id) { this.selected=id||null;this.referenceSelectedName=null;this.dirty=true; }
    setSelectedReference(name) { this.referenceSelectedName=name||null;this.selected=null;this.dirty=true; }
    setExplode(value) { this.explode=clamp(value);this._refreshVisibility(); }
    setView(view) {
      const views={front:0,left:Math.PI/2,right:-Math.PI/2,back:Math.PI,reset:-.14};
      if(view in views)this.orbitTarget.yaw=views[view];
      this.orbitTarget.pitch=view==='reset'?.045:0;this.orbitTarget.distance=7.9;
      this.orbit.target.set(0,.1,.08);
      if(view==='face'){this.orbitTarget.yaw=0;this.orbitTarget.distance=4.5;this.orbit.target.set(0,.99,.60);}
      if(view==='neck'){this.orbitTarget.yaw=-.20;this.orbitTarget.distance=5.5;this.orbit.target.set(0,-.65,.15);}
    }
    getAvailableMuscles() {
      return IDS.map(id=>{
        const meshes=this.muscles.filter(m=>m.userData.id===id);
        return {id,source:meshes.some(m=>m.userData.source==='open')?'open':'schematic',meshes:meshes.length,sides:[...new Set(meshes.map(m=>m.userData.side))],names:meshes.map(m=>m.name)};
      });
    }
    _measureRegion(mesh,part,predicate) {
      const ud=mesh.userData,p=mesh.geometry.attributes.position.array,b=ud.base;
      const axis=ud.insertion.clone().sub(ud.origin).normalize();
      const min0=[Infinity,Infinity,Infinity],max0=[-Infinity,-Infinity,-Infinity],min1=[Infinity,Infinity,Infinity],max1=[-Infinity,-Infinity,-Infinity];
      let p0min=Infinity,p0max=-Infinity,p1min=Infinity,p1max=-Infinity,n=0,total=0,max=0,dx=0,dy=0,dz=0;
      for(let i=0;i<p.length;i+=3) {
        if(predicate&&!predicate(b[i],b[i+1],b[i+2]))continue;
        n++;const x=p[i]-b[i],y=p[i+1]-b[i+1],z=p[i+2]-b[i+2],d=Math.hypot(x,y,z);total+=d;max=Math.max(max,d);dx+=x;dy+=y;dz+=z;
        const q0=b[i]*axis.x+b[i+1]*axis.y+b[i+2]*axis.z,q1=p[i]*axis.x+p[i+1]*axis.y+p[i+2]*axis.z;
        p0min=Math.min(p0min,q0);p0max=Math.max(p0max,q0);p1min=Math.min(p1min,q1);p1max=Math.max(p1max,q1);
        for(let k=0;k<3;k++){min0[k]=Math.min(min0[k],b[i+k]);max0[k]=Math.max(max0[k],b[i+k]);min1[k]=Math.min(min1[k],p[i+k]);max1[k]=Math.max(max1[k],p[i+k]);}
      }
      if(n<3)return null;
      const e0=max0.map((x,i)=>x-min0[i]),e1=max1.map((x,i)=>x-min1[i]);
      let baselineSpan=p0max-p0min,currentSpan=p1max-p1min,metric='projected mesh span along heuristic attachment axis';
      if(ud.id==='orbicularis_oculi'||ud.id==='orbicularis_oris') {
        const perimeter=(width,height)=>{const a=Math.max(.00001,width/2),b=Math.max(.00001,height/2),h=((a-b)/(a+b))**2;return Math.PI*(a+b)*(1+3*h/(10+Math.sqrt(4-3*h)));};
        const xfactor=ud.id==='orbicularis_oris'?2:1;
        baselineSpan=perimeter(e0[0]*xfactor,e0[1]);currentSpan=perimeter(e1[0]*xfactor,e1[1]);metric='elliptical perimeter estimated from mesh extents';
      }
      return {part,sourceMesh:mesh.name,vertices:n,metric,baselineSpan,currentSpan,shorteningPercent:baselineSpan>.00001?(baselineSpan-currentSpan)/baselineSpan*100:0,meanDisplacement:total/n,maxDisplacement:max,centroidDisplacement:{x:dx/n,y:dy/n,z:dz/n},extentChange:{x:e0[0]>.00001?(e1[0]-e0[0])/e0[0]*100:0,y:e0[1]>.00001?(e1[1]-e0[1])/e0[1]*100:0,z:e0[2]>.00001?(e1[2]-e0[2])/e0[2]*100:0},baselineExtents:{x:e0[0],y:e0[1],z:e0[2]},currentExtents:{x:e1[0],y:e1[1],z:e1[2]},axis:axis.toArray()};
    }
    getMuscleMotion(id) {
      if(this.motionCache.has(id))return this.motionCache.get(id);
      const meshes=this.muscles.filter(mesh=>mesh.userData.id===id),sides=[];
      for(const side of ['left','right']) {
        const mode=this._modeFor(id,side),regions=[];
        const actions=(this.actionIndex.get(id)||[]).filter(a=>!a.side||a.side==='both'||a.side===side);
        const actionKind=actions.some(a=>a.kind==='contract')?'contract':actions[0]?.kind;
        for(const mesh of meshes.filter(mesh=>mesh.userData.side===side||mesh.userData.side==='midline')) {
          let definitions=[{part:this._meshPart(mesh),test:null}];
          if(id==='frontalis')definitions=[{part:'medial',test:x=>Math.abs(x)<.27},{part:'lateral',test:x=>Math.abs(x)>=.27}];
          if(id==='nasalis')definitions=[{part:'alar',test:(x,y)=>y<.84},{part:'transverse',test:(x,y)=>y>=.84}];
          for(const definition of definitions) {
            const region=this._measureRegion(mesh,definition.part,definition.test);if(!region)continue;
            region.role=((id==='frontalis'&&mode!=='medial+lateral')||id==='nasalis'||(id==='orbicularis_oculi'&&mode!=='combined')||(id==='lateral_pterygoid'&&['inferior','superior'].includes(mode)))&&region.part!==mode?'passive/context':'prescribed';
            if(actionKind==='relax')region.role='relaxed/passive motion';
            else if(actionKind==='passive')region.role='passive coordination';
            regions.push(region);
          }
        }
        if(!regions.length)continue;
        const measured=regions.filter(r=>r.role==='prescribed'),selected=measured.length?measured:regions,weight=selected.reduce((sum,r)=>sum+r.vertices,0);
        const mean=key=>selected.reduce((sum,r)=>sum+r[key]*r.vertices,0)/weight;
        const component=(key,axis)=>selected.reduce((sum,r)=>sum+r[key][axis]*r.vertices,0)/weight;
        const baselineSpan=mean('baselineSpan'),currentSpan=mean('currentSpan');
        sides.push({side,mode,activation:this._value(id,side),metric:selected[0].metric,baselineSpan,currentSpan,shorteningPercent:baselineSpan>.00001?(baselineSpan-currentSpan)/baselineSpan*100:0,meanDisplacement:mean('meanDisplacement'),maxDisplacement:Math.max(...selected.map(r=>r.maxDisplacement)),centroidDisplacement:{x:component('centroidDisplacement','x'),y:component('centroidDisplacement','y'),z:component('centroidDisplacement','z')},extentChange:{x:component('extentChange','x'),y:component('extentChange','y'),z:component('extentChange','z')},regions});
      }
      const count=sides.length||1;
      const result={id,notice:'Visualization geometry estimates in display units; not measured fiber length, tissue strain, anisotropic stiffness, or FEM results.',mode:this._modeFor(id,'left'),activation:{left:this._value(id,'left'),right:this._value(id,'right')},actions:this.actionIndex.get(id)||[],meanDisplacement:sides.reduce((sum,s)=>sum+s.meanDisplacement,0)/count,maxDisplacement:sides.length?Math.max(...sides.map(s=>s.maxDisplacement)):0,shorteningPercent:sides.reduce((sum,s)=>sum+s.shorteningPercent,0)/count,sides};
      this.motionCache.set(id,result);return result;
    }
    getGeometryStats(id) {
      const result=[];
      for(const mesh of this.muscles.filter(m=>!id||m.userData.id===id)) {
        const p=mesh.geometry.attributes.position.array,b=mesh.userData.base;let sum=0,max=0,finite=true,dx=0,dy=0,dz=0;
        for(let i=0;i<p.length;i+=3){const x=p[i]-b[i],y=p[i+1]-b[i+1],z=p[i+2]-b[i+2],d=Math.hypot(x,y,z);sum+=d;max=Math.max(max,d);dx+=x;dy+=y;dz+=z;if(!Number.isFinite(d))finite=false;}
        const count=p.length/3;
        result.push({id:mesh.userData.id,name:mesh.name,side:mesh.userData.side,source:mesh.userData.source,vertices:count,meanDisplacement:sum/count,maxDisplacement:max,centroidDisplacement:{x:dx/count,y:dy/count,z:dz/count},origin:mesh.userData.origin?.toArray(),insertion:mesh.userData.insertion?.toArray(),finite,visible:mesh.visible});
      }
      return result;
    }
    getSkinGeometryChecksum() {
      let hash=2166136261,vertices=0,finite=true;
      for(const mesh of [...this.skinMeshes,...this.features]) {
        const p=mesh.geometry.attributes.position.array,bytes=new Uint8Array(p.buffer,p.byteOffset,p.byteLength);
        for(let i=0;i<bytes.length;i++){hash^=bytes[i];hash=Math.imul(hash,16777619);}
        vertices+=p.length/3;for(const value of p)if(!Number.isFinite(value))finite=false;
      }
      return {checksum:(hash>>>0).toString(16),vertices,finite};
    }
    getSkinCorrespondence(meshIndex,vertexIndex,{feature=false}={}) {
      return (feature?this.featureBinding:this.skinBinding)?.correspondence(meshIndex,vertexIndex)||null;
    }
    getSkinContribution(id,options={}) { return this.skinBinding?.contribution(id,options)||null; }
    getSkinBindingDiagnostics() {
      if(!this.skinBinding)return {ready:false};
      const skin=this.skinBinding.diagnostics(),features=this.featureBinding.diagnostics();
      return {ready:true,method:skin.method,physiologicalValidation:false,
        skin,features,featureRegistration:{...this.featureRegistration},
        neutralAlignment:'Authored smoothed radial envelope constructed from neutral source surfaces; features triangle-registered to that shell. The neutral offsets are geometric registration, not measured skin thickness or validated anatomical fit.',
        neutralReconstructionError:skin.neutralReconstructionError,currentReconstructionError:skin.currentReconstructionError,
        finite:skin.finite&&features.finite,coverage:skin.coverage,
        dependencyOrder:['direct muscle and prescribed jaw geometry','passive orbicularis oris transfer','skin source-delta transfer','surface-feature skin-delta transfer'],
        passiveOral:{sourceMeshes:this.oralBinding.sources.length,targetMeshes:this.oralBinding.targets.length,method:'additive local vertex-delta transfer; no passive tissue force solve'},
        opacityAffectsGeometry:false,explodeIsPresentationOnly:true,
        pose:{left:{...this.current.left},right:{...this.current.right},jaw:this.jaw,actionModes:JSON.parse(JSON.stringify(this.actionModes))}};
    }
    verifySkinBinding({opacityAudit=true}={}) {
      const diagnostics=this.getSkinBindingDiagnostics();if(!diagnostics.ready)return diagnostics;
      const before=this.getSkinGeometryChecksum(),values=[];
      if(opacityAudit) {
        const state={...this.layers.skin},dirty=this.dirty;
        for(const opacity of [0,.25,.65,1]){this.setLayer('skin',true,opacity);this._updateGeometry();values.push({opacity,...this.getSkinGeometryChecksum()});}
        this.setLayer('skin',state.visible,state.opacity);this.dirty=dirty;
      }
      const opacityInvariant=values.every(x=>x.checksum===before.checksum);
      return {...diagnostics,checksum:before,opacityAudit:values,opacityInvariant,
        passed:diagnostics.finite&&diagnostics.skin.currentReconstructionError<1e-6&&diagnostics.features.currentReconstructionError<1e-6&&diagnostics.skin.neutralReconstructionError<1e-10&&opacityInvariant,
        interpretation:'Checks fixed correspondence and numerical reconstruction only; does not validate anatomy, forces, tissue thickness or biological expression accuracy.'};
    }
    getState() {
      return {ready:this.ready,selected:this.selected,referenceSelectedName:this.referenceSelectedName,isolation:this.isolation,isolationGroup:this.isolationGroup?[...this.isolationGroup]:null,skinBindingReady:!!this.skinBinding,hidden:[...this.hidden],layers:JSON.parse(JSON.stringify(this.layers)),activation:JSON.parse(JSON.stringify(this.activation)),jawOpen:this.jawTarget,expressionMode:this.expressionMode,actionContext:this.actionContext?.id||null,deformationModes:{nasalis:this._modeFor('nasalis'),frontalis:this._modeFor('frontalis'),orbicularis_oculi:this._modeFor('orbicularis_oculi'),orbicularis_oris:this._modeFor('orbicularis_oris')},highlight:{contract:[...this.highlightGroup],relaxed:[...this.relaxedGroup],side:this.highlightSide},analysis:{...this.analysisOptions,arrowCount:this.analysisDiagnostics.arrowCount,ghostMeshes:this.analysisDiagnostics.ghostMeshes},explode:this.explode,meshCount:this.meshes.length,muscles:this.getAvailableMuscles(),renderer:this.renderer.info.render};
    }
    resize() {
      const width=Math.max(1,this.container.clientWidth),height=Math.max(1,this.container.clientHeight);
      this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setSize(width,height,false);
    }

    _bindInteraction() {
      const canvas=this.renderer.domElement;
      canvas.addEventListener('pointerdown',e=>{ this.drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,button:e.button};canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove',e=>{
        if(this.drag) {
          const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
          if(this.drag.button===2||e.shiftKey){this.orbit.target.x-=dx*.003;this.orbit.target.y+=dy*.003;}
          else {this.orbitTarget.yaw-=dx*.007;this.orbitTarget.pitch=clamp(this.orbitTarget.pitch+dy*.005,-1.25,1.25);}
          this.drag.x=e.clientX;this.drag.y=e.clientY;canvas.style.cursor='grabbing';
        } else {const hit=this._hit(e);canvas.style.cursor=hit?'pointer':'grab';}
      });
      canvas.addEventListener('pointerup',e=>{
        if(this.drag&&Math.hypot(e.clientX-this.drag.startX,e.clientY-this.drag.startY)<5){const hit=this._hit(e);if(hit){
          const mesh=hit.object,ud=mesh.userData;
          if(ud.id){this.setSelected(ud.id);this.options.onSelect?.(ud.id,ud.side,ud);}
          else {this.setSelectedReference(mesh.name);this.options.onReferenceSelect?.({name:mesh.name,side:ud.side,sourceLayer:ud.sourceLayer,source:ud.source,anatomySource:ud.anatomySource,tissue:ud.tissue,controllable:false});}
        }}
        this.drag=null;canvas.style.cursor='grab';
      });
      canvas.addEventListener('pointercancel',()=>{this.drag=null;});
      canvas.addEventListener('wheel',e=>{e.preventDefault();this.orbitTarget.distance=clamp(this.orbitTarget.distance*Math.exp(e.deltaY*.001),3.5,13);},{passive:false});
      canvas.addEventListener('contextmenu',e=>e.preventDefault());
      canvas.addEventListener('dblclick',()=>this.setView('reset'));
      canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')this.orbitTarget.yaw+=.15;if(e.key==='ArrowRight')this.orbitTarget.yaw-=.15;if(e.key==='ArrowUp')this.orbitTarget.pitch-=.1;if(e.key==='ArrowDown')this.orbitTarget.pitch+=.1;if(e.key==='Home')this.setView('reset');});
    }
    _hit(event) {
      if(!this.layers.muscles.visible)return null;
      const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      return this.raycaster.intersectObjects(this.muscles.filter(m=>m.visible),false)[0]||null;
    }
    _frame(time) {
      if(this.disposed)return;
      const dt=Math.min((time-(this.lastTime||time))/1000,.05);this.lastTime=time;
      const factor=1-Math.exp(-dt*13);let moving=false;
      for(const side of ['left','right'])for(const id of IDS){const target=this.activation[side][id],value=this.current[side][id];if(Math.abs(target-value)>.0005){this.current[side][id]=lerp(value,target,factor);moving=true;}else this.current[side][id]=target;}
      if(Math.abs(this.jawTarget-this.jaw)>.0005){this.jaw=lerp(this.jaw,this.jawTarget,factor);moving=true;}else this.jaw=this.jawTarget;
      if(this.ready&&(moving||this.dirty)){this._updateGeometry();this.dirty=false;}
      this.orbit.yaw=lerp(this.orbit.yaw,this.orbitTarget.yaw,.12);this.orbit.pitch=lerp(this.orbit.pitch,this.orbitTarget.pitch,.12);this.orbit.distance=lerp(this.orbit.distance,this.orbitTarget.distance,.12);
      const o=this.orbit,d=o.distance;this.camera.position.set(o.target.x+Math.sin(o.yaw)*Math.cos(o.pitch)*d,o.target.y+Math.sin(o.pitch)*d,o.target.z+Math.cos(o.yaw)*Math.cos(o.pitch)*d);this.camera.lookAt(o.target);
      this.renderer.render(this.scene,this.camera);this._raf=requestAnimationFrame(this._frame);
    }
    dispose() {
      this.disposed=true;cancelAnimationFrame(this._raf);this.resizeObserver?.disconnect();
      this.displayPlugin?.dispose();
      this.scene.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});
      this.renderer.dispose();this.renderer.domElement.remove();
    }
  }
  global.AnatomyViewer=AnatomyViewer;
})(window);
