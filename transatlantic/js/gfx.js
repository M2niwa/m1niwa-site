'use strict';
/* =========================================================================
   gfx.js — 渲染管线：HDR 场景 → 泛光/移轴/色调映射；天空、海洋、云、雨、闪电、粒子、陆地
   ========================================================================= */
const GFX = (() => {
  const T = THREE, V3 = T.Vector3, C = T.Color;
  const K_ALT = 0.045;            // 每米高度对应的世界单位（压缩的垂直比例）
  const WORLD_SPEED = 30;         // 满速时世界向后滚动的速度

  const st = {
    tod: 0.05, storm: 0, rain: 0, overcast: 0, wisps: 0, deck: 0.8, flash: 0, frost: 0, danger: 0,
    speed: 1, surfaceY: -3, seaDrop: 0, time: 0, scroll: 0, shake: 0, tilt: 1, exposure: 1, bloom: 0.11, ink: 0, ao: 1, sat: 1.03,
  };
  let renderer, scene, camera, rt, quadScene, quadCam, quad, mips = [], ups = [], PM = {};
  let sky, skyU, ocean, oceanU, sun, fill, hemi, pmrem, envRT = null, envScene, envTod = -9, envOver = -9, envTimer = 0;
  let clouds = [], cloudTex = [], rain, rainU, bolt, boltT = 0, fxList = [], W = 2, H = 2;

  /* ---------------- 时间轴上的光照关键帧（0 = 黄昏起飞，1 = 次日清晨） ---------------- */
  const KF = [
    { t: 0.00, top: '#3a6db5', hor: '#f4c48e', fog: '#dfb893', key: '#ffc88a', keyI: 3.3, hs: '#a9c0e6', hg: '#6e5c4a', hI: 1.05, sea: '#0c3d60', cl: '#ffe8c8', cs: '#a58a9c', stars: 0, moon: 0, exp: 1.0, elev: 12, tint: '#fff6ea' },
    { t: 0.11, top: '#2a4284', hor: '#ff8f50', fog: '#d97f5c', key: '#ff8040', keyI: 3.0, hs: '#8a86bd', hg: '#5e4238', hI: 0.9, sea: '#0a2c4e', cl: '#ffb890', cs: '#6e5280', stars: 0, moon: 0, exp: 1.0, elev: 2.5, tint: '#fff0e0' },
    { t: 0.20, top: '#151f52', hor: '#a05674', fog: '#56406c', key: '#ff7050', keyI: 1.0, hs: '#6a6cb0', hg: '#2c2440', hI: 0.95, sea: '#081c3a', cl: '#9070a2', cs: '#332c5c', stars: 0.3, moon: 0.2, exp: 1.1, elev: -4, tint: '#f4ecff' },
    { t: 0.25, top: '#0a1238', hor: '#3a3466', fog: '#252850', key: '#8fa8ff', keyI: 0.3, hs: '#5560a8', hg: '#181828', hI: 1.0, sea: '#05122a', cl: '#6a70a8', cs: '#1c2244', stars: 0.7, moon: 0.8, exp: 1.25, elev: -9, tint: '#e6ecff' },
    { t: 0.33, top: '#050a20', hor: '#16284e', fog: '#0f1c3a', key: '#a4bcff', keyI: 1.5, hs: '#5068b8', hg: '#12141f', hI: 1.1, sea: '#030c1e', cl: '#6880b8', cs: '#171f3c', stars: 1, moon: 1, exp: 1.35, elev: -30, tint: '#e0e8ff' },
    { t: 0.72, top: '#050a20', hor: '#16284e', fog: '#0f1c3a', key: '#a4bcff', keyI: 1.5, hs: '#5068b8', hg: '#12141f', hI: 1.1, sea: '#030c1e', cl: '#6880b8', cs: '#171f3c', stars: 1, moon: 1, exp: 1.35, elev: -30, tint: '#e0e8ff' },
    { t: 0.80, top: '#0d1a48', hor: '#54588e', fog: '#363f6e', key: '#a4bcff', keyI: 0.9, hs: '#5a6aa8', hg: '#1c1e30', hI: 1.05, sea: '#071630', cl: '#7a80b4', cs: '#262c54', stars: 0.45, moon: 0.6, exp: 1.25, elev: -7, tint: '#eaeaff' },
    { t: 0.84, top: '#1c2f6a', hor: '#b06a80', fog: '#7a5a80', key: '#ff9a70', keyI: 0.35, hs: '#7a80ba', hg: '#2c2a3c', hI: 1.0, sea: '#0a2244', cl: '#c08a9a', cs: '#3c3a66', stars: 0.15, moon: 0.3, exp: 1.15, elev: -2, tint: '#fff0f0' },
    { t: 0.90, top: '#3862a6', hor: '#ffab7c', fog: '#eda58c', key: '#ffa462', keyI: 3.0, hs: '#909fd2', hg: '#5a4a44', hI: 0.95, sea: '#0b3256', cl: '#ffcdae', cs: '#7e6c98', stars: 0, moon: 0, exp: 1.0, elev: 3, tint: '#fff2e6' },
    { t: 1.00, top: '#4a90e2', hor: '#d2e8ff', fog: '#bfd9f2', key: '#fff2dc', keyI: 3.5, hs: '#b8d4ff', hg: '#607a5c', hI: 1.1, sea: '#0e4c74', cl: '#ffffff', cs: '#aabad2', stars: 0, moon: 0, exp: 1.0, elev: 17, tint: '#ffffff' },
  ];
  const KC = ['top', 'hor', 'fog', 'key', 'hs', 'hg', 'sea', 'cl', 'cs', 'tint'], KS = ['keyI', 'hI', 'stars', 'moon', 'exp', 'elev'];
  KF.forEach(k => KC.forEach(n => { k[n] = new C(k[n]); }));
  const env = { sunDir: new V3(), moonDir: new V3(), keyDir: new V3(), isSun: true, sunVis: 1 };
  KC.forEach(n => { env[n] = new C(); });
  const tmpC = new C(), tmpC2 = new C(), grey = new C();

  function evalEnv() {
    const t = U.clamp(st.tod, 0, 1);
    let i = 0; while (i < KF.length - 2 && t > KF[i + 1].t) i++;
    const a = KF[i], b = KF[i + 1], u = U.clamp((t - a.t) / (b.t - a.t), 0, 1);
    KC.forEach(n => env[n].lerpColors(a[n], b[n], u));
    KS.forEach(n => { env[n] = U.lerp(a[n], b[n], u); });
    env.isSun = t < 0.25 || t > 0.84;
    const e = env.elev * Math.PI / 180, ce = Math.cos(e);
    if (t < 0.5) env.sunDir.set(-0.64 * ce, Math.sin(e), -0.77 * ce); else env.sunDir.set(0.72 * ce, Math.sin(e), -0.69 * ce);
    env.sunDir.normalize();
    env.sunVis = U.smooth(-9, -1.5, env.elev);
    env.moonDir.set(0.26 + 0.1 * Math.sin(t * 5), 0.1, -0.95).normalize();
    if (env.isSun) { const le = Math.max(e, 0.17), c2 = Math.cos(le); env.keyDir.set(env.sunDir.x / ce * c2, Math.sin(le), env.sunDir.z / ce * c2).normalize(); }
    else env.keyDir.set(0.3, 0.62, -0.72).normalize();
    // 风暴：压暗、去色
    const o = st.overcast;
    grey.copy(env.hor).lerp(tmpC.setRGB(0.045, 0.05, 0.065), 0.8);
    env.top.lerp(tmpC.copy(grey).multiplyScalar(0.55), o * 0.92);
    env.hor.lerp(grey, o * 0.9); env.fog.lerp(grey, o * 0.92);
    env.cl.lerp(tmpC.copy(grey).multiplyScalar(1.5), o * 0.8); env.cs.lerp(tmpC.copy(grey).multiplyScalar(0.5), o * 0.85);
    env.keyI *= 1 - 0.72 * o; env.hI *= 1 - 0.22 * o; env.stars *= 1 - o; env.moon *= 1 - 0.9 * o; env.sunVis *= 1 - 0.9 * o;
  }

  /* ----------------------------- GLSL 公共噪声 ----------------------------- */
  const NOISE = `
  float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.2); a*=.5; } return s; }`;

  /* --------------------------------- 天空 --------------------------------- */
  function makeSky() {
    skyU = {
      uTop: { value: new C() }, uHor: { value: new C() }, uBot: { value: new C() }, uSunDir: { value: new V3(0, 1, 0) }, uSunCol: { value: new C() },
      uMoonDir: { value: new V3(0, 1, 0) }, uStars: { value: 0 }, uMoon: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uOver: { value: 0 }, uScroll: { value: 0 },
    };
    const mat = new T.ShaderMaterial({
      uniforms: skyU, side: T.BackSide, depthWrite: false, depthTest: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir=position; vec4 p=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*p; }`,
      fragmentShader: `
        uniform vec3 uTop,uHor,uBot,uSunDir,uSunCol,uMoonDir; uniform float uStars,uMoon,uTime,uFlash,uOver,uScroll; varying vec3 vDir;
        ${NOISE}
        float h3(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          vec3 d=normalize(vDir); float h=d.y;
          vec3 col=mix(uHor,uTop,pow(clamp(h,0.,1.),.5));
          float sd=max(dot(d,uSunDir),0.);
          // 太阳方位上的地平线辉光
          float az=max(dot(normalize(vec3(d.x,0.,d.z)+1e-5),normalize(vec3(uSunDir.x,0.,uSunDir.z)+1e-5)),0.);
          col+=uSunCol*pow(az,5.)*exp(-abs(h)*7.)*.55;
          col+=uSunCol*(pow(sd,8.)*.22+pow(sd,90.)*.9+smoothstep(.99945,.9997,sd)*42.);
          float md=max(dot(d,uMoonDir),0.);
          col+=uMoon*vec3(.82,.88,1.)*(smoothstep(.99935,.9996,md)*9.+pow(md,400.)*.9+pow(md,24.)*.08);
          // 星空
          vec3 p=d*190.; vec3 ip=floor(p); vec3 fp=fract(p)-.5; float r=h3(ip);
          float star=step(.9935,r)*smoothstep(.32,.0,length(fp))*(0.6+0.4*sin(uTime*2.+r*90.));
          col+=star*uStars*smoothstep(.0,.12,h)*vec3(.9,.95,1.)*2.6*(.35+r*8.*step(.998,r)+.65);
          // 高空卷云
          vec2 cp=d.xz/(max(h,0.)+.14)*1.25+vec2(uScroll*.0006,0.);
          float ci=smoothstep(.48,.92,fbm(cp*1.3))*smoothstep(.015,.3,h);
          col=mix(col,uHor*.75+uSunCol*.12+uTop*.2,ci*.55*(1.-uOver));
          // 风暴阴云与闪电
          float sc=fbm(cp*.7+vec2(uTime*.01,0.));
          col=mix(col,col*(.55+.6*sc),uOver);
          col+=uFlash*vec3(.75,.85,1.)*(.35+1.3*sc*sc)*smoothstep(-.1,.3,h);
          col=mix(col,uBot,smoothstep(.012,-.05,h));
          gl_FragColor=vec4(col,1.);
        }`,
    });
    sky = new T.Mesh(new T.SphereGeometry(5000, 48, 24), mat);
    sky.renderOrder = -100; sky.frustumCulled = false;
    scene.add(sky);
    envScene = new T.Scene();
    envScene.add(new T.Mesh(new T.SphereGeometry(100, 32, 16), mat));
  }

  /* --------------------------------- 海洋 --------------------------------- */
  function makeOcean() {
    const g = new T.PlaneGeometry(2, 2, 240, 240); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setX(i, Math.sign(x) * Math.pow(Math.abs(x), 2.3) * 7000); p.setZ(i, Math.sign(z) * Math.pow(Math.abs(z), 2.3) * 7000);
    }
    oceanU = {
      uTime: { value: 0 }, uOffset: { value: new T.Vector2() }, uStorm: { value: 0 }, uDeep: { value: new C() }, uHor: { value: new C() }, uTop: { value: new C() },
      uSunDir: { value: new V3() }, uSunCol: { value: new C() }, uFog: { value: new C() }, uFogD: { value: 0.0005 }, uFoam: { value: new C() }, uFlash: { value: 0 },
      tWN: { value: null }, uDet: { value: 0 },
    };
    ocean = new T.Mesh(g, new T.ShaderMaterial({
      uniforms: oceanU, fog: false,
      vertexShader: `
        uniform float uTime,uStorm; uniform vec2 uOffset; varying vec3 vW; varying vec2 vP; varying vec3 vN; varying float vH;
        vec3 wv(vec2 p, vec2 d, float k, float a, float s){ float ph=dot(p,d)*k+uTime*s; return vec3(sin(ph)*a, cos(ph)*a*k*d.x, cos(ph)*a*k*d.y); }
        void main(){
          vec4 w=modelMatrix*vec4(position,1.); vec2 p=w.xz+uOffset;
          float fade=exp(-length(w.xz-cameraPosition.xz)/420.); float A=mix(.55,1.9,uStorm);
          vec3 h=wv(p,normalize(vec2(1.,.3)),.085,.9*A,.9)+wv(p,normalize(vec2(.6,-.8)),.15,.5*A,1.3)
                +wv(p,normalize(vec2(-.25,1.)),.29,.24*A,1.9)+wv(p,normalize(vec2(.9,.45)),.042,1.5*A,.6);
          w.y+=h.x*fade; vH=h.x/A; vN=normalize(vec3(-h.y*fade,1.,-h.z*fade)); vW=w.xyz; vP=p;
          gl_Position=projectionMatrix*viewMatrix*w;
        }`,
      fragmentShader: `
        uniform float uTime,uStorm,uFogD,uFlash,uDet; uniform sampler2D tWN; uniform vec3 uDeep,uHor,uTop,uSunDir,uSunCol,uFog,uFoam; varying vec3 vW; varying vec2 vP; varying vec3 vN; varying float vH;
        ${NOISE}
        void main(){
          vec3 V=cameraPosition-vW; float dist=length(V); V/=dist;
          float det=1./(1.+dist*.0035);
          vec3 N;
          if(uDet>.5){
            // 写实画风：真实的水面法线贴图，四层不同尺度、朝不同方向流动（涟漪、细浪、碎波、涌）
            vec2 a=texture2D(tWN,vP*.085+vec2(uTime*.045,uTime*.026)).xy, b=texture2D(tWN,vP*.031-vec2(uTime*.017,-uTime*.021)).xy;
            vec2 c=texture2D(tWN,vP*.0113+vec2(-uTime*.006,uTime*.008)).xy, d=texture2D(tWN,vP*.0037+vec2(uTime*.002,-uTime*.0015)).xy;
            vec2 r=((a-.5)*1.7*(.25+.75*det)+(b-.5)*2.)*(1.+.9*uStorm)+((c-.5)*1.6+(d-.5)*1.2)*(1.+.6*uStorm);
            N=normalize(vN+vec3(r.x,0.,r.y));
          } else {
            vec2 q=vP*.33+vec2(uTime*.5,uTime*.28); float e=.3;
            float n0=fbm(q), nx=fbm(q+vec2(e,0.)), nz=fbm(q+vec2(0.,e));
            vec2 q2=vP*.055+vec2(uTime*.12,-uTime*.07);
            float m0=fbm(q2), mx=fbm(q2+vec2(e,0.)), mz=fbm(q2+vec2(0.,e));
            N=normalize(vN+vec3(n0-nx,0.,n0-nz)*(2.2+2.*uStorm)*det+vec3(m0-mx,0.,m0-mz)*(1.6+uStorm)*(.35+.65*det));
          }
          float nv=max(dot(N,V),0.);
          float fres=.02+.98*pow(1.-nv,5.);
          vec3 R=reflect(-V,N); R.y=abs(R.y);
          vec3 skyR=mix(uHor,uTop,pow(R.y,.55));
          vec3 water=mix(uDeep,uDeep*2.4+vec3(0.,.012,.02),smoothstep(-.6,1.3,vH)*.6);
          vec3 col=mix(water,skyR,fres);
          float sd=max(dot(R,uSunDir),0.);
          col+=uSunCol*(pow(sd,mix(90.,900.,det))*mix(2.2,14.,det)+pow(sd,14.)*.07);
          float fm=fbm(vP*.21+vec2(uTime*.3,0.))*(.55+.45*vH);
          float foam=smoothstep(.62-uStorm*.2,.86,fm)*det;
          col=mix(col,uFoam,foam*.85);
          col+=uFlash*vec3(.25,.3,.4)*(.2+fres);
          float fg=1.-exp(-pow(dist*uFogD,2.));
          gl_FragColor=vec4(mix(col,uFog,fg),1.);
        }`,
    }));
    ocean.frustumCulled = false; ocean.renderOrder = -50;
    scene.add(ocean);
  }

  /* ---------------------------------- 云 ---------------------------------- */
  function makeCloudTex() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    for (let i = 0; i < 38; i++) {
      const a = Math.random() * 6.283, r = Math.pow(Math.random(), 0.7) * 62;
      const x = 128 + Math.cos(a) * r * 1.2, y = 142 + Math.sin(a) * r * 0.55 - Math.random() * 16, R = 20 + Math.random() * 36 * (1 - r / 110);
      const gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, 'rgba(255,255,255,.36)'); gr.addColorStop(0.55, 'rgba(255,255,255,.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x - R, y - R, 2 * R, 2 * R);
    }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }
  function puff(layer, o) {
    const m = new T.SpriteMaterial({ map: U.pick(cloudTex), transparent: true, depthWrite: false, opacity: 0 });
    const s = new T.Sprite(m); s.scale.set(o.size, o.size * (o.aspect || 0.6), 1);
    scene.add(s);
    clouds.push(Object.assign({ s, m, layer, op: 0.9, shade: 0.5, range: 1200, rot: Math.random() * 0.5 }, o));
    m.rotation = U.rand(-0.25, 0.25);
  }
  function makeClouds() {
    for (let i = 0; i < 4; i++) cloudTex.push(makeCloudTex());
    for (let c = 0; c < 26; c++) {           // 机腹下方的云海
      const cx = U.rand(-1300, 1300), cz = U.rand(-1700, 160), ca = U.rand(700, 1500), sz = U.rand(170, 330);
      for (let k = 0; k < 4; k++) {
        const dy = U.rand(-1, 1);
        puff('deck', { x: cx + U.rand(-110, 110), z: cz + U.rand(-80, 80), alt: ca + dy * 240, size: sz * U.rand(0.7, 1.2), aspect: 0.55, shade: 0.5 + dy * 0.45, op: 0.92, range: 1400 });
      }
    }
    for (let i = 0; i < 20; i++) {           // 地平线上的积云塔
      const sz = U.rand(700, 1500), dy = Math.random();
      puff('far', { x: U.rand(-4200, 4200), z: U.rand(-4600, -2400), alt: 400 + dy * 2600, size: sz, aspect: 0.6, shade: 0.25 + dy * 0.7, op: 0.95, range: 4400 });
    }
    for (let i = 0; i < 30; i++) {           // 贴身掠过的云絮
      puff('wisp', { x: U.rand(-300, 300), z: U.rand(-190, -34), yRel: U.rand(-22, 14), size: U.rand(40, 95), aspect: 0.55, shade: U.rand(0.3, 0.9), op: U.rand(0.25, 0.55), range: 300 });
    }
  }
  function updateClouds(dt) {
    const v = WORLD_SPEED * st.speed;
    for (const c of clouds) {
      c.x -= v * dt * (c.layer === 'wisp' ? 2.4 : 1);
      if (c.x < -c.range) { c.x += c.range * 2; if (c.layer === 'wisp') { c.z = U.rand(-190, -34); c.yRel = U.rand(-22, 14); } }
      let y, op = c.op;
      if (c.layer === 'wisp') { y = c.yRel; op *= st.wisps; }
      else { y = st.surfaceY + c.alt * K_ALT; if (c.layer === 'deck') op *= st.deck; }
      if (c.layer !== 'far') {
        /* 云是朝向镜头的平面贴图，一旦扎进海面就会被海面切出一条笔直的边。所以贴图里看得见的那部分，下沿必须留在浪尖以上；
           机身附近的云海还得压在飞机下方 —— 飞得太低、两头都顾不上时，就让这朵云淡出 */
        const h = c.size * (c.aspect || 0.6), floor = st.surfaceY - st.seaDrop + 0.42 * h + 2.5 + st.storm * 5;
        if (c.layer === 'deck') {
          const top = c.z > -260 ? -c.size * 0.3 - 7 - (c.z + 260) * 0.03 : 1e9;      // 不挡住飞机的最高位置
          y = Math.max(y, floor);
          if (y > top) { if (floor <= top) y = top; else { op *= 1 - U.smooth(0, 0.15 * h, floor - top); y = floor; } }
        } else if (y < floor) { op *= 1 - U.smooth(0.3 * h, 0.9 * h, floor - y); y = floor; }
      }
      op *= U.smooth(c.range, c.range * 0.82, Math.abs(c.x));
      c.s.visible = op > 0.01; if (!c.s.visible) continue;
      c.s.position.set(c.x, y, c.z);
      c.m.opacity = op;
      tmpC.copy(env.cs).lerp(env.cl, c.shade);
      if (st.flash > 0.01) tmpC.addScalar(st.flash * 0.5 * c.shade);
      c.m.color.copy(tmpC);
    }
  }

  /* ----------------------------- 雨 与 闪电 ----------------------------- */
  function makeRain() {
    const N = 1600, pos = new Float32Array(N * 6), end = new Float32Array(N * 2), seed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = U.rand(-45, 45), y = U.rand(-28, 28), z = U.rand(-45, 30), s = Math.random();
      pos.set([x, y, z, x, y, z], i * 6); end.set([0, 1], i * 2); seed.set([s, s], i * 2);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('aEnd', new T.BufferAttribute(end, 1)); g.setAttribute('aSeed', new T.BufferAttribute(seed, 1));
    rainU = { uTime: { value: 0 }, uOp: { value: 0 }, uCol: { value: new C(0.7, 0.8, 1) } };
    rain = new T.LineSegments(g, new T.ShaderMaterial({
      uniforms: rainU, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
      vertexShader: `uniform float uTime; attribute float aEnd,aSeed; varying float vA;
        void main(){ vec3 vel=vec3(-58.,-40.,7.); vec3 B=vec3(45.,28.,38.);
          vec3 p=position+vel*uTime*(.8+aSeed*.5); p=mod(p+B,2.*B)-B; p.z-=7.; p+=normalize(vel)*aEnd*(1.6+aSeed*1.4);
          vA=1.-aEnd*.7; gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); }`,
      fragmentShader: `uniform float uOp; uniform vec3 uCol; varying float vA; void main(){ gl_FragColor=vec4(uCol,uOp*vA*.55); }`,
    }));
    rain.frustumCulled = false; rain.visible = false;
    scene.add(rain);
    bolt = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ color: new C(9, 10, 16), fog: false, side: T.DoubleSide, transparent: true }));
    bolt.frustumCulled = false; bolt.visible = false;
    scene.add(bolt);
  }
  function lightning(power = 1) {
    st.flash = Math.max(st.flash, power);
    const x0 = U.rand(-1500, 1500), z = U.rand(-2600, -900), top = st.surfaceY + 2600 * K_ALT, bot = st.surfaceY;
    const pts = []; let x = x0;
    const n = 18;
    for (let i = 0; i <= n; i++) { pts.push([x, U.lerp(top, bot, i / n)]); x += U.rand(-55, 55); }
    const w = 4 + 3 * power, pos = [], idx = [];
    pts.forEach(([px, py], i) => { pos.push(px - w, py, z, px + w, py, z); if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
    bolt.geometry.dispose();
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    bolt.geometry = g; bolt.visible = true; boltT = 0.22;
  }

  /* --------------------------------- 粒子 --------------------------------- */
  const FXP = {
    fire: { add: 1, c: [3.6, 1.3, 0.28], c1: [1.4, 0.15, 0], a: 0.9, life: [0.45, 0.9], s0: 0.34, s1: 0.08, v: [0, 1.7, 0], sp: 0.5, g: 1.2, drag: 1 },
    flame: { add: 1, c: [4.2, 1.6, 0.3], c1: [1.6, 0.2, 0], a: 0.9, life: [0.25, 0.5], s0: 0.4, s1: 0.1, v: [-5, 0.6, 0], sp: 0.7, g: 0, drag: 1 },
    spark: { add: 1, c: [5, 3.2, 1], c1: [3, 0.8, 0.1], a: 1, life: [0.3, 0.7], s0: 0.07, s1: 0.03, v: [0, 1.5, 0], sp: 3.2, g: -7, drag: 0.5 },
    smoke: { add: 0, c: [0.16, 0.15, 0.15], c1: [0.4, 0.4, 0.42], a: 0.55, life: [1.0, 1.9], s0: 0.3, s1: 1.3, v: [0, 0.9, 0], sp: 0.35, g: 0.5, drag: 0.8 },
    trail: { add: 0, c: [0.1, 0.1, 0.1], c1: [0.35, 0.35, 0.36], a: 0.6, life: [0.8, 1.5], s0: 0.35, s1: 1.7, v: [-9, 0.3, 0], sp: 0.6, g: 0.4, drag: 0.2 },
    foam: { add: 0, c: [0.95, 0.97, 1], c1: [1, 1, 1], a: 0.75, life: [0.35, 0.6], s0: 0.16, s1: 0.5, v: [0, 0, 0], sp: 0.8, g: -1, drag: 1.5 },
    ice: { add: 0, c: [0.85, 0.95, 1], c1: [1, 1, 1], a: 0.95, life: [0.4, 0.8], s0: 0.12, s1: 0.04, v: [-2, 1.6, 0], sp: 2.2, g: -6, drag: 0.4 },
    fuel: { add: 0, c: [0.75, 0.5, 0.12], c1: [0.8, 0.6, 0.2], a: 0.7, life: [0.4, 0.7], s0: 0.09, s1: 0.16, v: [0, 0.6, 0], sp: 1.2, g: -6, drag: 0.4 },
    spray: { add: 0, c: [0.9, 0.95, 1], c1: [1, 1, 1], a: 0.6, life: [0.6, 1.1], s0: 0.5, s1: 1.8, v: [-10, 2.5, 0], sp: 2.5, g: -5, drag: 0.3 },
    splash: { add: 0, c: [0.9, 0.95, 1], c1: [1, 1, 1], a: 0.8, life: [1.0, 1.9], s0: 0.5, s1: 1.7, v: [0, 6.4, 0], sp: 2.6, g: -7, drag: 0.25 },
    blow: { add: 0, c: [0.9, 0.95, 1], c1: [1, 1, 1], a: 0.42, life: [1.3, 2.2], s0: 0.35, s1: 1.6, v: [0, 3.0, 0], sp: 0.55, g: -0.5, drag: 0.8 },
    drip: { add: 0, c: [0.9, 0.95, 1], c1: [1, 1, 1], a: 0.55, life: [0.6, 1.1], s0: 0.3, s1: 0.5, v: [0, -1, 0], sp: 1.2, g: -6, drag: 0.2 },
    exh: { add: 0, c: [0.15, 0.17, 0.23], c1: [0.42, 0.46, 0.53], a: 0.5, life: [0.5, 1.0], s0: 0.1, s1: 0.62, v: [0, 0.15, 0], sp: 0.3, g: 0.25, drag: 0.6 },       // 排气：一缕淡蓝的烟
    exhR: { add: 0, c: [0.07, 0.07, 0.07], c1: [0.3, 0.3, 0.31], a: 0.5, life: [0.5, 1.0], s0: 0.14, s1: 0.9, v: [0, 0.2, 0], sp: 0.45, g: 0.3, drag: 0.5 },          // 混合比不对：一股股黑烟
    exhF: { add: 1, c: [1.3, 1.9, 3.6], c1: [3.2, 1.0, 0.15], a: 0.85, life: [0.05, 0.11], s0: 0.11, s1: 0.03, v: [0, 0, 0], sp: 0.3, g: 0, drag: 1 },                // 排气火舌：管口发蓝、尾梢橙黄，只有夜里看得见
    dust: { add: 0, c: [0.6, 0.5, 0.38], c1: [0.7, 0.62, 0.5], a: 0.4, life: [0.7, 1.3], s0: 0.5, s1: 2.0, v: [-8, 1, 0], sp: 1.5, g: 0.3, drag: 0.5 },
  };
  function makeFX(parent, scale = 1) {         // scale：远处的大场面（鲸的水花）整体放大粒子与速度
    const N = 520;
    function pool(additive) {
      const g = new T.BufferGeometry(), pos = new Float32Array(N * 3), col = new Float32Array(N * 4), size = new Float32Array(N);
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('aCol', new T.BufferAttribute(col, 4)); g.setAttribute('aSize', new T.BufferAttribute(size, 1));
      const u = { uScale: { value: 600 }, uAmb: { value: new C(1, 1, 1) } };
      const pts = new T.Points(g, new T.ShaderMaterial({
        uniforms: u, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending, fog: false,
        vertexShader: `uniform float uScale; attribute vec4 aCol; attribute float aSize; varying vec4 vC;
          void main(){ vC=aCol; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=aSize*uScale/max(-mv.z,.1); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 uAmb; varying vec4 vC; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.12,d); if(a<.01) discard; gl_FragColor=vec4(vC.rgb*uAmb,vC.a*a); }`,
      }));
      pts.frustumCulled = false; pts.renderOrder = 20; pts.userData.noShadow = true;
      parent.add(pts);
      return { pts, pos, col, size, u, ps: Array.from({ length: N }, () => ({ life: 0 })), next: 0, additive };
    }
    const pools = [pool(false), pool(true)];
    const fx = {
      pools,
      emit(kind, x, y, z, n = 1, dir) {
        const k = FXP[kind], pl = pools[k.add];
        for (let i = 0; i < n; i++) {
          const p = pl.ps[pl.next]; pl.next = (pl.next + 1) % N;
          p.k = k; p.max = p.life = U.rand(k.life[0], k.life[1]);
          p.x = x + U.rand(-0.06, 0.06); p.y = y + U.rand(-0.06, 0.06); p.z = z + U.rand(-0.06, 0.06);
          p.vx = (k.v[0] + U.rand(-k.sp, k.sp) + (dir ? dir[0] : 0)) * scale; p.vy = (k.v[1] + U.rand(-k.sp, k.sp) + (dir ? dir[1] : 0)) * scale; p.vz = (k.v[2] + U.rand(-k.sp, k.sp) + (dir ? dir[2] : 0)) * scale;
        }
      },
      update(dt) {
        for (const pl of pools) {
          const { pos, col, size } = pl;
          for (let i = 0; i < N; i++) {
            const p = pl.ps[i];
            if (p.life <= 0) { size[i] = 0; continue; }
            p.life -= dt; const k = p.k, u = 1 - Math.max(p.life, 0) / p.max, dr = Math.exp(-k.drag * dt);
            p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + k.g * scale * dt;
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
            col[i * 4] = U.lerp(k.c[0], k.c1[0], u); col[i * 4 + 1] = U.lerp(k.c[1], k.c1[1], u); col[i * 4 + 2] = U.lerp(k.c[2], k.c1[2], u);
            col[i * 4 + 3] = k.a * (1 - u * u) * Math.min(1, u * 12);
            size[i] = U.lerp(k.s0, k.s1, u) * scale;
          }
          const a = pl.pts.geometry.attributes; a.position.needsUpdate = a.aCol.needsUpdate = a.aSize.needsUpdate = true;
          pl.u.uScale.value = H / (2 * Math.tan(camera.fov * Math.PI / 360));
          if (!pl.additive) pl.u.uAmb.value.copy(env.hs).multiplyScalar(env.hI * 1.5).add(tmpC.copy(env.key).multiplyScalar(env.keyI * 0.25));
        }
      },
      dispose() { for (const pl of pools) { parent.remove(pl.pts); pl.pts.geometry.dispose(); pl.pts.material.dispose(); } fxList.splice(fxList.indexOf(fx), 1); },
    };
    fxList.push(fx);
    return fx;
  }

  /* --------------------------------- 陆地 --------------------------------- */
  function n2(x, z) {
    const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    return U.lerp(U.lerp(h(ix, iz), h(ix + 1, iz), sx), U.lerp(h(ix, iz + 1), h(ix + 1, iz + 1), sx), sz);
  }
  /* 地面的真实贴图（写实画风）：草地铺满，岸坡和山头按顶点属性 aRock 混进岩石；卡通画风或贴图没加载到时就是原来的纯顶点色。
     草地用三种尺度相乘来打散平铺的重复感；草—岩交界借岩石贴图自身的明暗做得参差不齐 */
  const GTILE = 5, groundU = { uRockC: { value: null }, uRockN: { value: null }, uGK: { value: 1 } };
  let groundMat = null, groundSub = false;
  function makeGroundMat() {
    const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }); m.userData.dyn = true;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, groundU);
      sh.vertexShader = 'attribute float aRock; varying float vRock;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRock = aRock;');
      sh.fragmentShader = 'uniform sampler2D uRockC, uRockN; uniform float uGK; varying float vRock; float gRock = 0.;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#ifdef USE_MAP
          vec3 gA = texture2D(map, vMapUv).rgb, gB = texture2D(map, vMapUv * .137 + .31).rgb, gC = texture2D(map, vMapUv * .031 + .67).rgb;
          vec3 rCol = texture2D(uRockC, vMapUv * vec2(.2, .4)).rgb;
          gRock = smoothstep(.3, .7, vRock + (dot(rCol, vec3(.333)) * uGK - 1.) * .35);
          diffuseColor.rgb *= mix(gA * mix(vec3(1.), gB * uGK, .7) * mix(vec3(1.), gC * uGK, .5), rCol, gRock);
        #endif`)
        .replace('#include <normal_fragment_maps>', `#ifdef USE_NORMALMAP_TANGENTSPACE
          vec3 mapN = mix(texture2D(normalMap, vNormalMapUv).xyz, texture2D(uRockN, vNormalMapUv * vec2(.2, .4)).xyz, gRock) * 2.0 - 1.0;
          mapN.xy *= normalScale * mix(1., 1.7, gRock);
          normal = normalize(tbn * mapN);
        #endif`);
    };
    m.customProgramCacheKey = () => 'ground';
    return m;
  }
  function refreshGround() {
    const m = groundMat; if (!m || typeof P === 'undefined') return;
    const ph = P.photos, on = !!(P.detOn && ph.grass && ph.rock), had = !!m.map;
    m.map = on ? ph.grass.c : null; m.normalMap = on ? ph.grass.n : null; m.roughnessMap = on ? ph.grass.r : null;
    m.color.setScalar(on ? 1 / ph.grass.k : 1); m.roughness = on ? 1.25 : 0.95; m.normalScale.setScalar(on ? 0.9 : 1);
    if (on) { groundU.uRockC.value = ph.rock.c; groundU.uRockN.value = ph.rock.n; groundU.uGK.value = 1 / ph.grass.k; }
    if (had !== on) m.needsUpdate = true;
  }
  /* kind: 'nf' 纽芬兰（海岸在 +x）| 'ie' 爱尔兰（海岸在 -x）；seaplane: 陆地退到远侧作为海岸 */
  function makeLand(kind, seaplane) {
    const grp = new T.Group(), side = kind === 'nf' ? 1 : -1, ie = kind === 'ie';
    const SX = 1500, SZ = 1000, g = new T.PlaneGeometry(SX, SZ, 90, 60); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, colors = new Float32Array(p.count * 3), c = new C(), rock = new Float32Array(p.count), uv = g.attributes.uv;
    const shore = seaplane ? 150 : 1e9;
    const hAt = (x, z) => {
      const nn = n2(x * 0.012 + 3, z * 0.012) * 0.6 + n2(x * 0.04, z * 0.04 + 9) * 0.4;
      let m = U.smooth(560 + nn * 150, 380 + nn * 150, x * side);
      if (seaplane) m *= U.smooth(shore + 60 + nn * 90, shore - 20 + nn * 90, z);
      const flat = U.smooth(26, 90, Math.abs(z - (seaplane ? -40 : 0)));
      const hills = (n2(x * 0.006, z * 0.006 + 5) * 46 + n2(x * 0.025 + 7, z * 0.025) * 9) * flat * (z < 0 ? 1 : 0.35) * (ie ? 0.7 : 1);
      return { y: U.lerp(-7, hills + (seaplane ? 1.6 : 0), m), m, hills };
    };
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = hAt(x, z);
      p.setY(i, h.y);
      if (h.m < 0.55) c.set(ie ? '#8a8a70' : '#7d7466');
      else if (ie) { const cell = n2(Math.floor(x / 70) * 3.7, Math.floor(z / 55) * 5.3); c.set(cell > 0.66 ? '#4a7434' : cell > 0.33 ? '#5e8038' : '#3d662e'); if (cell < 0.14) c.set('#8f8246'); if (cell > 0.9) c.set('#6a7a3a'); }
      else { const v = n2(x * 0.03, z * 0.03); c.set(h.hills > 16 ? '#5c5a50' : v > 0.55 ? '#4a6238' : '#5c683c'); }
      c.multiplyScalar(0.7 + n2(x * 0.2, z * 0.2) * 0.3 + n2(x * 0.02 + 40, z * 0.02) * 0.25);
      colors.set([c.r, c.g, c.b], i * 3);
      rock[i] = Math.max(1 - U.smooth(0.45, 0.8, h.m), U.smooth(ie ? 24 : 12, ie ? 34 : 21, h.hills));      // 岸坡、山头露出岩石
      uv.setXY(i, x / GTILE, z / GTILE);                                                               // 贴图按世界坐标平铺
    }
    g.setAttribute('color', new T.BufferAttribute(colors, 3)); g.setAttribute('aRock', new T.BufferAttribute(rock, 1)); g.computeVertexNormals();
    groundMat = makeGroundMat(); refreshGround();
    if (!groundSub && typeof P !== 'undefined') { P.onPhoto(refreshGround); groundSub = true; }
    const ground = new T.Mesh(g, groundMat);
    ground.receiveShadow = true; grp.add(ground);
    const box = (w, h, d, col, x, y, z, em) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshStandardMaterial({ color: col, roughness: 0.9, emissive: em || 0, emissiveIntensity: em ? 2.2 : 0 })); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; grp.add(m); return m; };
    const house = (x, z, s, wall, roofC) => {
      const y = hAt(x, z).y; if (hAt(x, z).m < 0.9) return;
      box(8 * s, 5 * s, 6 * s, wall, x, y + 2.5 * s, z);
      const roof = new T.Mesh(new T.ConeGeometry(6.4 * s, 3.6 * s, 4), new T.MeshStandardMaterial({ color: roofC, roughness: 0.9, flatShading: true }));
      roof.position.set(x, y + 6.8 * s, z); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.78); roof.castShadow = true; grp.add(roof);
      box(1.4 * s, 1.6 * s, 0.2, '#ffd58a', x - 1.5 * s, y + 2.6 * s, z + 3.05 * s, '#ffb050');
      box(1.4 * s, 1.6 * s, 0.2, '#ffd58a', x + 1.8 * s, y + 2.6 * s, z + 3.05 * s, '#ffb050');
    };
    const tree = (x, z, s) => {
      const h = hAt(x, z); if (h.m < 0.95) return;
      const t = new T.Mesh(new T.ConeGeometry(2.6 * s, 8 * s, 6), new T.MeshStandardMaterial({ color: ie ? '#2f6a35' : '#2c5238', roughness: 1, flatShading: true }));
      t.position.set(x, h.y + 4.6 * s, z); t.castShadow = true; grp.add(t);
    };
    if (!seaplane) {
      const rw = box(760, 0.16, 15, ie ? '#5a7a3a' : '#7a6c58', 80 * side, 0.02, 0); rw.castShadow = false;
      rw.material.userData.dyn = true; if (typeof P !== 'undefined') P.photo(rw.material, ie ? 'grass' : 'gravel', 760 / 6, 15 / 6, { s: 1 });      // 写实画风：碎石跑道 / 修剪过的草地跑道
    } else {
      box(70, 1.2, 5, '#6a5038', -20, 0.3, -shore + 235, 0); // 栈桥（落在远侧岸边）
    }
    const zOff = seaplane ? -70 : 0;
    if (!ie) {
      for (let i = 0; i < 120; i++) tree(U.rand(-700, 520), U.rand(-480, -45) + zOff, U.rand(0.7, 1.5));
      for (let i = 0; i < 26; i++) tree(U.rand(-700, 480), U.rand(40, 300), U.rand(0.7, 1.2));
    } else {
      for (let i = 0; i < 12; i++) house(U.rand(-380, 420), U.rand(-300, -50) + zOff, U.rand(0.7, 1.1), '#efe9da', U.pick(['#b79a52', '#4a4a50']));
      for (let i = 0; i < 70; i++) tree(U.rand(-460, 700), U.rand(-460, -40) + zOff, U.rand(0.6, 1.2));
      for (let i = 0; i < 22; i++) {            // 石墙与牛
        const x = U.rand(-380, 640), z = U.rand(-330, -34) + zOff, h = hAt(x, z); if (h.m < 0.95) continue;
        const w = box(U.rand(40, 90), 1.3, 1.1, '#8d8a80', x, h.y + 0.6, z); w.rotation.y = U.pick([0, Math.PI / 2, 0.2]);
      }
      if (seaplane) for (let i = 0; i < 16; i++) {
        const x = U.rand(-200, 460), z = U.rand(-150, -26) + zOff, h = hAt(x, z); if (h.m < 0.95) continue;
        box(2.6, 1.5, 1.2, U.pick(['#f4f0e8', '#2a2420', '#8a5a38']), x, h.y + 1.2, z).rotation.y = U.rand(3);
      }
    }
    // 细节布景（人群、汽车、船队、灯塔……）交给 scenery.js；然后把所有静态零件按材质合并
    if (typeof SCN !== 'undefined') SCN.dressLand(grp, { kind, seaplane, hAt, zOff, seaY: seaplane ? 0 : -3.2 });
    if (typeof P !== 'undefined') P.bakeStatic(grp);
    grp.userData.kind = kind;
    scene.add(grp);
    return grp;
  }

  /* ------------------------------- 后期管线 ------------------------------- */
  const VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
  const mk = (frag, uniforms) => new T.ShaderMaterial({ vertexShader: VS, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, fog: false });
  function makePost() {
    quadScene = new T.Scene(); quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    quad = new T.Mesh(new T.PlaneGeometry(2, 2), null); quad.frustumCulled = false; quadScene.add(quad);
    PM.down = mk(`uniform sampler2D t; uniform vec2 px; uniform float clampV; varying vec2 vUv;
      void main(){ vec3 c=texture2D(t,vUv).rgb*4.; c+=texture2D(t,vUv+px*vec2(1,1)).rgb+texture2D(t,vUv+px*vec2(-1,1)).rgb+texture2D(t,vUv+px*vec2(1,-1)).rgb+texture2D(t,vUv+px*vec2(-1,-1)).rgb;
        c/=8.; gl_FragColor=vec4(min(c,vec3(clampV)),1.); }`, { t: { value: null }, px: { value: new T.Vector2() }, clampV: { value: 60 } });
    PM.up = mk(`uniform sampler2D tA,tB; uniform vec2 px; varying vec2 vUv;
      void main(){ vec3 b=texture2D(tB,vUv).rgb*4.;
        b+=(texture2D(tB,vUv+px*vec2(1,0)).rgb+texture2D(tB,vUv+px*vec2(-1,0)).rgb+texture2D(tB,vUv+px*vec2(0,1)).rgb+texture2D(tB,vUv+px*vec2(0,-1)).rgb)*2.;
        b+=texture2D(tB,vUv+px*vec2(1,1)).rgb+texture2D(tB,vUv+px*vec2(-1,1)).rgb+texture2D(tB,vUv+px*vec2(1,-1)).rgb+texture2D(tB,vUv+px*vec2(-1,-1)).rgb;
        gl_FragColor=vec4(mix(texture2D(tA,vUv).rgb,b/16.,.62),1.); }`, { tA: { value: null }, tB: { value: null }, px: { value: new T.Vector2() } });
    PM.final = mk(`uniform sampler2D tScene,tBloom,tBlur,tDepth; uniform float uBloom,uExp,uTime,uFrost,uDanger,uFlash,uTilt,uInk,uAO,uSat; uniform vec3 uTint; uniform vec2 uRes,uPx; uniform float uPxA; varying vec2 vUv;
      ${NOISE}
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
      void main(){
        vec2 uv=vUv, c=uv-.5; float r2=dot(c,c);
        vec2 off=c*r2*.007;
        vec3 col=vec3(texture2D(tScene,uv+off).r,texture2D(tScene,uv).g,texture2D(tScene,uv-off).b);
        // 深度后处理。w = 1-深度 ≈ near/z：平面在屏幕空间里是线性的，所以二阶差分只在折线、接缝、轮廓处不为零
        //   · 小半径、取绝对值 → 卡通描边；  · 大半径、只取“凹”的一侧 → 接缝/接触处的柔和阴影（写实画风）
        if(uInk+uAO>.002){
          // 相邻采样点的深度二阶差分 ÷ 采样间距 ≈ tan(折角/2)：平面为 0，分面曲面很小，真正的折线/接缝才大
          float wc=1.-texture2D(tDepth,uv).r, wm=wc, edge=0., cav=0., thin=0., fine=0., ridge=0., sc=uRes.y/720., iw=1./max(wc,1e-6);
          float jit=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))*.7854, cj=cos(jit), sj=sin(jit);
          for(int i=0;i<4;i++){
            vec2 d0=i==0?vec2(1.,0.):i==1?vec2(0.,1.):i==2?vec2(.7071,.7071):vec2(.7071,-.7071), d=d0*uPx*sc;
            float a=1.-texture2D(tDepth,uv+d*1.25).r, b=1.-texture2D(tDepth,uv-d*1.25).r;
            edge=max(edge,abs(a+b-2.*wc)); wm=max(wm,max(a,b));
            if(uInk>.01){                                    // 细件判定：隔 4.5 像素再采一次，“凸一下又回去”的就是细杆/细线
              float a4=1.-texture2D(tDepth,uv+d*4.5).r, b4=1.-texture2D(tDepth,uv-d*4.5).r;
              thin=max(thin,max(max(min(a-wc,a-a4),min(b-wc,b-b4)),min(wc-a4,wc-b4)));
            }
            if(uAO>.01){
              // 细节层：就在 1.25 像素处，两侧都比中心近 → 细缝、贴合处（压暗）；两侧都比中心远 → 凸棱（提亮一点，像金属棱边的反光）。
              // 换算成折角后设上限：差得太多的是前后两个物体的轮廓，不是折线
              float cc=min(max(a-wc,0.),max(b-wc,0.))*iw/(1.25*uPxA), rr=min(max(wc-a,0.),max(wc-b,0.))*iw/(1.25*uPxA);
              fine+=smoothstep(.22,.8,cc)*(1.-smoothstep(2.5,5.,cc)); ridge+=smoothstep(.35,1.1,rr)*(1.-smoothstep(2.5,5.,rr));
              vec2 dj=vec2(d0.x*cj-d0.y*sj,d0.x*sj+d0.y*cj)*uPx*sc;
              for(int j=0;j<2;j++){
                float r=j==0?5.:13.;
                float a2=1.-texture2D(tDepth,uv+dj*r).r, b2=1.-texture2D(tDepth,uv-dj*r).r;
                a2=mix(a2,wc,smoothstep(1.05,1.12,a2*iw)); b2=mix(b2,wc,smoothstep(1.05,1.12,b2*iw));     // 离得太远的前景不算遮挡
                float t=min(max(a2-wc,0.),max(b2-wc,0.))*iw/(r*uPxA);                                  // 两侧都比中心近才算凹缝，换算成折角
                cav+=smoothstep(.13,.55,t)*(j==0?.6:.4);
              }
            }
          }
          float inv=1./max(wm,1e-6);
          float ink=smoothstep(.2,.46,edge*inv/(2.5*uPxA))*smoothstep(.3/300.,.3/80.,wm)*uInk*(1.-.8*smoothstep(.0015,.006,thin*inv));
          float ao=clamp(cav*.42+fine*.22,0.,1.)*step(1e-6,wc)*uAO;
          col*=(1.-.6*ao)*(1.+.24*clamp(ridge*.5,0.,1.)*step(1e-6,wc)*uAO); col=mix(col,col*vec3(.05,.04,.07),ink*.92);
        }
        vec3 blur=texture2D(tBlur,uv).rgb;
        col=mix(col,blur,smoothstep(.24,.52,abs(uv.y-.54))*uTilt);           // 微缩景观式移轴
        vec3 bloom=texture2D(tBloom,uv).rgb;
        col=mix(col,bloom,uBloom)+bloom*bloom*.004;
        col*=uExp*(1.+uFlash*.9);
        float l=dot(col,vec3(.2126,.7152,.0722));
        col=mix(vec3(l),col,uSat)*uTint;
        col=mix(col,col*vec3(.92,.97,1.08),smoothstep(.25,0.,l)*.6);          // 暗部偏冷
        col=aces(col);
        col*=1.-.42*smoothstep(.12,.62,r2);
        col=mix(col,vec3(.55,.03,.02),uDanger*smoothstep(.08,.5,r2)*(.55+.45*sin(uTime*7.)));
        float asp=uRes.x/uRes.y; vec2 fp=uv*vec2(asp,1.);
        float fr=fbm(fp*7.)+.35*fbm(fp*31.);
        float edge=smoothstep(1.3-uFrost*.4,1.75-uFrost*.4,length(c*vec2(1.,1.15))*2.+fr*.45);
        col=mix(col,vec3(.82,.92,1.)*(.75+.5*fbm(fp*60.)),edge*min(uFrost*1.6,1.)*.62);
        col=pow(col,vec3(1./2.2));
        col+=(hash(uv*uRes+fract(uTime)*91.)-.5)*.035;
        gl_FragColor=vec4(col,1.);
      }`, { tScene: { value: null }, tBloom: { value: null }, tBlur: { value: null }, uBloom: { value: 0.1 }, uExp: { value: 1 }, uTime: { value: 0 }, uFrost: { value: 0 }, uDanger: { value: 0 }, uFlash: { value: 0 }, uTilt: { value: 1 }, uTint: { value: new C(1, 1, 1) }, uRes: { value: new T.Vector2(1, 1) }, tDepth: { value: null }, uPx: { value: new T.Vector2(1, 1) }, uInk: { value: 0 }, uAO: { value: 1 }, uSat: { value: 1.03 }, uPxA: { value: 0.0012 } });
  }
  function blit(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }
  /* 画质：手机 / 平板（主指针是手指）渲染分辨率上限低一档、阴影贴图小一半。
     另外任何设备上只要帧率长时间跟不上，就把渲染分辨率一档一档往下调（只降不升），界面文字不受影响 */
  const lite = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  let prScale = 1, slowT = 0, ema = 16;
  function adapt(ms) {                                  // 每帧传入真实的帧间隔（毫秒）；由主循环调用
    if (ms > 120 || document.hidden || performance.now() < 9000) return;      // 切到后台、偶尔卡一下、刚打开页面还在编译着色器的那几秒都不算
    ema += (ms - ema) * 0.08;                           // 平滑后的帧间隔
    if (ema > 27) slowT += ms; else if (ema < 24) slowT = 0;
    if (slowT > 3000 && prScale > (lite ? 0.55 : 0.7)) { prScale *= 0.85; slowT = 0; ema = 20; resize(); }      // 连续 3 秒低于约 37 帧：降一档
  }
  function resize() {
    const pr = Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 1.5) * prScale;
    renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
    W = Math.max(2, Math.floor(innerWidth * pr)); H = Math.max(2, Math.floor(innerHeight * pr));
    camera.aspect = W / H; camera.updateProjectionMatrix();
    if (rt) { rt.depthTexture.dispose(); rt.dispose(); } mips.forEach(m => m.dispose()); ups.forEach(m => m.dispose()); mips = []; ups = [];
    const dtex = new T.DepthTexture(W, H); dtex.type = T.UnsignedIntType;            // 抗锯齿解析后的深度，供描边与接缝阴影读取
    rt = new T.WebGLRenderTarget(W, H, { type: T.HalfFloatType, samples: 4, depthBuffer: true, depthTexture: dtex });
    let w = W, h = H;
    for (let i = 0; i < 6; i++) {
      w = Math.max(2, w >> 1); h = Math.max(2, h >> 1);
      const o = { type: T.HalfFloatType, depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter };
      mips.push(new T.WebGLRenderTarget(w, h, o)); ups.push(new T.WebGLRenderTarget(w, h, o));
    }
    PM.final.uniforms.uRes.value.set(W, H);
  }

  /* --------------------------------- 初始化 -------------------------------- */
  function init(canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.localClippingEnabled = true; renderer.info.autoReset = true;
    scene = new T.Scene(); scene.fog = new T.FogExp2(0x8899aa, 0.0005);
    camera = new T.PerspectiveCamera(44, 1, 0.3, 16000);
    hemi = new T.HemisphereLight(0xffffff, 0x444444, 1); scene.add(hemi);
    sun = new T.DirectionalLight(0xffffff, 3); sun.castShadow = true;
    sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
    const sc = sun.shadow.camera; sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 1; sc.far = 140;
    scene.add(sun); scene.add(sun.target);
    fill = new T.DirectionalLight(0xffffff, 0.4); fill.position.set(4, 7, 12); scene.add(fill);
    pmrem = new T.PMREMGenerator(renderer);
    evalEnv();
    makeSky(); makeOcean(); makeClouds(); makeRain(); makePost();
    resize(); addEventListener('resize', resize);
  }

  function applyEnv(dt) {
    evalEnv();
    skyU.uTop.value.copy(env.top); skyU.uHor.value.copy(env.hor); skyU.uBot.value.copy(env.fog);
    skyU.uSunDir.value.copy(env.sunDir); skyU.uSunCol.value.copy(env.isSun ? env.key : tmpC.set('#ff8a5a')).multiplyScalar(env.sunVis);
    skyU.uMoonDir.value.copy(env.moonDir); skyU.uStars.value = env.stars; skyU.uMoon.value = env.moon;
    skyU.uTime.value = st.time; skyU.uFlash.value = st.flash; skyU.uOver.value = st.overcast; skyU.uScroll.value = st.scroll;
    scene.fog.color.copy(env.fog); scene.fog.density = 0.00042 + 0.0011 * st.overcast;
    hemi.color.copy(env.hs); hemi.groundColor.copy(env.hg); hemi.intensity = env.hI * (1 + st.flash * 2.5);
    sun.color.copy(env.key); sun.intensity = env.keyI + st.flash * 5;
    sun.position.copy(env.keyDir).multiplyScalar(60); sun.target.position.set(0, 0, 0);
    fill.color.copy(env.hs).lerp(env.key, 0.25); fill.intensity = env.hI * 0.5;
    const ou = oceanU;
    ou.uTime.value = st.time; ou.uOffset.value.set(st.scroll, 0); ou.uStorm.value = st.storm; ou.uDeep.value.copy(env.sea);
    { const wn = typeof P !== 'undefined' && P.detOn && P.photos.water; ou.uDet.value = wn ? 1 : 0; if (wn) ou.tWN.value = wn.n; }       // 写实画风且贴图已加载：用真实的水面法线
    ou.uHor.value.copy(env.hor); ou.uTop.value.copy(env.top); ou.uFog.value.copy(env.fog); ou.uFogD.value = scene.fog.density; ou.uFlash.value = st.flash;
    ou.uSunDir.value.copy(env.isSun ? env.sunDir : env.moonDir);
    ou.uSunCol.value.copy(env.key).multiplyScalar(env.isSun ? env.sunVis * 1.2 : env.moon * 0.55);
    ou.uFoam.value.copy(env.hs).multiplyScalar(env.hI * 0.8).add(tmpC.copy(env.key).multiplyScalar(env.keyI * 0.12));
    ocean.position.y = st.surfaceY - st.seaDrop;
    // 环境反射贴图（低频刷新）
    envTimer -= dt;
    if (envTimer <= 0 && (Math.abs(st.tod - envTod) > 0.012 || Math.abs(st.overcast - envOver) > 0.12)) {
      envTimer = 1.5; envTod = st.tod; envOver = st.overcast;
      const f = skyU.uFlash.value; skyU.uFlash.value = 0;
      const n = pmrem.fromScene(envScene, 0, 1, 500);
      skyU.uFlash.value = f;
      scene.environment = n.texture; if (envRT) envRT.dispose(); envRT = n;
    }
  }

  function frame(dt, skipDraw) {
    st.time += dt;
    st.scroll += WORLD_SPEED * st.speed * dt;
    st.flash = Math.max(0, st.flash - dt * (st.flash > 0.5 ? 6 : 2.2));
    if (boltT > 0) { boltT -= dt; bolt.material.opacity = Math.random() > 0.3 ? 1 : 0.25; if (boltT <= 0) bolt.visible = false; }
    applyEnv(dt);
    updateClouds(dt);
    rain.visible = st.rain > 0.02; rainU.uTime.value = st.time; rainU.uOp.value = st.rain * (0.55 + st.flash);
    rainU.uCol.value.copy(env.hs).multiplyScalar(1.6).addScalar(0.25);
    for (const fx of fxList) fx.update(dt);
    if (st.shake > 0.001) { camera.position.x += (Math.random() - 0.5) * st.shake; camera.position.y += (Math.random() - 0.5) * st.shake; camera.rotation.z += (Math.random() - 0.5) * st.shake * 0.02; }
    sky.position.copy(camera.position);
    if (skipDraw) return;
    // ---- 渲染 ----
    renderer.setRenderTarget(rt); renderer.render(scene, camera);
    let src = rt;
    for (let i = 0; i < mips.length; i++) {
      PM.down.uniforms.t.value = src.texture; PM.down.uniforms.px.value.set(1 / src.width, 1 / src.height);
      blit(PM.down, mips[i]); src = mips[i];
    }
    let low = mips[mips.length - 1];
    for (let i = mips.length - 2; i >= 0; i--) {
      PM.up.uniforms.tA.value = mips[i].texture; PM.up.uniforms.tB.value = low.texture; PM.up.uniforms.px.value.set(1 / low.width, 1 / low.height);
      blit(PM.up, ups[i]); low = ups[i];
    }
    const fu = PM.final.uniforms;
    fu.tScene.value = rt.texture; fu.tBloom.value = low.texture; fu.tBlur.value = mips[1].texture;
    fu.tDepth.value = rt.depthTexture; fu.uPx.value.set(1 / W, 1 / H); fu.uInk.value = st.ink; fu.uAO.value = st.ao; fu.uSat.value = st.sat; fu.uPxA.value = 2 * Math.tan(camera.fov * Math.PI / 360) / 720;   // 720p 下每像素的张角
    fu.uBloom.value = st.bloom; fu.uExp.value = env.exp * st.exposure; fu.uTime.value = st.time; fu.uFrost.value = st.frost; fu.uDanger.value = st.danger;
    fu.uFlash.value = st.flash; fu.uTilt.value = st.tilt; fu.uTint.value.copy(env.tint);
    blit(PM.final, null);
  }

  return {
    init, frame, makeFX, makeLand, lightning, st, env, K_ALT, WORLD_SPEED, adapt, get quality() { return { lite, prScale: +prScale.toFixed(2), pr: renderer.getPixelRatio() }; },
    get scene() { return scene; }, get camera() { return camera; }, get renderer() { return renderer; }, get clouds() { return clouds; },
  };
})();
