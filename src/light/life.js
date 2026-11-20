// Life: what the light brings to the model. Grown cells sprout grass (instanced blades swaying in the wind),
// gardens flower, and the landmark is a real tree. Everything is a few draw calls, so it runs on phones.
import * as THREE from "three";

const MAX_BLADES = 60000,
  MAX_FLOWERS = 6000,
  PER_CELL = 130,
  RISE = 1.6; // seconds a patch takes to come up

const hash = (x, z, i) => {
  const s = Math.sin(x * 127.1 + z * 311.7 + i * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

// one blade: a tapered strip, three rows, with its height in uv.y
function bladeGeo() {
  const g = new THREE.BufferGeometry(),
    w = 0.07,
    rows = [0, 0.45, 0.8],
    p = [],
    uv = [],
    idx = [];
  rows.forEach((y, r) => {
    const k = w * (1 - y);
    p.push(-k, y, 0, k, y, 0);
    uv.push(0, y, 1, y);
    if (r) idx.push(2 * r - 2, 2 * r - 1, 2 * r, 2 * r - 1, 2 * r + 1, 2 * r);
  });
  p.push(0, 1, 0);
  uv.push(0.5, 1);
  idx.push(4, 5, 6);
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const SWAY = /* glsl */ `
  uniform float uTime,uDay;attribute float aBorn;attribute vec3 aCol;varying vec3 vCol;varying float vY,vLit;
  vec3 grow(vec3 p,float h){
    float a=smoothstep(aBorn,aBorn+${RISE.toFixed(1)},uTime);a=a*a*(3.-2.*a);
    return p*vec3(1.,a,1.)*(.3+.7*a);}
`;

export function createLife(scene, U) {
  const uni = {
    uTime: { value: 0 },
    uDay: U.day,
    light: U.light,
    lO: U.lO,
    lS: U.lS,
  };
  const lightFrag = /* glsl */ `
    uniform sampler2D light;uniform vec2 lO;uniform float lS;
    float lit(vec2 w){vec2 u=(w-lO)/lS;if(u.x<0.||u.y<0.||u.x>1.||u.y>1.)return 0.;return 1.-exp(-texture2D(light,u).r*2.4);}`;

  // ---------- grass ----------
  const bg = new THREE.InstancedBufferGeometry().copy(bladeGeo());
  const born = new Float32Array(MAX_BLADES).fill(1e9),
    col = new Float32Array(MAX_BLADES * 3);
  bg.setAttribute("aBorn", new THREE.InstancedBufferAttribute(born, 1));
  bg.setAttribute("aCol", new THREE.InstancedBufferAttribute(col, 3));
  const grass = new THREE.InstancedMesh(
    bg,
    new THREE.ShaderMaterial({
      uniforms: uni,
      side: THREE.DoubleSide,
      vertexShader:
        SWAY +
        lightFrag +
        /* glsl */ `
      void main(){
        vY=uv.y;vCol=aCol;
        vec3 p=grow(position,uv.y);
        vec4 w=modelMatrix*instanceMatrix*vec4(p,1.);
        float s=sin(uTime*1.7+w.x*.7+w.z*.5)+.4*sin(uTime*3.1+w.x*1.9);
        w.xz+=vec2(.09,.05)*s*uv.y*uv.y;
        vLit=lit(w.xz);
        gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: /* glsl */ `
      uniform float uDay;varying vec3 vCol;varying float vY,vLit;
      void main(){
        vec3 c=mix(vCol*.42,vCol,vY);c=mix(c,c+vec3(.12,.1,.02),vY*vY);
        float k=max(mix(.55,1.,uDay),vLit*1.1);
        c*=k*mix(vec3(.75,.8,.95),vec3(1.,.96,.86),max(uDay,vLit));
        gl_FragColor=vec4(c,1.);}`,
    }),
    MAX_BLADES,
  );
  grass.count = 0;
  grass.frustumCulled = false;
  scene.add(grass);

  // ---------- flowers: five petals around a centre, flat-shaded ----------
  const fg = new THREE.InstancedBufferGeometry().copy(
    new THREE.CylinderGeometry(0.12, 0.03, 0.06, 5, 1).translate(0, 0.3, 0),
  );
  const fBorn = new Float32Array(MAX_FLOWERS).fill(1e9),
    fCol = new Float32Array(MAX_FLOWERS * 3);
  fg.setAttribute("aBorn", new THREE.InstancedBufferAttribute(fBorn, 1));
  fg.setAttribute("aCol", new THREE.InstancedBufferAttribute(fCol, 3));
  const flowers = new THREE.InstancedMesh(
    fg,
    new THREE.ShaderMaterial({
      uniforms: uni,
      vertexShader:
        SWAY +
        lightFrag +
        /* glsl */ `
      void main(){
        vY=1.;vCol=aCol;
        vec3 p=grow(position,1.);
        vec4 w=modelMatrix*instanceMatrix*vec4(p,1.);
        w.xz+=vec2(.06,.03)*sin(uTime*1.7+w.x*.7+w.z*.5);
        vLit=lit(w.xz);
        gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: /* glsl */ `
      uniform float uDay;varying vec3 vCol;varying float vY,vLit;
      void main(){float k=max(mix(.7,1.,uDay),vLit*1.15);gl_FragColor=vec4(vCol*k,1.);}`,
    }),
    MAX_FLOWERS,
  );
  flowers.count = 0;
  flowers.frustumCulled = false;
  scene.add(flowers);

  const M = new THREE.Matrix4(),
    Q = new THREE.Quaternion(),
    Y = new THREE.Vector3(0, 1, 0),
    S = new THREE.Vector3(),
    P = new THREE.Vector3(),
    done = new Set(),
    GRASS = [
      [0.36, 0.55, 0.22],
      [0.44, 0.6, 0.26],
      [0.52, 0.64, 0.3],
      [0.4, 0.52, 0.24],
    ],
    PETAL = [
      [0.97, 0.95, 0.88],
      [0.98, 0.82, 0.32],
      [0.93, 0.55, 0.45],
      [0.72, 0.62, 0.86],
    ];

  function sprout(k, at, garden, grown) {
    if (done.has(k)) return;
    done.add(k);
    const [cx, cz] = k.split(",").map(Number);
    // fewer, shorter blades where the field ends, so a patch has a soft edge
    let nb = 0;
    for (const [a, b] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ])
      nb += grown.has(cx + a + "," + (cz + b)) ? 1 : 0;
    const edge = 0.35 + 0.65 * (nb / 8);
    for (let i = 0; i < PER_CELL * edge && grass.count < MAX_BLADES; i++) {
      const n = grass.count++,
        h = (0.14 + 0.2 * hash(cx, cz, i * 3 + 1)) * (0.6 + 0.4 * edge);
      P.set(cx + hash(cx, cz, i), 0, cz + hash(cx, cz, i + 99));
      Q.setFromAxisAngle(Y, hash(cx, cz, i + 7) * Math.PI);
      S.set(0.8 + 0.6 * hash(cx, cz, i + 5), h, 1);
      grass.setMatrixAt(n, M.compose(P, Q, S));
      born[n] = at + hash(cx, cz, i + 3) * 0.6;
      col.set(GRASS[Math.floor(hash(cx, cz, i + 11) * 4)], n * 3);
    }
    const nf = garden
      ? 7
      : hash(cx, cz, 500) < 0.25
        ? 1 + Math.floor(hash(cx, cz, 501) * 2)
        : 0;
    for (let i = 0; i < nf && flowers.count < MAX_FLOWERS; i++) {
      const n = flowers.count++;
      P.set(
        cx + 0.15 + 0.7 * hash(cx, cz, i + 40),
        0,
        cz + 0.15 + 0.7 * hash(cx, cz, i + 60),
      );
      Q.setFromAxisAngle(Y, hash(cx, cz, i) * 6);
      S.setScalar(0.8 + 0.5 * hash(cx, cz, i + 80));
      S.y *= 0.9 + 0.6 * hash(cx, cz, i + 90);
      flowers.setMatrixAt(n, M.compose(P, Q, S));
      fBorn[n] = at + 0.8 + hash(cx, cz, i + 20) * 0.8;
      fCol.set(PETAL[Math.floor(hash(cx, cz, i + 30) * 4)], n * 3);
    }
  }

  return {
    // grown: Map cell -> time it grew (from grow.js); gardens: Set of cells that are a diffuser's garden
    sync(grown, gardens) {
      const n0 = grass.count,
        f0 = flowers.count;
      for (const [k, at] of grown) sprout(k, at, gardens.has(k), grown);
      if (grass.count !== n0) {
        grass.instanceMatrix.needsUpdate = true;
        bg.attributes.aBorn.needsUpdate = bg.attributes.aCol.needsUpdate = true;
      }
      if (flowers.count !== f0) {
        flowers.instanceMatrix.needsUpdate = true;
        fg.attributes.aBorn.needsUpdate = fg.attributes.aCol.needsUpdate = true;
      }
    },
    update(t) {
      uni.uTime.value = t;
    },
  };
}

// The landmark: a broad, low-poly tree, flat-shaded like the site's cubes are flat-coloured.
export function createRealTree(x, z) {
  const g = new THREE.Group(),
    bark = new THREE.MeshLambertMaterial({
      color: 0x6b4f3a,
      flatShading: true,
    }),
    leaf = [0x5d8a43, 0x6f9a4c, 0x4f7a3c].map(
      (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }),
    );
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.3, 2.2, 7).translate(0, 1.1, 0),
    bark,
  );
  g.add(trunk);
  for (const [bx, by, bz, a] of [
    [0.35, 1.5, 0.1, -0.7],
    [-0.3, 1.7, -0.2, 0.8],
  ]) {
    const br = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.11, 1, 5).translate(0, 0.5, 0),
      bark,
    );
    br.position.set(0, by - 0.4, 0);
    br.rotation.set(bz * 2, 0, a);
    g.add(br);
    void bx;
  }
  const crowns = [
    [0, 2.9, 0, 1.25],
    [0.85, 2.45, 0.3, 0.85],
    [-0.8, 2.6, -0.25, 0.9],
    [0.2, 2.55, -0.85, 0.8],
    [-0.25, 2.4, 0.8, 0.8],
    [0.1, 3.6, 0.1, 0.75],
  ];
  crowns.forEach(([cx, cy, cz, r], i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaf[i % 3]);
    m.position.set(cx, cy, cz);
    m.rotation.set(i, i * 2, 0);
    m.scale.y = 0.85;
    g.add(m);
  });
  g.position.set(x, 0, z);
  g.traverse((o) => (o.renderOrder = 4));
  return g;
}
