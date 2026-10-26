// The scene behind the page, filmed in ASCII.
//
// Pass one paints a small colour picture, one pixel per character: an eye opens, you fall into its pupil, the pupil
// opens onto a spiral galaxy. Pass two turns each pixel into a character. The characters come from a ramp that is
// sorted by measured ink, edges get line glyphs that follow them, and the image gets bloom, an anamorphic streak,
// chromatic fringing and grain. On the home page the scroll position drives the fall; elsewhere the galaxy turns.
// site.grade(name) tints the characters per section. Does nothing without WebGL2.
(() => {
  const canvas = document.querySelector('.scene-gl');
  const gl = canvas?.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return;

  const root = document.documentElement;
  const reduce = root.classList.contains('reduce');
  const home = root.dataset.page === 'home';

  const N = 30;                 // glyphs in the tonal ramp
  const CELL = [9, 16];         // one character, in CSS pixels
  const FALL = 2.2;             // screens of scroll from the whole eye to the whole galaxy

  const VERT = `#version 300 es
layout(location = 0) in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

  // ---------- pass one: the picture ----------

  const SCENE = `#version 300 es
precision highp float;
uniform vec2 uCells;
uniform float uAsp;
uniform float uTime;
uniform float uZoom;      // 0 = the whole eye, 1 = the whole galaxy
uniform float uOpen;      // eyelids, 0 shut, 1 open
uniform float uSpeed;     // how fast the camera is moving, for motion blur
uniform vec2 uMouse;
out vec4 outColor;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// ---- the eye ----

vec3 eye(vec2 q, float t, out float pupilMask) {
  float ax = abs(q.x);
  float base = 0.38 * pow(max(1.0 - (ax / 1.12) * (ax / 1.12), 0.0), 0.7);
  float upper = base * (0.12 + 0.88 * uOpen);
  float lower = base * 0.6;
  float inside = smoothstep(0.0, 0.014, upper - q.y) * smoothstep(0.0, 0.014, q.y + lower);

  // Where the eye looks: the iris follows the cursor a little.
  vec2 ic = (uMouse - 0.5) * vec2(0.16, 0.07) * (1.0 - smoothstep(0.0, 0.5, uZoom));
  vec2 d = q - ic;
  float r = length(d), a = atan(d.y, d.x);

  float ri = 0.30;
  float rp = 0.105 + 0.014 * sin(t * 0.6) + 0.07 * smoothstep(0.15, 0.55, uZoom);   // the pupil opens as we fall in

  // sclera: grey white, veined from the corners, shaded by the lids
  float vein = fbm(vec2(atan(q.y, q.x + sign(q.x) * 1.4) * 6.0, length(q) * 8.0) + 3.0);
  vec3 sclera = vec3(0.8, 0.78, 0.76);
  sclera -= vec3(0.0, 0.32, 0.3) * smoothstep(0.5, 0.9, vein) * smoothstep(ri + 0.05, 0.8, r);
  sclera *= 0.32 + 0.68 * smoothstep(0.0, 0.16, upper - q.y) * smoothstep(0.0, 0.12, q.y + lower);
  sclera *= 1.0 - 0.55 * smoothstep(0.45, 1.05, ax);
  sclera += vec3(0.7, 0.3, 0.3) * 0.5 * exp(-dot(q - vec2(-sign(q.x) * 0.97, -0.01), q - vec2(-sign(q.x) * 0.97, -0.01)) * 500.0) * step(q.x, -0.8);

  // iris: radial fibres, crypts, a bright collarette and a dark limbal ring
  float fibres = fbm(vec2(a * 16.0, r * 8.0 - t * 0.03));
  float fine = noise(vec2(a * 55.0, r * 4.0));
  float crypts = smoothstep(0.62, 0.8, fbm(vec2(a * 7.0, r * 18.0) + 9.0)) * smoothstep(rp + 0.03, rp + 0.12, r);
  vec3 irisLo = vec3(0.34, 0.15, 0.04);
  vec3 irisHi = vec3(0.98, 0.66, 0.24);
  vec3 iris = mix(irisLo, irisHi, clamp(fibres * 1.2 + fine * 0.25, 0.0, 1.0));
  float collar = smoothstep(rp + 0.02, rp + 0.075, r) * (1.0 - smoothstep(rp + 0.075, rp + 0.13, r));
  iris = mix(iris, vec3(1.0, 0.82, 0.5), collar * 0.5);
  iris *= 1.0 - 0.55 * crypts;
  iris *= mix(1.0, 0.28, smoothstep(ri - 0.06, ri, r));
  iris *= 0.45 + 0.55 * smoothstep(-0.05, 0.28, upper - q.y);     // the upper lid shades the iris

  float inIris = 1.0 - smoothstep(ri - 0.005, ri + 0.005, r);
  vec3 col = mix(sclera, iris, inIris);
  float pm = 1.0 - smoothstep(rp - 0.004, rp + 0.004, r);
  col = mix(col, vec3(0.0), pm);

  // skin and the crease above the lid
  vec3 skin = vec3(0.2, 0.1, 0.065) * (0.4 + 0.6 * noise(q * 9.0));
  float crease = exp(-pow((q.y - (upper * 1.45 + 0.028)) / 0.011, 2.0)) * smoothstep(1.1, 0.7, ax);
  skin += vec3(0.5, 0.32, 0.2) * crease * 0.5;
  col = mix(skin, col, inside);
  float lidEdge = smoothstep(0.018, 0.0, abs(q.y - upper)) * smoothstep(1.12, 0.3, ax);
  col *= 1.0 - 0.92 * lidEdge;                                   // the lash line, a dark contour
  col += vec3(0.55, 0.26, 0.22) * smoothstep(0.011, 0.0, abs(q.y + lower)) * smoothstep(1.0, 0.3, ax) * 0.8;   // the wet lower rim

  // the light on the cornea: a soft box and a small dot. It stays on top when the galaxy shows through.
  vec2 hp = d - vec2(-0.1, 0.095);
  float box = smoothstep(0.01, 0.0, max(abs(hp.x) - 0.062, abs(hp.y) - 0.036));
  float dot2 = smoothstep(0.016, 0.0, length(d - vec2(0.085, -0.075)));
  col += (box * 0.9 + dot2 * 0.4) * inside * (1.0 - 0.7 * smoothstep(0.55, 0.8, uZoom));

  pupilMask = pm * inside;
  return col;
}

// ---- the galaxy ----

vec3 starfield(vec2 gp, float t) {
  vec3 acc = vec3(0.0);
  for (int l = 0; l < 3; l++) {
    float s = 28.0 + float(l) * 34.0;
    vec2 sg = gp * s + float(l) * 17.3;
    vec2 id = floor(sg);
    float h = hash(id);
    float on = step(0.93 - float(l) * 0.01, h);
    float tw = 0.55 + 0.45 * sin(t * (1.0 + h * 3.0) + h * 40.0);
    float sh = smoothstep(0.34, 0.0, length(fract(sg) - 0.5)) * on * tw;
    vec3 tone = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.6), hash(id + 3.3));
    acc += tone * sh * (0.5 + 0.9 * h) / (1.0 + float(l));
  }
  return acc;
}

