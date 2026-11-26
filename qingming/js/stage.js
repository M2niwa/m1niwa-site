// Three.js 舞台：水墨背景 + 余烬 + 器物检视 + 行者 + 缩略图
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeProc, glowTexture, ensoTexture, smokeTexture, inkStrokeTexture } from './proc.js';

const BG_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BG_FRAG = /* glsl */`
precision highp float;
uniform float uTime; uniform vec2 uRes; uniform vec3 uTint; uniform float uFocus;
varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
float ridge(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { float n = 1.0 - abs(noise(p) * 2.0 - 1.0); v += a * n * n; p *= 2.1; a *= 0.5; } return v; }
void main() {
  vec2 uv = vUv; float asp = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * asp, uv.y);
  vec3 deep = vec3(0.028, 0.022, 0.017);
  vec3 silk = vec3(0.22, 0.165, 0.11);
  float glow = smoothstep(1.15, 0.0, length((uv - vec2(uFocus, 0.6)) * vec2(asp * 0.75, 1.25)));
  vec3 col = mix(deep, silk, glow * 0.85);
  // 远山三重，越近越浓
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float h = 0.62 - fi * 0.13 + 0.22 * ridge(vec2(p.x * (0.9 + fi * 0.6) + fi * 17.3 + uTime * 0.004 * (fi + 1.0), fi * 3.1));
    float edge = 0.006 + 0.03 * (2.0 - fi) * 0.5;
    float m = smoothstep(h + edge, h - edge, uv.y);
    float mist = smoothstep(h - 0.3 + fi * 0.05, h, uv.y);
    vec3 inkc = mix(vec3(0.05, 0.04, 0.03), vec3(0.11, 0.085, 0.06), 1.0 - fi / 2.0);
    float tx = 0.75 + 0.5 * fbm(p * vec2(6.0, 14.0) + fi * 9.0);
    col = mix(col, inkc * tx, m * (0.25 + 0.5 * mist) * (0.55 + fi * 0.2));
  }
  // 流云
  float fog = fbm(p * 1.6 + vec2(uTime * 0.018, uTime * 0.004));
  col += vec3(0.16, 0.12, 0.08) * smoothstep(0.5, 0.95, fog) * 0.35 * (1.1 - uv.y);
  // 绢纹
  col *= 0.94 + 0.08 * noise(vec2(uv.x * uRes.x * 0.6, uv.y * 3.0));
  col *= uTint;
  float v = smoothstep(1.3, 0.3, length((uv - 0.5) * vec2(asp * 0.85, 1.05)));
  col *= mix(0.3, 1.0, v);
  col += (hash(uv * uRes + fract(uTime * 7.0)) - 0.5) * 0.022;
  gl_FragColor = vec4(col, 1.0);
}`;

const EMBER_VERT = /* glsl */`
attribute vec4 aSeed; uniform float uTime; uniform float uPR; varying float vA;
void main() {
  float t = uTime * (0.012 + aSeed.z * 0.03);
  float y = fract(aSeed.y + t) * 2.5 - 1.25;
  float x = aSeed.x * 2.2 - 1.1 + sin(uTime * (0.3 + aSeed.w * 0.5) + aSeed.y * 20.0) * 0.035 + (y + 1.2) * 0.06;
  gl_Position = vec4(x, y, 0.0, 1.0);
  gl_PointSize = (1.0 + aSeed.w * aSeed.w * 3.4) * uPR;
  float flick = 0.5 + 0.5 * sin(uTime * (1.5 + aSeed.z * 5.0) + aSeed.x * 40.0);
  vA = (0.2 + 0.8 * flick) * smoothstep(-1.25, -0.7, y) * smoothstep(1.25, 0.4, y);
}`;
const EMBER_FRAG = /* glsl */`
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vec3(1.0, 0.52, 0.2) * 1.3, a * vA * 0.75);
}`;

