/*
 * Animal mechanism studies. Original procedural, deliberately simplified meshes.
 * These are educational routing and motion illustrations, NOT scans, segmented
 * anatomy, measurements, muscle-force simulations, or reconstructions of a taxon.
 * All articulation amounts and attachment locations are illustrative. A highlighted
 * jaw pathway identifies the mechanism; it does not assert every jaw muscle contracts
 * during opening. Surface, cartilage/bone and routing use the same joint transforms.
 */
(function () {
  'use strict';
  const T = window.THREE;
  const SPECIES = {
    fish: ['jaw', 'operculum'], frog: ['jaw', 'eyeRetract', 'throat'],
    lizard: ['jaw', 'blink', 'dewlap'],
    cat: ['jaw', 'blink', 'ears', 'whiskers', 'lip'],
    dog: ['jaw', 'blink', 'ears', 'whiskers', 'lip', 'brow']
  };
  const C = {skin: 0xd9cbb4, bone: 0xf0e5cb, muscle: 0xae5752, active: 0x267d78,
    selected: 0x69aaa0, dark: 0x303e3b, cartilage: 0xc78f80, fiber: 0xe8bdb0};
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const clamp = n => Math.max(0, Math.min(1, Number.isFinite(Number(n)) ? Number(n) : 0));

  class AnimalViewer {
    constructor(container, options = {}) {
      if (!T) throw new Error('AnimalViewer requires the bundled THREE library.');
      this.container = container;
      this.onSelect = typeof options.onSelect === 'function' ? options.onSelect : () => {};
      this.species = 'cat'; this.pose = {}; this.selected = null;
      this.layers = {skin: true, muscles: true, bones: false};
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(34, 1, 0.1, 50);
      this.renderer = new T.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'low-power'});
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setClearColor(0x000000, 0);
      if ('outputEncoding' in this.renderer) this.renderer.outputEncoding = T.sRGBEncoding;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.13;
      this.canvas = this.renderer.domElement;
      // Absolute sizing avoids canvas intrinsic height feeding a ResizeObserver loop
      // when the host uses a grid/flex minimum height instead of an explicit height.
      if (getComputedStyle(this.container).position === 'static') this.container.style.position = 'relative';
      this.canvas.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;touch-action:none;cursor:grab';
      this.canvas.setAttribute('aria-label', '可旋转的动物头部机制示意模型');
      this.container.appendChild(this.canvas);
      this.scene.add(new T.HemisphereLight(0xfff9ec, 0x758f8c, 1.35));
      const key = new T.DirectionalLight(0xfff9ed, 2.1); key.position.set(-3, 6, 6); this.scene.add(key);
      const fill = new T.DirectionalLight(0xd1ebe8, 1.2); fill.position.set(5, 2, -2); this.scene.add(fill);
      this.root = new T.Group(); this.scene.add(this.root);
      this.yaw = .58; this.pitch = .18; this.distance = 6.7; this.target = V(0, .04, .15);
      this.raycaster = new T.Raycaster(); this.pointer = new T.Vector2();
      this._events = []; this._installEvents();
      this._resizeObserver = window.ResizeObserver ? new ResizeObserver(() => this.resize()) : null;
      if (this._resizeObserver) this._resizeObserver.observe(container);
      this.setSpecies('cat'); this.resize();
      this._render = () => {
        if (this.disposed) return;
        if (this._dirty) {
          this._updateCamera(); this.renderer.render(this.scene, this.camera); this._dirty = false;
        }
        this._frame = requestAnimationFrame(this._render);
      };
      this._render();
    }

    _installEvents() {
      const listen = (name, fn, opts) => { this.canvas.addEventListener(name, fn, opts); this._events.push([name, fn, opts]); };
      listen('pointerdown', e => {
        if (e.button !== 0) return;
        this._drag = {x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false};
        this.canvas.setPointerCapture(e.pointerId); this.canvas.style.cursor = 'grabbing';
      });
      listen('pointermove', e => {
        if (!this._drag) return;
        const d = this._drag;
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) d.moved = true;
        if (d.moved) {
          this.yaw += (e.clientX - d.x) * .008;
          this.pitch = Math.max(-.65, Math.min(1.05, this.pitch + (e.clientY - d.y) * .006));
          this._dirty = true;
        }
        d.x = e.clientX; d.y = e.clientY;
      });
      listen('pointerup', e => {
        const d = this._drag; this._drag = null; this.canvas.style.cursor = 'grab';
        if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
        if (d && !d.moved) this._pick(e);
      });
      listen('pointercancel', () => { this._drag = null; this.canvas.style.cursor = 'grab'; });
      listen('wheel', e => {
        e.preventDefault(); this.distance = Math.max(3.7, Math.min(11, this.distance * Math.exp(e.deltaY * .001)));
        this._dirty = true;
      }, {passive: false});
    }

    _pick(e) {
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      this._updateCamera(); this.scene.updateMatrixWorld(true);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const visible = mesh => { for (let p = mesh; p; p = p.parent) if (!p.visible) return false; return true; };
      const hits = this.raycaster.intersectObjects(this.pickables.filter(visible), false);
      if (hits.length) {
        const id = hits[0].object.userData.channel;
        this.selectChannel(id); this.onSelect(id);
      }
    }

    _updateCamera() {
      this.camera.position.set(this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance,
        this.target.y + Math.sin(this.pitch) * this.distance,
        this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance);
      this.camera.lookAt(this.target);
    }

    _material(layer, channel, color, extras = {}) {
      const mat = new T.MeshStandardMaterial(Object.assign({
        color: color === undefined ? C[layer] || C.skin : color, roughness: .65, metalness: .025,
        side: T.DoubleSide
      }, extras));
      mat.userData = {layer, channel, baseColor: mat.color.clone()};
      this.materials.push(mat); return mat;
    }

    _group(parent, position) {
      const g = new T.Group(); if (position) g.position.copy(position); parent.add(g); return g;
    }

    _mesh(geometry, parent, layer, channel, color, extras) {
      const m = new T.Mesh(geometry, this._material(layer, channel, color, extras));
      m.userData = {layer, channel}; parent.add(m); this.meshes.push(m);
      if (channel) this.pickables.push(m);
      return m;
    }

    _ellipsoid(parent, layer, channel, p, s, color) {
      const m = this._mesh(new T.SphereGeometry(1, 32, 24), parent, layer, channel, color);
      m.position.copy(p); m.scale.copy(s); return m;
    }

    // Smooth tubes are routing illustrations, not measured fascicle trajectories.
    _route(parent, layer, channel, points, radius = .035, color, options = {}) {
      const count = options.segments || 24, radial = options.radial || 7;
      const geo = new T.BufferGeometry();
      const positions = new Float32Array((count + 1) * (radial + 1) * 3), indices = [];
      for (let i = 0; i < count; i++) for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j, b = a + radial + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
      geo.setAttribute('position', new T.BufferAttribute(positions, 3)); geo.setIndex(indices);
      const mesh = this._mesh(geo, parent, layer, channel, color);
      const update = pts => {
        const curve = new T.CatmullRomCurve3(pts.map(p => p.clone ? p.clone() : V(...p)));
        const frames = curve.computeFrenetFrames(count, false);
        for (let i = 0; i <= count; i++) {
          const p = curve.getPointAt(i / count);
          // Tapered ends make bundles legible without implying a flat cable.
          const rr = radius * (options.taper === false ? 1 : .45 + .55 * Math.sin(Math.PI * i / count));
          for (let j = 0; j <= radial; j++) {
            const a = j / radial * Math.PI * 2, k = (i * (radial + 1) + j) * 3;
            positions[k] = p.x + rr * (Math.cos(a) * frames.normals[i].x + Math.sin(a) * frames.binormals[i].x);
            positions[k + 1] = p.y + rr * (Math.cos(a) * frames.normals[i].y + Math.sin(a) * frames.binormals[i].y);
            positions[k + 2] = p.z + rr * (Math.cos(a) * frames.normals[i].z + Math.sin(a) * frames.binormals[i].z);
          }
        }
        geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
      };
      update(points); return {mesh, update};
    }

    _ring(parent, layer, channel, center, rx, ry, color, radius = .028) {
      const points = [];
      for (let i = 0; i <= 40; i++) {
        const a = i / 40 * Math.PI * 2;
        points.push(V(center.x + rx * Math.cos(a), center.y + ry * Math.sin(a), center.z));
      }
      return this._route(parent, layer, channel, points, radius, color, {segments: 48, taper: false});
    }

    _freeModel() {
      if (!this.meshes) return;
      this.meshes.forEach(m => m.geometry.dispose()); this.materials.forEach(m => m.dispose());
      while (this.root.children.length) this.root.remove(this.root.children[0]);
    }

    setSpecies(id) {
      if (!SPECIES[id]) id = 'cat';
      this._freeModel(); this.species = id; this.pose = Object.fromEntries(SPECIES[id].map(k => [k, 0]));
      this.meshes = []; this.materials = []; this.pickables = []; this.updaters = [];
      this.skin = this._group(this.root); this.bones = this._group(this.root); this.muscles = this._group(this.root);
      this.context = this._group(this.root); this.dynamic = this._group(this.root);
      this.rig = {};
      if (id === 'fish') this._fish();
      else if (id === 'frog') this._frog();
      else if (id === 'lizard') this._lizard();
      else this._mammal(id);
      this.selected = SPECIES[id].includes(this.selected) ? this.selected : null;
      this.setPose(this.pose); this.setLayers(this.layers);
      this.resize(); return this;
    }

    _cranial(p, s, color) {
      this._ellipsoid(this.skin, 'skin', null, p, s, color);
      this._ellipsoid(this.bones, 'bone', null, p.clone().add(V(0, -.025, -.025)), s.clone().multiplyScalar(.88));
    }

    _jaw(config) {
      const {hinge, center, scale, width, front, maxAngle = .7, skinColor} = config;
      const jaw = this._group(this.dynamic, hinge); this.rig.jaw = jaw;
      this._ellipsoid(jaw, 'skin', 'jaw', center, scale, skinColor);
      this._ellipsoid(jaw, 'bone', 'jaw', center.clone().add(V(0, .015, 0)), scale.clone().multiply(V(.88, .8, .93)));
      for (const side of [-1, 1]) {
        const start = V(side * width, .17, .03);
        this._ellipsoid(jaw, 'bone', 'jaw', start, V(.10, .12, .10));
        this._route(jaw, 'bone', 'jaw', [start, V(side * width * .92, -.09, front * .55), V(side * width * .66, -.09, front)], .065);
      }
      // Mouth interior is carried by the jaw, avoiding a floating lower surface.
      this._ellipsoid(jaw, 'context', 'jaw', center.clone().add(V(0, scale.y * .75, .025)),
        V(scale.x * .82, .035, scale.z * .88), 0x5b4943);
      const lowerLine = [];
      for (let i = 0; i <= 24; i++) {
        const a = Math.PI * i / 24;
        lowerLine.push(V(Math.cos(a) * width * .97, center.y + scale.y * .62, Math.sin(a) * front + .02));
      }
      this._route(jaw, 'skin', 'jaw', lowerLine, .025, 0x7b6d61, {taper: false});
      this.updaters.push(p => { jaw.rotation.x = p.jaw * maxAngle; jaw.updateMatrix(); });
      // Cheek routing joins a fixed cranial anchor to the moving mandible.
      for (const side of [-1, 1]) for (let f = 0; f < 5; f++) {
        const origin = V(side * (width * .93 + f * .013), hinge.y + .48 + f * .045, hinge.z + .05 + f * .07);
        const insertion = V(side * (width * .9 - f * .012), -.045, .18 + f * .10);
        const line = this._route(this.muscles, 'muscle', 'jaw', [origin, origin.clone().add(V(0, -.2, .1)), origin.clone().add(V(0, -.4, .3))], .029);
        this.updaters.push(() => {
          const end = insertion.clone().applyMatrix4(jaw.matrix);
          const mid = origin.clone().lerp(end, .5).add(V(side * .10, 0, .04));
          line.update([origin, mid, end]);
        });
      }
      return jaw;
    }

    _eye(parent, position, direction, opts = {}) {
      const group = this._group(parent, position);
      group.quaternion.setFromUnitVectors(V(0, 0, 1), direction.clone().normalize());
      const sx = opts.sx || .29, sy = opts.sy || .23, sz = opts.sz || .18;
      this._ellipsoid(group, 'context', opts.channel || null, V(0, 0, 0), V(sx, sy, sz), opts.sclera || 0xddd6ad);
      this._ellipsoid(group, 'context', opts.channel || null, V(0, 0, sz * .89), V(sx * .62, sy * .76, .035), opts.iris || 0xa79f66);
      const pupilScale = opts.pupil === 'horizontal' ? V(sx * .58, sy * .19, .020) :
        opts.pupil === 'vertical' ? V(sx * .16, sy * .65, .022) : V(sx * .38, sy * .49, .023);
      this._ellipsoid(group, 'context', opts.channel || null, V(0, 0, sz + .013), pupilScale, 0x172824);
      this._ellipsoid(group, 'context', null, V(-sx * .22, sy * .29, sz + .038), V(.034, .027, .009), 0xf6f5dc);
      const orbit = this._ring(group, 'bone', opts.channel || null, V(0, 0, -.025), sx * 1.18, sy * 1.22, C.bone, .048);
      if (opts.blink) {
        // Iris, pupil and highlight are flattened ellipsoids in front of the globe.
        // A spherical lid alone intersects their periphery. This forward envelope
        // encloses those actual feature bounds continuously, including half closure.
        const features = [
          {c: V(0, 0, 0), r: V(sx, sy, sz)},
          {c: V(0, 0, sz * .89), r: V(sx * .62, sy * .76, .035)},
          {c: V(0, 0, sz + .013), r: pupilScale},
          {c: V(-sx * .22, sy * .29, sz + .038), r: V(.034, .027, .009)}
        ];
        const lidDepth = (x, y) => {
          const radius = Math.max(0, 1 - (x / (sx + .012)) ** 2 - (y / (sy + .012)) ** 2);
          let z = (sz + .09) * Math.pow(radius, .25);
          for (const {c, r} of features) {
            const q = 1 - ((x - c.x) / r.x) ** 2 - ((y - c.y) / r.y) ** 2;
            if (q >= 0) z = Math.max(z, c.z + r.z * Math.sqrt(q) + .016);
          }
          return z;
        };
        const lids = [];
        for (const upper of [true, false]) {
          const geo = new T.BufferGeometry(), positions = new Float32Array(13 * 25 * 3), idx = [];
          for (let i = 0; i < 12; i++) for (let j = 0; j < 24; j++) {
            const a = i * 25 + j; idx.push(a, a + 25, a + 1, a + 25, a + 26, a + 1);
          }
          geo.setAttribute('position', new T.BufferAttribute(positions, 3)); geo.setIndex(idx);
          this._mesh(geo, group, 'skin', 'blink', opts.skinColor);
          lids.push({geo, positions, upper});
        }
        const edge = this._ring(group, 'muscle', 'blink', V(0, 0, sz * .58), sx * .96, sy * .91, C.muscle, .021);
        const crease = this._ring(group, 'skin', 'blink', V(0, 0, sz * .58), sx * .96, sy * .91, 0x8c806d, .008);
        this.updaters.push(p => {
          const b = p.blink || 0;
          for (const lid of lids) {
            for (let i = 0; i <= 12; i++) for (let j = 0; j <= 24; j++) {
              const boundary = .90 * (1 - b), lat = lid.upper ? boundary + (1 - boundary) * i / 12 : -1 + (1 - boundary) * i / 12;
              const a = -Math.PI / 2 + Math.PI * j / 24, f = Math.sqrt(Math.max(0, 1 - lat * lat)), k = (i * 25 + j) * 3;
              const x = (sx + .012) * f * Math.sin(a), y = (sy + .012) * lat;
              lid.positions[k] = x; lid.positions[k + 1] = y;
              lid.positions[k + 2] = lidDepth(x, y);
            }
            lid.geo.attributes.position.needsUpdate = true; lid.geo.computeVertexNormals(); lid.geo.computeBoundingSphere();
          }
          const pts = [];
          for (let i = 0; i <= 40; i++) {
            const a = i / 40 * Math.PI * 2;
            const x = sx * Math.cos(a), y = sy * .90 * Math.max(.012, 1 - b) * Math.sin(a);
            pts.push(V(x, y, lidDepth(x, y) + .012));
          }
          edge.update(pts); crease.update(pts);
        });
      }
      return {group, orbit};
    }

    _fish() {
      const skinColor = 0xb9c7bd;
      this._cranial(V(0, .12, -.24), V(.73, .99, .94), skinColor);
      this._cranial(V(0, -.09, .62), V(.58, .53, .65), skinColor);
      this._ellipsoid(this.skin, 'skin', null, V(0, .03, -.94), V(.58, .77, .17), 0x9dafa7);
      // Subtle dorsal profile hints make the laterally compressed teleost legible.
      this._route(this.skin, 'skin', null, [V(0, .93, -.8), V(0, 1.14, -.45), V(0, .86, .17)], .035, 0x8a9f94);
      this._jaw({hinge: V(0, -.38, .05), center: V(0, -.14, .60), scale: V(.52, .17, .62), width: .49, front: 1.08, maxAngle: .62, skinColor});
      for (const side of [-1, 1]) {
        this._eye(this.context, V(side * .61, .30, .51), V(side * .87, .1, .5), {sx: .255, sy: .255, sz: .17, iris: 0xc8b176, pupil: 'round'});
        const operculum = this._group(this.dynamic, V(side * .57, .03, -.75));
        this._ellipsoid(operculum, 'skin', 'operculum', V(side * .035, -.06, .38), V(.12, .69, .58), skinColor);
        this._ellipsoid(operculum, 'bone', 'operculum', V(side * .020, -.06, .37), V(.075, .61, .53));
        for (let f = 0; f < 5; f++) {
          this._route(operculum, 'muscle', 'operculum', [V(side * .12, .39 - f * .06, .02), V(side * .14, .2 - f * .11, .31), V(side * .12, .06 - f * .14, .73)], .020);
        }
        // Branchial arches sit medial to the operculum and become exposed as it opens.
        for (let f = 0; f < 6; f++) this._route(this.muscles, 'muscle', 'operculum',
          [V(side * .55, .42, -.49 + f * .09), V(side * .66, -.04, -.48 + f * .09), V(side * .45, -.52, -.43 + f * .09)], .026, 0xb96961);
        this.updaters.push(p => { operculum.rotation.y = side * p.operculum * .75; });
      }
      this._ring(this.skin, 'skin', 'jaw', V(0, -.27, 1.13), .41, .13, 0x8b9c90, .032);
    }

    _frog() {
      const skinColor = 0xc1c8a6;
      this._cranial(V(0, .0, -.13), V(1.10, .53, .84), skinColor);
      this._cranial(V(0, -.08, .54), V(.98, .31, .56), skinColor);
      this._jaw({hinge: V(0, -.27, -.37), center: V(0, -.08, .59), scale: V(.98, .15, .82), width: .91, front: 1.30, maxAngle: .75, skinColor});
      for (const side of [-1, 1]) {
        this._ellipsoid(this.skin, 'skin', 'eyeRetract', V(side * .64, .40, .14), V(.43, .30, .43), skinColor);
        const eye = this._eye(this.dynamic, V(side * .65, .60, .28), V(side * .48, .3, .83),
          {channel: 'eyeRetract', sx: .33, sy: .32, sz: .28, iris: 0xb8a25f, pupil: 'horizontal'});
        const anchor = eye.group.position.clone();
        // Keep the orbital support fixed while the eyeball moves into the skull.
        eye.group.updateMatrix(); eye.orbit.mesh.applyMatrix4(eye.group.matrix); this.bones.add(eye.orbit.mesh);
        this.updaters.push(p => { eye.group.position.copy(anchor).add(V(0, -.30 * p.eyeRetract, -.15 * p.eyeRetract)); });
        for (let f = 0; f < 3; f++) {
          const start = V(side * (.46 + f * .06), -.05, -.16);
          const route = this._route(this.muscles, 'muscle', 'eyeRetract', [start, start.clone().add(V(0, .2, .1)), anchor], .026);
          this.updaters.push(() => route.update([start, start.clone().lerp(eye.group.position, .55).add(V(side * .06, 0, -.05)), eye.group.position.clone().add(V(0, -.13, -.10))]));
        }
        this._ellipsoid(this.skin, 'skin', null, V(side * .35, .12, .96), V(.055, .034, .025), 0x5d6c50);
        // Sparse dorsolateral markings establish silhouette without pretending to map tissue.
        for (let j = 0; j < 3; j++) this._ellipsoid(this.skin, 'skin', null,
          V(side * (.87 - j * .09), .25 + j * .035, -.36 - j * .15), V(.075, .025, .095), 0x84966c);
      }
      const throat = this._group(this.dynamic, V(0, -.44, .23));
      // Modest buccal-floor depression: this is not an inflated vocal sac.
      const floor = this._ellipsoid(throat, 'skin', 'throat', V(0, -.05, 0), V(.69, .12, .60), 0xd7d0ae);
      this.updaters.push(p => { floor.scale.set(.69, .12 + p.throat * .035, .60); floor.position.y = -.05 - p.throat * .12; });
      for (let f = -3; f <= 3; f++) {
        const route = this._route(throat, 'muscle', 'throat', [V(f * .17, 0, -.4), V(f * .15, -.18, .03), V(f * .13, -.01, .55)], .017);
        this.updaters.push(p => route.update([V(f * .17, 0, -.4), V(f * .15, -.15 - p.throat * .12, .06), V(f * .13, -.01, .55)]));
      }
      const hyoid = this._route(throat, 'bone', 'throat', [V(-.48, -.035, -.15), V(0, -.08, .17), V(.48, -.035, -.15)], .037);
      this.updaters.push(p => hyoid.update([V(-.48, -.035, -.15), V(0, -.08 - p.throat * .12, .17), V(.48, -.035, -.15)]));
    }

    _lizard() {
      const skinColor = 0xc0c5a8;
      this._cranial(V(0, .17, -.31), V(.66, .61, .80), skinColor);
      this._cranial(V(0, .02, .56), V(.52, .31, .85), skinColor);
      this._cranial(V(0, -.01, 1.13), V(.37, .24, .39), skinColor);
      this._ellipsoid(this.skin, 'skin', null, V(0, -.17, -1.00), V(.52, .59, .50), skinColor);
      this._jaw({hinge: V(0, -.25, -.39), center: V(0, -.07, .88), scale: V(.49, .12, .99), width: .48, front: 1.74, maxAngle: .57, skinColor});
      for (const side of [-1, 1]) {
        this._eye(this.context, V(side * .59, .30, .10), V(side * .88, .10, .47), {blink: true, iris: 0xb49f62, skinColor});
        this._ellipsoid(this.skin, 'skin', null, V(side * .28, .115, 1.35), V(.045, .025, .025), 0x59634e);
        this._route(this.skin, 'skin', null, [V(side * .42, .03, -.74), V(side * .55, -.10, .30), V(side * .25, -.12, 1.42)], .012, 0x8c967b);
      }
      const membrane = new T.BufferGeometry(), positions = new Float32Array(3 * 19), indices = [];
      for (let i = 1; i < 18; i++) indices.push(0, i, i + 1);
      membrane.setAttribute('position', new T.BufferAttribute(positions, 3)); membrane.setIndex(indices);
      const dew = this._mesh(membrane, this.dynamic, 'skin', 'dewlap', 0xc68867);
      const hyoid = this._route(this.dynamic, 'bone', 'dewlap', [V(0, -.3, -.36), V(0, -.44, .18), V(0, -.48, .8)], .036);
      const rays = [];
      // These are membrane folds, not a fan of muscle fibers. The small driver
      // routes at the hyoid base stand for the ceratohyoid mechanism schematically.
      for (let i = 0; i < 7; i++) rays.push(this._route(this.dynamic, 'skin', 'dewlap', [V(.018, -.34, -.30), V(.018, -.44, .15), V(.018, -.5, .6)], .009, 0x9e8068));
      const drivers = [-1, 1].map(side => ({side, route: this._route(this.dynamic, 'muscle', 'dewlap',
        [V(side * .12, -.32, -.52), V(side * .10, -.43, -.30), V(side * .025, -.46, -.12)], .035)}));
      this.updaters.push(p => {
        const d = p.dewlap, anchor = V(0, -.34, -.34), rim = [];
        positions.set([anchor.x, anchor.y, anchor.z], 0);
        for (let i = 0; i < 18; i++) {
          const a = i / 17 * Math.PI;
          const point = V(.015 * Math.sin(a), -.39 - Math.sin(a) * (.09 + 1.03 * d), -.35 + i / 17 * (1.18 + .22 * d));
          positions.set([point.x, point.y, point.z], (i + 1) * 3); rim.push(point);
        }
        membrane.attributes.position.needsUpdate = true; membrane.computeVertexNormals(); membrane.computeBoundingSphere();
        hyoid.update([anchor, rim[9].clone().add(V(0, .025, 0)), rim[17]]);
        rays.forEach((r, i) => { const end = rim[3 + i * 2].clone().add(V(.025, 0, 0)); r.update([anchor.clone().add(V(.025, 0, 0)), anchor.clone().lerp(end, .55).add(V(.04, 0, 0)), end]); });
        drivers.forEach(({side, route}) => route.update([V(side * .12, -.32, -.52),
          V(side * .10, -.43 - d * .07, -.30), V(side * .025, -.46 - d * .12, -.12 + d * .06)]));
      });
      this.rig.dewlap = dew;
    }

    _ear(parent, side, dog, skinColor) {
      const ear = this._group(parent, V(side * .65, .73, -.17));
      const geometry = new T.BufferGeometry();
      // A softly rounded cupped triangular pinna, front and back connected.
      const p = [], idx = [], rows = 18, cols = 16;
      for (let surface = 0; surface < 2; surface++) for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
        const h = i / rows, u = j / cols * 2 - 1, half = (.35 * (1 - h) + .018) * (dog ? 1.02 : 1);
        p.push(u * half + side * .16 * h, h * (dog ? .88 : .94), .10 * Math.sin(Math.PI * h) - .07 * u * u + (surface === 0 ? .065 : -.055));
      }
      const faceSize = (rows + 1) * (cols + 1);
      for (let s = 0; s < 2; s++) for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        const a = s * faceSize + i * (cols + 1) + j, b = a + cols + 1;
        if (!s) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
      for (let i = 0; i < rows; i++) for (const j of [0, cols]) {
        const a = i * (cols + 1) + j, b = a + cols + 1; idx.push(a, a + faceSize, b, b, a + faceSize, b + faceSize);
      }
      geometry.setAttribute('position', new T.Float32BufferAttribute(p, 3)); geometry.setIndex(idx); geometry.computeVertexNormals();
      this._mesh(geometry, ear, 'skin', 'ears', skinColor);
      const inner = geometry.clone(); const ip = inner.attributes.position;
      for (let i = 0; i < ip.count; i++) { ip.setX(i, ip.getX(i) * .78); ip.setY(i, ip.getY(i) * .82 + .065); ip.setZ(i, ip.getZ(i) + .012); }
      inner.computeVertexNormals(); this._mesh(inner, ear, 'context', 'ears', 0xb99889);
      this._route(ear, 'bone', 'ears', [V(-.29, 0, .04), V(-.13, .47, .07), V(side * .16, dog ? .85 : .9, .02), V(.23, .37, .06), V(.30, 0, .04)], .029, C.bone);
      for (let i = 0; i < 3; i++) this._route(ear, 'muscle', 'ears', [V(side * .05, -.14, -.02), V((i - 1) * .13, .16, .09), V((i - 1) * .12 + side * .05, .43, .10)], .022);
      this.updaters.push(pose => { ear.rotation.z = side * (-.12 - .72 * pose.ears); ear.rotation.x = -.13 - .76 * pose.ears; ear.rotation.y = side * .34 * pose.ears; });
      return ear;
    }

    _mammal(id) {
      const dog = id === 'dog', skinColor = dog ? 0xcdbb9d : 0xddd0b9;
      this._cranial(V(0, .13, -.15), V(dog ? .94 : 1.00, dog ? .93 : .91, .83), skinColor);
      this._cranial(V(0, -.37, -.57), V(.72, .68, .61), skinColor);
      const snout = dog ? 1.04 : .73, snoutWidth = dog ? .51 : .47;
      this._cranial(V(0, -.19, snout), V(snoutWidth, .34, dog ? .65 : .36), skinColor);
      this._jaw({hinge: V(0, -.37, -.36), center: V(0, -.20, dog ? .91 : .69), scale: V(dog ? .54 : .58, .22, dog ? .95 : .73), width: dog ? .66 : .69, front: dog ? 1.73 : 1.30, maxAngle: dog ? .64 : .68, skinColor});
      const jaw = this.rig.jaw;
      // Small teeth anchor to their owning jaw; size and count are illustrative.
      for (const side of [-1, 1]) {
        for (let i = 0; i < (dog ? 4 : 3); i++) {
          const tooth = this._mesh(new T.ConeGeometry(i === 0 ? .065 : .035, i === 0 ? .23 : .09, 12), jaw, 'bone', 'jaw');
          tooth.position.set(side * (dog ? .38 : .40), .04, (dog ? 1.27 : .93) - i * .19);
        }
        const upperTooth = this._mesh(new T.ConeGeometry(.067, .24, 12), this.bones, 'bone', 'jaw');
        upperTooth.rotation.z = Math.PI; upperTooth.position.set(side * (dog ? .38 : .40), -.43, dog ? 1.02 : .71);
        this._eye(this.context, V(side * (dog ? .54 : .53), dog ? .35 : .29, .55), V(side * .39, .02, .94),
          {blink: true, sx: dog ? .25 : .30, sy: dog ? .21 : .225, iris: dog ? 0x9a8060 : 0xb7a96b, pupil: dog ? 'round' : 'vertical', skinColor});
        this._ear(this.dynamic, side, dog, skinColor);
      }
      const noseZ = dog ? 1.62 : 1.04;
      const nose = this._ellipsoid(this.skin, 'skin', 'lip', V(0, -.10, noseZ), V(dog ? .27 : .17, dog ? .17 : .115, .13), dog ? 0x55564e : 0x9f7c70);
      for (const side of [-1, 1]) {
        const pad = this._group(this.dynamic, V(side * .27, -.32, dog ? 1.33 : .89));
        this._ellipsoid(pad, 'skin', 'lip', V(0, 0, 0), V(dog ? .33 : .34, .23, dog ? .35 : .24), skinColor);
        const lipRoute = this._route(pad, 'muscle', 'lip', [V(side * .02, .10, .23), V(side * .18, .03, .22), V(side * .22, -.14, .11)], .025);
        this.updaters.push(p => { pad.position.y = -.32 + .16 * p.lip; pad.position.x = side * (.27 + .075 * p.lip); pad.rotation.z = side * .10 * p.lip; });
        const smile = this._route(pad, 'skin', 'lip', [V(-side * .20, -.14, .18), V(side * .04, -.18, .25), V(side * .24, -.11, .13)], .017, 0x7f7265);
        for (let r = 0; r < 3; r++) for (let j = 0; j < 3; j++) this._ellipsoid(pad, 'skin', 'whiskers', V(side * (j * .065 - .03), -.065 + r * .05, .239 - j * .008), V(.014, .012, .012), 0x8b7d6b);
        const whisker = this._group(pad, V(side * .13, 0, .18));
        for (let i = 0; i < (dog ? 4 : 6); i++) {
          const y = (i - 2.5) * .048, length = (dog ? .58 : .86) * (1 - .07 * Math.abs(i - 2));
          this._route(whisker, 'context', 'whiskers', [V(0, y, 0), V(side * length * .46, y + (i - 2.5) * .025, .06), V(side * length, y + (i - 2.5) * .08, -.05)], .009, 0x5c6960, {radial: 5, segments: 18});
        }
        this._route(pad, 'muscle', 'whiskers', [V(side * .22, -.09, .13), V(side * .14, .02, .24), V(side * .04, .13, .22)], .020);
        this.updaters.push(p => { whisker.rotation.y = -side * p.whiskers * .80; whisker.rotation.z = side * p.whiskers * .12; });
        // Levator route terminates at the mobile lip pad.
        const upper = V(side * .44, .20, .77);
        for (let i = 0; i < 3; i++) {
          const route = this._route(this.muscles, 'muscle', 'lip', [upper, V(side * .51, -.04, dog ? 1.07 : .92), V(side * .45, -.22, dog ? 1.45 : 1.03)], .021);
          this.updaters.push(p => route.update([upper.clone().add(V(side * .035 * i, 0, 0)), V(side * (.51 + .02 * i), -.04 + p.lip * .06, dog ? 1.07 : .92), V(side * (.45 + p.lip * .075), -.22 + p.lip * .16, dog ? 1.45 : 1.03)]));
        }
        if (dog) {
          const brow = this._group(this.dynamic, V(side * .36, .62, .60));
          this._ellipsoid(brow, 'skin', 'brow', V(0, 0, 0), V(.18, .085, .12), skinColor);
          const route = this._route(this.muscles, 'muscle', 'brow', [V(side * .30, .91, .34), V(side * .28, .72, .57), V(side * .37, .60, .67)], .040);
          this.updaters.push(p => {
            brow.position.y = .62 + p.brow * .17; brow.rotation.z = -side * .24 * p.brow;
            route.update([V(side * .30, .91, .34), V(side * .28, .75 + p.brow * .07, .57), V(side * .37, .60 + p.brow * .17, .67)]);
          });
        }
      }
      this.updaters.push(p => { nose.position.y = -.10 + .04 * p.lip; });
      // Broad zygomatic reference arches remain fixed to the cranial frame.
      for (const side of [-1, 1]) this._route(this.bones, 'bone', null,
        [V(side * .72, .22, -.42), V(side * .91, -.10, .15), V(side * .61, -.25, dog ? .84 : .64)], .070);
    }

    setPose(pose = {}) {
      for (const channel of SPECIES[this.species]) if (Object.prototype.hasOwnProperty.call(pose, channel)) this.pose[channel] = clamp(pose[channel]);
      this.updaters.forEach(update => update(this.pose));
      this.root.updateMatrixWorld(true); this._updateMaterials(); return this;
    }

    _updateMaterials() {
      this._dirty = true;
      const exposed = this.layers.muscles || this.layers.bones;
      for (const mat of this.materials) {
        const {layer, channel, baseColor} = mat.userData;
        mat.color.copy(baseColor);
        if (layer === 'muscle') {
          const intensity = channel ? this.pose[channel] || 0 : 0;
          if (intensity > 0) mat.color.lerp(new T.Color(C.active), .30 + .70 * intensity);
          if (channel && channel === this.selected) mat.color.copy(new T.Color(C.selected));
          mat.emissive.copy(mat.color).multiplyScalar(channel === this.selected ? .10 : .015);
        } else mat.emissive.setHex(0x000000);
        // Transparent surface only when looking through it to deeper structures.
        const opacity = layer === 'skin' && exposed ? .22 : 1;
        if (mat.opacity !== opacity || mat.transparent !== (opacity < 1)) {
          mat.opacity = opacity; mat.transparent = opacity < 1; mat.depthWrite = opacity === 1; mat.needsUpdate = true;
        }
      }
    }

    setLayers(layers = {}) {
      for (const key of ['skin', 'muscles', 'bones']) if (key in layers) this.layers[key] = !!layers[key];
      const any = this.layers.skin || this.layers.muscles || this.layers.bones;
      for (const mesh of this.meshes) {
        const layer = mesh.userData.layer;
        mesh.visible = layer === 'skin' ? this.layers.skin : layer === 'muscle' ? this.layers.muscles : layer === 'bone' ? this.layers.bones : any;
      }
      this._updateMaterials(); return this;
    }

    setView(view) {
      if (view === 'front') { this.yaw = 0; this.pitch = .04; }
      else if (view === 'side') { this.yaw = Math.PI / 2; this.pitch = .08; }
      else { this.yaw = .66; this.pitch = .18; }
      this.distance = 6.7; this._updateCamera(); this._dirty = true; return this;
    }

    selectChannel(id) { this.selected = SPECIES[this.species].includes(id) ? id : null; this._updateMaterials(); return this; }

    resize() {
      if (this.disposed) return;
      const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight || 500);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h, false);
      this._dirty = true;
    }

    getDiagnostics() {
      this.root.updateMatrixWorld(true);
      let finite = true, vertexCount = 0;
      // Quantized FNV signatures describe real geometry and world transforms, never
      // pose values or visibility. Useful for regression tests, not anatomy validation.
      const hashes = Object.fromEntries(SPECIES[this.species].map(k => [k, 2166136261]));
      let all = 2166136261;
      const add = (h, value) => { finite = finite && Number.isFinite(value); return Math.imul(h ^ Math.round(value * 100000), 16777619) >>> 0; };
      for (const mesh of this.meshes) {
        const pos = mesh.geometry.attributes.position;
        vertexCount += pos.count;
        let hash = 2166136261;
        for (const v of mesh.matrixWorld.elements) hash = add(hash, v);
        for (let i = 0; i < pos.array.length; i++) hash = add(hash, pos.array[i]);
        all = Math.imul(all ^ hash, 16777619) >>> 0;
        if (mesh.userData.channel in hashes) hashes[mesh.userData.channel] = Math.imul(hashes[mesh.userData.channel] ^ hash, 16777619) >>> 0;
      }
      Object.values(this.pose).forEach(v => { finite = finite && Number.isFinite(v) && v >= 0 && v <= 1; });
      return {species: this.species, pose: {...this.pose}, layers: {...this.layers}, finite,
        meshCount: this.meshes.length, vertexCount, geometrySignature: all.toString(16),
        channelSignatures: Object.fromEntries(Object.entries(hashes).map(([k, v]) => [k, v.toString(16)])),
        selected: this.selected, illustrative: true};
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true; cancelAnimationFrame(this._frame);
      if (this._resizeObserver) this._resizeObserver.disconnect();
      this._events.forEach(([name, fn, opts]) => this.canvas.removeEventListener(name, fn, opts));
      this._freeModel(); this.renderer.dispose(); this.canvas.remove();
    }
  }
  window.AnimalViewer = AnimalViewer;
})();