vec3 galaxy(vec2 gp, float t) {
  float r = length(gp) + 1e-4;
  float a = atan(gp.y, gp.x);
  float spin = a - 1.7 * log(r + 0.05) + t * 0.1;
  float arms = pow(0.5 + 0.5 * cos(2.0 * spin), 2.5);
  float lane = pow(0.5 + 0.5 * cos(2.0 * (spin + 0.55)), 5.0);
  float disk = exp(-r * 1.7);
  float clump = fbm(gp * 9.0 + vec2(0.0, t * 0.015));
  float knots = smoothstep(0.7, 0.86, fbm(gp * 15.0 - 4.0)) * arms * disk;

  vec3 col = vec3(1.0, 0.78, 0.45) * (exp(-r * r * 38.0) * 1.8 + exp(-r * 6.0) * 0.55);
  col += mix(vec3(0.22, 0.38, 1.0), vec3(0.75, 0.5, 1.0), clump) * arms * disk * (0.5 + clump) * 1.7;
  col += vec3(1.0, 0.35, 0.55) * knots * 1.4;
  col *= 1.0 - 0.65 * lane * disk * smoothstep(0.08, 0.4, r);
  col += starfield(gp, t);
  return col;
}

vec3 sceneAt(vec2 p, float zz, float w, vec2 centre, float roll, float t) {
  vec2 q = rot(roll) * (p - centre) / zz;
  float pm;
  vec3 e = eye(q, t, pm);
  vec3 g = galaxy(rot(-t * 0.02) * q / 0.115 * w, t);
  // a rim of light where the galaxy first shows at the edge of the pupil
  float rp = 0.105 + 0.07 * smoothstep(0.15, 0.55, uZoom);
  float rim = exp(-pow((length(q - (uMouse - 0.5) * vec2(0.16, 0.07) * (1.0 - smoothstep(0.0, 0.5, uZoom))) - rp) / 0.016, 2.0));
  vec3 col = mix(e, g, pm);
  col += vec3(0.7, 0.85, 1.0) * rim * smoothstep(0.2, 0.5, uZoom) * (1.0 - smoothstep(0.62, 0.8, uZoom)) * 0.5;
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uCells;
  vec2 p = (uv - 0.5) * vec2(uAsp, 1.0);

  float fall = min(uZoom / 0.78, 1.0);
  float zz = 0.8 * pow(22.0, fall);                         // the camera falls into the pupil
  float w = 1.0 + 2.4 * smoothstep(0.78, 1.0, uZoom);       // then pulls back to show the whole galaxy
  vec2 centre = vec2(mix(0.16, 0.0, smoothstep(0.0, 0.6, uZoom)), 0.0);
  float roll = 0.35 * smoothstep(0.3, 1.0, uZoom) + 0.004 * sin(uTime * 0.9);   // a slow roll, a little hand shake

  // motion blur along the line of the zoom
  vec3 col = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    vec2 pi = (p - centre) * (1.0 - uSpeed * 0.06 * float(i)) + centre;
    col += sceneAt(pi, zz * (1.0 + uSpeed * 0.02 * float(i)), w, centre, roll, uTime);
  }
  col /= 5.0;

  // a white-out as the pupil takes the whole frame
  col += vec3(0.65, 0.8, 1.0) * exp(-pow((uZoom - 0.66) / 0.05, 2.0)) * 0.1;

  col = 1.0 - exp(-col * 1.05);                              // filmic roll-off
  outColor = vec4(col, 1.0);
}`;

  // ---------- pass two: the characters ----------

  const ASCII = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform vec2 uCells;
uniform vec2 uCellPx;
uniform vec2 uRes;
uniform vec3 uTint;
uniform float uPower;
uniform float uTime;
out vec4 outColor;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 cellAt(ivec2 c) { return texelFetch(uScene, clamp(c, ivec2(0), ivec2(uCells) - 1), 0).rgb; }

void main() {
  vec2 fc = gl_FragCoord.xy;
  ivec2 cell = ivec2(floor(fc / uCellPx));
  vec2 local = fract(fc / uCellPx);
  vec2 suv = fc / (uCells * uCellPx);

  vec3 c = cellAt(cell);
  float L = luma(c);
  float Lr = luma(cellAt(cell + ivec2(1, 0)));
  float Ll = luma(cellAt(cell + ivec2(-1, 0)));
  float Lu = luma(cellAt(cell + ivec2(0, 1)));
  float Ld = luma(cellAt(cell + ivec2(0, -1)));
  vec2 g = vec2(Lr - Ll, Lu - Ld);

  // tone: a little temporal dither so the characters shimmer like film grain instead of banding
  float dither = hash(vec2(cell) + floor(uTime * 14.0)) - 0.5;
  float level = clamp(pow(L, 0.8) * ${N}.0 + dither * 0.9, 0.0, ${N}.0 - 0.01);
  float idx = floor(level);

  // edges become line glyphs that follow them
  float mag = length(g);
  if (mag > 0.15 && L > 0.1) {
    float e = abs(g.x) > 2.0 * abs(g.y) ? 1.0 : (abs(g.y) > 2.0 * abs(g.x) ? 0.0 : (g.x * g.y > 0.0 ? 3.0 : 2.0));
    idx = ${N}.0 + e;   // the line glyphs sit after the ramp
  }

  float total = ${N}.0 + 4.0;
  vec2 gu = vec2((idx + 0.06 + 0.88 * local.x) / total, 0.04 + 0.92 * (1.0 - local.y));
  // chromatic fringing grows toward the edges of the frame
  vec2 off = (fc / uRes - 0.5) * vec2(0.0022, 0.0);
  vec3 a = vec3(texture(uAtlas, gu + off).a, texture(uAtlas, gu).a, texture(uAtlas, gu - off).a);

  vec3 ink = c * (0.85 + 1.1 * L) * uTint;

  // bloom, from the blurred levels of the picture
  vec3 glow = textureLod(uScene, suv, 3.0).rgb * 0.7 + textureLod(uScene, suv, 5.0).rgb * 0.9;

  // anamorphic streak: bright parts smear sideways, blue
  vec3 streak = vec3(0.0);
  for (int i = -8; i <= 8; i++) {
    vec3 s = textureLod(uScene, suv + vec2(float(i) * 0.014, 0.0), 2.0).rgb;
    streak += max(s - 0.65, 0.0) * (1.0 - abs(float(i)) / 9.0);
  }
  streak *= vec3(0.45, 0.7, 1.0) * 0.45;

  vec2 uv = fc / uRes;
  float vig = smoothstep(1.2, 0.25, length((uv - 0.5) * vec2(1.3, 1.0)));
  vec3 col = vec3(0.03, 0.034, 0.046) + glow * uPower * 0.07 * uTint + streak * uPower * 0.22 + ink * a * uPower * 0.8;
  col *= 0.4 + 0.6 * vig;
  col += (hash(fc + uTime * 61.0) - 0.5) * 0.028;   // grain
  outColor = vec4(col, 1.0);
}`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  function program(frag) {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null;
  }

  const sceneProg = program(SCENE);
  const asciiProg = program(ASCII);
  if (!sceneProg || !asciiProg) return;

  // One oversized triangle covers whatever is being drawn into.
  gl.bindVertexArray(gl.createVertexArray());
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const loc = (prog, names) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]));
  const us = loc(sceneProg, ['uCells', 'uAsp', 'uTime', 'uZoom', 'uOpen', 'uSpeed', 'uMouse']);
  const ua = loc(asciiProg, ['uScene', 'uAtlas', 'uCells', 'uCellPx', 'uRes', 'uTint', 'uPower', 'uTime']);

  // ---------- the glyph atlas: a ramp sorted by how much ink each character really has ----------

  const atlas = gl.createTexture();
  function buildAtlas() {
    const gw = 40, gh = 72;
    const font = `600 ${gh * 0.78}px "Geist Mono", ui-monospace, Menlo, monospace`;
    const CAND = ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';
    const m = document.createElement('canvas');
    m.width = gw;
    m.height = gh;
    const mg = m.getContext('2d', { willReadFrequently: true });
    const draw = (g, ch, x) => { g.font = font; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff'; g.fillText(ch, x + gw / 2, gh * 0.76); };
    const ink = [...CAND].map((ch) => {
      mg.clearRect(0, 0, gw, gh);
      draw(mg, ch, 0);
      const d = mg.getImageData(0, 0, gw, gh).data;
      let s = 0;
      for (let i = 3; i < d.length; i += 4) s += d[i];
      return { ch, s };
    }).sort((a, b) => a.s - b.s);
    const max = ink[ink.length - 1].s * 0.92;
    const ramp = [];
    for (let k = 0; k < N; k++) {
      const want = (k / (N - 1)) * max;
      let best = null;
      for (const e of ink) if (!ramp.includes(e.ch) && (!best || Math.abs(e.s - want) < Math.abs(best.s - want))) best = e;
      ramp.push(best.ch);
    }
    const glyphs = [...ramp, '-', '|', '/', '\\'];
    const c = document.createElement('canvas');
    c.width = gw * glyphs.length;
    c.height = gh;
    const g = c.getContext('2d');
    glyphs.forEach((ch, i) => { if (ch !== ' ') draw(g, ch, gw * i); });
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    window.site = Object.assign(window.site || {}, { asciiRamp: ramp.join('') });
  }
  buildAtlas();
  (document.fonts?.load('600 40px "Geist Mono"') || Promise.resolve()).then(() => { buildAtlas(); draw(); }).catch(() => {});

  // ---------- the picture: a framebuffer with one pixel per character ----------

  const target = gl.createTexture();
  const fbo = gl.createFramebuffer();
  let cols = 1, rows = 1, W = 1, H = 1, cellPx = [CELL[0], CELL[1]];

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = Math.max(2, Math.round(innerWidth * dpr));
    H = Math.max(2, Math.round(innerHeight * dpr));
    canvas.width = W;
    canvas.height = H;
    cellPx = [CELL[0] * dpr, CELL[1] * dpr];
    cols = Math.ceil(W / cellPx[0]);
    rows = Math.ceil(H / cellPx[1]);
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    draw();
  }

  // Section tints (multiplied into the characters).
  const GRADES = { cold: [0.92, 0.97, 1.05], amber: [1.05, 0.98, 0.9], teal: [0.9, 1.04, 1.02], ember: [1.06, 0.94, 0.9] };
  const tint = [...GRADES.cold];
  let tintTarget = GRADES.cold;

  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  const goalZoom = () => (home ? Math.min(Math.max(scrollY / (innerHeight * FALL), 0), 1) : 1);
  let time = 0;
  let last = 0;
  let zoom = goalZoom();
  let speed = 0;
  let openStart = home && scrollY < 50 ? Infinity : -10;   // when the lids start to lift
  const basePower = home ? 0.4 : 0.38;
  let power = basePower;

  function draw() {
    const open = reduce || openStart === -10 ? 1 : Math.min(Math.max((time - openStart - 0.3) / 2.6, 0), 1);
    const eased = open * open * (3 - 2 * open);
    const tb = time % 7;
    const blink = tb < 0.2 && eased >= 1 && zoom < 0.2 ? Math.sin((Math.PI * tb) / 0.2) : 0;

    // pass one
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, cols, rows);
    gl.useProgram(sceneProg);
    gl.uniform2f(us.uCells, cols, rows);
    gl.uniform1f(us.uAsp, W / H);
    gl.uniform1f(us.uTime, time);
    gl.uniform1f(us.uZoom, zoom);
    gl.uniform1f(us.uOpen, eased * (1 - 0.88 * blink));
    gl.uniform1f(us.uSpeed, Math.min(Math.abs(speed) * 7, 1));
    gl.uniform2f(us.uMouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.generateMipmap(gl.TEXTURE_2D);

    // pass two
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(asciiProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.uniform1i(ua.uScene, 0);
    gl.uniform1i(ua.uAtlas, 1);
    gl.uniform2f(ua.uCells, cols, rows);
    gl.uniform2f(ua.uCellPx, cellPx[0], cellPx[1]);
    gl.uniform2f(ua.uRes, W, H);
    gl.uniform3fv(ua.uTint, tint);
    gl.uniform1f(ua.uPower, power);
    gl.uniform1f(ua.uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    if (document.hidden) return;
    time += dt;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    const k = Math.min(dt * 1.6, 1);
    for (let i = 0; i < 3; i++) tint[i] += (tintTarget[i] - tint[i]) * k;
    if (home) {
      // A camera on a rail: it eases toward where the scroll says it should be.
      const goal = goalZoom();
      const next = zoom + (goal - zoom) * Math.min(dt * 2.6, 1);
      speed = dt ? (next - zoom) / dt : 0;
      zoom = next;
      power = basePower + 0.2 * (1 - Math.min(zoom * 2.5, 1));   // the opening shot is the brightest
    }
    draw();
  }

  addEventListener('pointermove', (e) => {
    mouse.tx = e.clientX / innerWidth;
    mouse.ty = 1 - e.clientY / innerHeight;
  }, { passive: true });
  addEventListener('resize', resize);
  if (reduce) addEventListener('scroll', () => { zoom = goalZoom(); draw(); }, { passive: true });
  resize();
  if (!reduce) requestAnimationFrame(frame);

  window.site = Object.assign(window.site || {}, {
    sceneGL: { canvas },
    // Section calls this when it takes over the screen.
    grade: (name) => { tintTarget = GRADES[name] || GRADES.cold; if (reduce) { tint.splice(0, 3, ...tintTarget); draw(); } },
  });

  // The lids lift once the opening curtain is gone; the canvas fades in with them.
  const show = () => { canvas.style.transition = reduce ? 'none' : 'opacity 2.4s ease'; canvas.style.opacity = '1'; };
  if (window.site?.ready) window.site.ready.then(show); else show();
  if (home && openStart === Infinity) {
    const start = () => { openStart = time; };
    if (window.site?.opened) window.site.opened.then(start); else setTimeout(start, 400);
  }
})();