const TINTS = {
  hero: [new THREE.Vector3(1.05, 0.97, 0.9), 0.5],
  bag: [new THREE.Vector3(1.0, 0.97, 0.92), 0.66],
  map: [new THREE.Vector3(0.72, 0.74, 0.78), 0.45],
  files: [new THREE.Vector3(1.12, 0.96, 0.8), 0.7],
};

const HERO_COLORS = {
  Black: [0x16120f, 0.95, 0], Brown2: [0x2b2119, 0.95, 0], LightBrown: [0x4c3624, 0.9, 0],
  DarkBrown: [0x1c1511, 0.95, 0], Brown: [0x120e0b, 0.95, 0], Skin: [0xa07a5e, 0.7, 0],
  Gold: [0xc0903e, 0.35, 0.85], Metal: [0x9a9890, 0.3, 0.9], Metal_Dark: [0x3d3b37, 0.45, 0.8], White: [0x6e655a, 0.85, 0],
};

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export class Stage {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.autoClear = false;

    this.clock = new THREE.Clock();
    this.loader = new GLTFLoader();
    this.cache = new Map();
    this.anchors = {};
    this.view = 'bag';
    this.tint = TINTS.bag[0].clone();
    this.focus = TINTS.bag[1];
    this.thumbJobs = [];
    this.onProgress = null;

    const pmrem = new THREE.PMREMGenerator(r);
    this.envTex = pmrem.fromScene(new RoomEnvironment(r), 0.04).texture;

    this._initBackground();
    this._initItemScene();
    this._initHeroScene();
    this._initThumbScene();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ---------------- 背景 ----------------
  _initBackground() {
    this.bgScene = new THREE.Scene();
    this.bgCam = new THREE.Camera();
    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: BG_VERT, fragmentShader: BG_FRAG, depthWrite: false, depthTest: false,
      uniforms: { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uFocus: { value: 0.66 } },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    quad.frustumCulled = false;
    this.bgScene.add(quad);

    const N = 160;
    const seeds = new Float32Array(N * 4);
    for (let i = 0; i < N * 4; i++) seeds[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.emberMat = new THREE.ShaderMaterial({
      vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uPR: { value: 1 } },
    });
    const pts = new THREE.Points(g, this.emberMat);
    pts.frustumCulled = false;
    this.bgScene.add(pts);
  }

  _lights(scene, { key = 60, rim = 2.2, hemi = 0.5, shadow = true } = {}) {
    scene.environment = this.envTex;
    const h = new THREE.HemisphereLight(0x6b5640, 0x0b0907, hemi);
    const k = new THREE.SpotLight(0xffc98f, key, 0, 0.55, 0.7, 2);
    k.position.set(-2.6, 4.6, 3.2);
    if (shadow) {
      k.castShadow = true; k.shadow.mapSize.set(1024, 1024); k.shadow.bias = -0.0004; k.shadow.radius = 4;
    }
    const rm = new THREE.DirectionalLight(0xe2c18a, rim);
    rm.position.set(2.5, 2.4, -4);
    const fill = new THREE.DirectionalLight(0x8296b0, 0.35);
    fill.position.set(3, 1, 3);
    scene.add(h, k, k.target, rm, fill);
    return { h, k, rm, fill };
  }

  // ---------------- 器物检视 ----------------
  _initItemScene() {
    const s = this.itemScene = new THREE.Scene();
    this.itemCam = new THREE.PerspectiveCamera(27, 1, 0.1, 60);
    this.itemDist = 5.6;
    this.itemLights = this._lights(s, { key: 70, rim: 2.4 });
    this.itemLights.k.target.position.set(0, -0.2, 0);

    const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), new THREE.MeshBasicMaterial({
      map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55,
    }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = -1.12;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.55 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.11; shadow.receiveShadow = true;
    s.add(pool, shadow);

    this.itemRoot = new THREE.Group();
    s.add(this.itemRoot);
    this.itemSpin = { yaw: 0.4, pitch: 0, vy: 0, auto: true, idle: 0, dragging: false };
    this.itemCurrent = null;
    this.leaving = [];
    this.itemToken = 0;

    // 背后的屏风
    this.loadModel('chinese_screen_panels').then((src) => {
      const screen = src.clone(true);
      const box = new THREE.Box3().setFromObject(screen);
      const size = box.getSize(new THREE.Vector3());
      const k = 3.4 / size.y;
      screen.scale.setScalar(k);
      screen.position.set(-box.getCenter(new THREE.Vector3()).x * k + 0.4, -1.12 - box.min.y * k, -3.6);
      screen.rotation.y = -0.18;
      screen.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.color.multiplyScalar(0.55);
          o.material.envMapIntensity = 0.15;
          o.castShadow = false;
        }
      });
      s.add(screen);
    }).catch(() => {});
    const back = new THREE.PointLight(0xff9a50, 6, 8, 2);
    back.position.set(1.6, 0.6, -2.2);
    s.add(back);
  }

  async showItem(defId, def) {
    const token = ++this.itemToken;
    const obj = await this.buildItem(def, def.view || {}, 'view');
    if (token !== this.itemToken) return;
    this._retire();
    const holder = new THREE.Group();
    holder.add(obj);
    holder.scale.setScalar(0.001);
    this.itemRoot.add(holder);
    this.itemCurrent = { holder, t: 0, id: defId };
    this.itemSpin.pitch = 0;
  }

  _retire() {
    if (this.itemCurrent) {
      this.itemCurrent.leaving = 0;
      this.leaving.push(this.itemCurrent);
    }
    this.itemCurrent = null;
  }

  clearItem() {
    this.itemToken++;
    this._retire();
  }

  // ---------------- 行者 ----------------
  _initHeroScene() {
    const s = this.heroScene = new THREE.Scene();
    this.heroCam = new THREE.PerspectiveCamera(25, 1, 0.1, 60);
    const L = this._lights(s, { key: 110, rim: 6.5, hemi: 0.16 });
    L.k.position.set(-3.8, 3.8, 1.6);
    L.k.angle = 0.42;
    L.k.target.position.set(0, 0.9, 0);
    L.rm.position.set(-2.6, 3.2, -4.0);
    L.fill.intensity = 0.1;
    const rim2 = new THREE.DirectionalLight(0xa9bcd0, 4.2);
    rim2.position.set(3.4, 2.6, -3.0);
    s.add(rim2);

    const stroke = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), new THREE.MeshBasicMaterial({
      map: inkStrokeTexture(), transparent: true, depthWrite: false, toneMapped: false,
    }));
    stroke.position.set(0.1, 1.25, -1.6);
    s.add(stroke);
    const enso = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({
      map: ensoTexture(), transparent: true, depthWrite: false, opacity: 0.55, color: 0xe8c98a,
    }));
    enso.rotation.x = -Math.PI / 2; enso.position.y = 0.005;
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({
      map: glowTexture('rgba(255,190,120,.4)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6,
    }));
    pool.rotation.x = -Math.PI / 2;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.6 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; shadow.receiveShadow = true;
    s.add(pool, enso, shadow);

    // 足下烟
    const smokeTex = smokeTexture();
    this.smoke = [];
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x8a7458, transparent: true, opacity: 0.0, depthWrite: false }));
      sp.userData = { a: Math.random() * Math.PI * 2, r: 0.5 + Math.random() * 0.9, sp: 0.05 + Math.random() * 0.08, ph: Math.random() };
      s.add(sp); this.smoke.push(sp);
    }

    this.heroRoot = new THREE.Group();
    s.add(this.heroRoot);
    this.heroSpin = { yaw: -0.35, vy: 0, dragging: false, idle: 0 };
    this.mixer = null;
    this.actions = {};
    this.heroReady = this._loadHero();
  }

  async _loadHero() {
    const gltf = await this.loader.loadAsync('assets/models/hooded_adventurer/hooded_adventurer.json');
    const model = gltf.scene;
    // 蒙皮网格需先算出骨骼矩阵，包围盒才准确
    model.updateMatrixWorld(true);
    model.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.boundingBox = null; } });
    const box = new THREE.Box3().setFromObject(model);
    const h = box.getSize(new THREE.Vector3()).y;
    const k = 1.85 / h;
    model.scale.setScalar(k);
    model.position.y = -box.min.y * k;
    model.updateMatrixWorld(true);
    const outline = (thick) => {
      const m = new THREE.MeshBasicMaterial({ color: 0x060504, side: THREE.BackSide });
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normal * ${thick.toExponential(4)};`);
      };
      m.customProgramCacheKey = () => 'outline' + thick.toExponential(4);
      return m;
    };
    const meshes = [];
    model.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const tmp = new THREE.Vector3();
    for (const o of meshes) {
      o.geometry.computeBoundingBox();
      const local = o.geometry.boundingBox.getSize(tmp).length();
      const world = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).length();
      const thick = 0.011 * (local / Math.max(world, 1e-6));
      const outlineMat = outline(thick);
      o.castShadow = true; o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const fixed = mats.map((m) => {
        const c = HERO_COLORS[m.name];
        const nm = new THREE.MeshStandardMaterial({
          color: c ? c[0] : m.color, roughness: c ? c[1] : 0.8, metalness: c ? c[2] : 0, envMapIntensity: 0.6,
        });
        nm.name = m.name;
        return nm;
      });
      o.material = Array.isArray(o.material) ? fixed : fixed[0];
      const line = o.clone();
      line.material = outlineMat;
      line.castShadow = false; line.receiveShadow = false;
      o.parent.add(line);
    }
    this.heroRoot.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) this.actions[clip.name.split('|').pop()] = this.mixer.clipAction(clip);
    const idle = this.actions.Idle_Sword || this.actions.Idle;
    if (idle) idle.play();
    this.heroIdle = idle;
    this.mixer.addEventListener('finished', (e) => {
      if (this.heroIdle && e.action !== this.heroIdle) {
        this.heroIdle.reset().fadeIn(0.3).play();
        e.action.fadeOut(0.3);
      }
    });
    return true;
  }

  heroStrike() {
    const a = this.actions.Sword_Slash;
    if (!a || !this.heroIdle) return;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    a.fadeIn(0.12).play();
    this.heroIdle.fadeOut(0.12);
  }

  // ---------------- 模型与缩略图 ----------------
  loadModel(id) {
    if (!this.cache.has(id)) {
      const p = this.loader.loadAsync(`assets/models/${id}/${id}.json`).then((g) => {
        g.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => { m.envMapIntensity = 0.55; });
          }
        });
        return g.scene;
      });
      this.cache.set(id, p);
    }
    return this.cache.get(id);
  }

  async buildItem(def, pose, mode) {
    let base;
    if (def.model) {
      const src = await this.loadModel(def.model);
      const part = def.node && src.getObjectByName(def.node);
      if (part) { base = part.clone(true); base.position.set(0, 0, 0); }
      else base = src.clone(true);
    } else base = makeProc(def.proc, def.procColor);
    if (def.align === 'x') {
      const s0 = new THREE.Box3().setFromObject(base).getSize(new THREE.Vector3());
      if (s0.y >= s0.x && s0.y >= s0.z) base.rotation.z = Math.PI / 2;
      else if (s0.z >= s0.x) base.rotation.y = Math.PI / 2;
    }
    const posed = new THREE.Group();
    posed.add(base);
    posed.rotation.set(pose.rx || 0, pose.ry || 0, pose.rz || 0);
    const wrap = new THREE.Group();
    wrap.add(posed);
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(posed);
    const center = box.getCenter(new THREE.Vector3());
    if (mode === 'view') {
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const k = 1.05 / sphere.radius;
      posed.scale.setScalar(k);
      posed.position.copy(center).multiplyScalar(-k);
    } else {
      posed.position.copy(center).multiplyScalar(-1);
    }
    wrap.userData.box = box;
    return wrap;
  }

  _initThumbScene() {
    const s = this.thumbScene = new THREE.Scene();
    s.environment = this.envTex;
    s.add(new THREE.HemisphereLight(0x8a7458, 0x120e0a, 1.1));
    const k = new THREE.DirectionalLight(0xffd6a0, 3.2); k.position.set(-2, 3, 4);
    const rm = new THREE.DirectionalLight(0xe8c890, 2.0); rm.position.set(3, 2, -3);
    s.add(k, rm);
    this.thumbCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  }

  thumbnail(def, w, h) {
    return this.buildItem(def, def.thumb || {}, 'thumb').then((obj) => new Promise((resolve, reject) => {
      this.thumbJobs.push({ obj, w, h, resolve, reject });
    }));
  }

  _renderThumb(job) {
    const r = this.renderer;
    const CELL = 72;
    const pw = job.w * CELL, ph = job.h * CELL;
    const box = job.obj.userData.box;
    const size = box.getSize(new THREE.Vector3());
    const aspect = pw / ph;
    let hh = Math.max(size.y, size.x / aspect) / 2 * 1.12;
    let hw = hh * aspect;
    const cam = this.thumbCam;
    cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh;
    cam.position.set(0, 0, 50); cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    this.thumbScene.add(job.obj);
    r.setScissorTest(true);
    r.setViewport(0, 0, pw, ph); r.setScissor(0, 0, pw, ph);
    r.setClearColor(0x000000, 0); r.clear(true, true, true);
    r.render(this.thumbScene, cam);
    const dpr = r.getPixelRatio();
    const c = document.createElement('canvas');
    c.width = Math.round(pw * dpr); c.height = Math.round(ph * dpr);
    c.getContext('2d').drawImage(r.domElement, 0, r.domElement.height - c.height, c.width, c.height, 0, 0, c.width, c.height);
    this.thumbScene.remove(job.obj);
    job.resolve(c.toDataURL('image/png'));
  }

  // ---------------- 交互 ----------------
  bindAnchor(name, el, { onTap } = {}) {
    this.anchors[name] = el;
    const spin = name === 'item' ? this.itemSpin : this.heroSpin;
    let sx = 0, sy = 0, lx = 0, ly = 0, moved = false, id = null;
    el.addEventListener('pointerdown', (e) => {
      id = e.pointerId; el.setPointerCapture(id);
      sx = lx = e.clientX; sy = ly = e.clientY; moved = false; spin.dragging = true; spin.vy = 0;
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 5) moved = true;
      spin.yaw += dx * 0.01; spin.vy = dx * 0.01;
      if ('pitch' in spin) spin.pitch = THREE.MathUtils.clamp(spin.pitch + dy * 0.008, -1.1, 1.1);
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; spin.dragging = false; spin.idle = 0;
      if (!moved && onTap) onTap();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    if (name === 'item') {
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.itemDist = THREE.MathUtils.clamp(this.itemDist + Math.sign(e.deltaY) * 0.35, 3.4, 8);
      }, { passive: false });
    }
  }

  setView(view) {
    this.view = view;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (!w || !h) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(w, h, false);
    this.bgMat.uniforms.uRes.value.set(w, h);
    this.emberMat.uniforms.uPR.value = this.renderer.getPixelRatio();
  }

  // 整屏绘制，但把镜头光心移到锚点中央，并按锚点高度换算视角，物件不被裁切
  _renderInto(el, scene, cam, baseFov) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight;
    if (rect.width < 8 || rect.height < 8 || rect.bottom < 0 || rect.top > H) return;
    const r = this.renderer;
    const fit = Math.min(rect.height, rect.width * 0.9);
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) * H / fit);
    cam.fov = THREE.MathUtils.radToDeg(half * 2);
    cam.aspect = W / H;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    cam.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    cam.updateProjectionMatrix();
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    r.clearDepth();
    r.render(scene, cam);
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const r = this.renderer;

    // 画布尺寸随窗口变化（面板初次显示时可能为 0）
    const cw = Math.floor(window.innerWidth * r.getPixelRatio());
    if (window.innerWidth > 0 && r.domElement.width !== cw) this.resize();
    if (!r.domElement.width || !r.domElement.height) return;

    // 缩略图（每帧一张，先于正式绘制）
    const job = this.thumbJobs[0];
    if (job && r.domElement.width >= job.w * 72 * r.getPixelRatio() && r.domElement.height >= job.h * 72 * r.getPixelRatio()) {
      this.thumbJobs.shift();
      try { this._renderThumb(job); } catch (err) { this.thumbScene.remove(job.obj); job.reject?.(err); }
    }

    const [tint, focus] = TINTS[this.view] || TINTS.bag;
    this.tint.lerp(tint, 1 - Math.pow(0.02, dt));
    this.focus += (focus - this.focus) * (1 - Math.pow(0.02, dt));
    this.bgMat.uniforms.uTime.value = t;
    this.bgMat.uniforms.uTint.value.copy(this.tint);
    this.bgMat.uniforms.uFocus.value = this.focus;
    this.emberMat.uniforms.uTime.value = t;

    r.setScissorTest(false);
    r.setViewport(0, 0, window.innerWidth, window.innerHeight);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    r.render(this.bgScene, this.bgCam);

    if (this.view === 'bag') this._tickItem(dt, t);
    if (this.view === 'hero') this._tickHero(dt, t);
  }

  _tickItem(dt, t) {
    const sp = this.itemSpin;
    if (!sp.dragging) {
      sp.idle += dt;
      sp.vy *= Math.pow(0.04, dt);
      sp.yaw += sp.vy + (sp.idle > 2.2 ? dt * 0.35 : 0);
      if (sp.idle > 2.2) sp.pitch *= Math.pow(0.3, dt);
    }
    const cur = this.itemCurrent;
    if (cur) {
      cur.t = Math.min(1, cur.t + dt * 2.4);
      const k = easeOut(cur.t);
      cur.holder.scale.setScalar(0.6 + 0.4 * k);
      cur.holder.position.y = 0.06 * Math.sin(t * 1.3) + (1 - k) * -0.3;
      cur.holder.rotation.set(sp.pitch, sp.yaw, 0);
    }
    this.leaving = this.leaving.filter((lv) => {
      lv.leaving += dt * 4;
      lv.holder.scale.setScalar(Math.max(0.001, (1 - lv.leaving) * lv.holder.scale.x));
      if (lv.leaving >= 1) { this.itemRoot.remove(lv.holder); return false; }
      return true;
    });
    const d = this.itemDist;
    this.itemCam.position.set(0, d * 0.13, d);
    this.itemCam.lookAt(0, -0.05, 0);
    this._renderInto(this.anchors.item, this.itemScene, this.itemCam, 27);
  }

  _tickHero(dt, t) {
    const sp = this.heroSpin;
    if (!sp.dragging) {
      sp.idle += dt;
      sp.vy *= Math.pow(0.04, dt);
      sp.yaw += sp.vy;
      if (sp.idle > 3) sp.yaw += (-0.35 - sp.yaw) * (1 - Math.pow(0.5, dt));
    }
    this.heroRoot.rotation.y = sp.yaw;
    if (this.mixer) this.mixer.update(dt);
    for (const s of this.smoke) {
      const u = s.userData;
      u.ph = (u.ph + dt * u.sp) % 1;
      u.a += dt * 0.08;
      const life = Math.sin(u.ph * Math.PI);
      s.position.set(Math.cos(u.a) * u.r, 0.15 + u.ph * 0.7, Math.sin(u.a) * u.r * 0.7);
      s.scale.setScalar(0.9 + u.ph * 1.6);
      s.material.opacity = life * 0.22;
      s.material.rotation += dt * 0.05;
    }
    this.heroCam.position.set(0, 1.25, 6.1);
    this.heroCam.lookAt(0, 0.95, 0);
    this._renderInto(this.anchors.hero, this.heroScene, this.heroCam, 23);
  }
}
