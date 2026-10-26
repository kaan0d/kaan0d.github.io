// The scene behind the page, filmed in ASCII.
//
// Pass one paints a small colour picture, one pixel per character: a ringed giant lit by its sun, its ring
// turning, stars and now and then a meteor. Scrolling down the page rolls the camera, moves it closer and swings
// the sunlight from behind the planet's left shoulder round to its right, so the page ends on a lit face. Pass two
// turns each pixel into a character. The characters come from a ramp that is sorted by measured ink, edges get
// line glyphs that follow them, and the image gets bloom, an anamorphic streak, chromatic fringing and grain.
// site.grade(name) tints the characters per section. Does nothing without WebGL2.
(() => {
  const canvas = document.querySelector('.scene-gl');
  const gl = canvas?.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return;

  const root = document.documentElement;
  const reduce = root.classList.contains('reduce');

  const N = 30;                 // tonal levels
  const CAND = ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';
  const M = [...CAND].length;   // every glyph the atlas holds, sorted by ink
  const WINDOW = 44;            // how far from its own tone a cell may wander when it picks a letter
  // Quality tiers: the page starts on the best one the device probably affords and steps down by itself
  // when frames run long. Each tier is a pixel ratio, a character size (CSS px) and whether the costly streak is drawn.
  const TIERS = [
    { dpr: 1.5, cell: [11, 18], lite: 0, skip: 0 },
    { dpr: 1.0, cell: [11, 18], lite: 1, skip: 0 },
    { dpr: 0.75, cell: [14, 23], lite: 1, skip: 1 },   // skip: draw every other frame
  ];
  let tier = innerWidth < 900 || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 ? 1 : 0;

  const VERT = `#version 300 es
layout(location = 0) in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

  // ---------- pass one: the picture ----------

  const SCENE = `#version 300 es
precision highp float;
uniform vec2 uCells;
uniform float uAsp;
uniform float uTime;
uniform float uScroll;   // 0 at the top of the page, 1 at the bottom, eased
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

// A meteor now and then.
vec3 shoot(vec2 p, float t) {
  float slot = floor(t * 0.4);
  float ph = fract(t * 0.4);
  float h = hash(vec2(slot, 1.7));
  if (h < 0.5) return vec3(0.0);
  vec2 a0 = (vec2(hash(vec2(slot, 2.1)), hash(vec2(slot, 3.7))) - 0.5) * vec2(2.0, 1.0);
  vec2 dir = normalize(vec2(hash(vec2(slot, 5.5)) > 0.5 ? 1.0 : -1.0, -0.45 - h * 0.3));
  vec2 d = p - (a0 + dir * ph * 1.4);
  float behind = dot(d, -dir);
  float across = abs(dot(d, vec2(-dir.y, dir.x)));
  float line = smoothstep(0.006, 0.0, across) * smoothstep(0.35, 0.0, behind) * step(0.0, behind);
  return vec3(0.8, 0.9, 1.0) * line * (1.0 - ph) * 1.5;
}

// The ringed giant: banded clouds that drift, lit from the angle la, a thin blue limb, the ring passing in front
// below and behind above. The ring is made of clumps and gaps that travel round it, so the whole ring turns.
vec3 planet(vec2 q, float t, float la) {
  float R = 0.34;
  float r = length(q);
  vec3 col = vec3(1.0, 0.82, 0.5) * (exp(-r * r * 40.0) * 0.8 + exp(-r * 3.0) * 0.15);   // the sun, behind it
  vec2 rq = rot(-0.25) * q;
  float rd = length(vec2(rq.x, rq.y / 0.26));
  float ring = smoothstep(0.52, 0.54, rd) * smoothstep(0.95, 0.93, rd);
  float grain = 0.5 + 0.5 * sin(rd * 140.0 + fbm(vec2(rd * 30.0, 1.0)) * 6.0);
  float ra = atan(rq.y / 0.26, rq.x) + t * 0.12 / rd;   // inner parts go round faster, like a real ring
  float clumps = fbm(vec2(cos(ra), sin(ra)) * 3.0 + rd * 9.0);
  vec3 ringCol = mix(vec3(0.6, 0.5, 0.38), vec3(0.95, 0.85, 0.65), grain) * (0.4 + 0.6 * fbm(vec2(rd * 60.0, 3.0)));
  ringCol *= 0.35 + 1.3 * smoothstep(0.3, 0.7, clumps);
  vec2 lightDir = vec2(cos(la), sin(la));
  if (r < R) {
    vec3 n = vec3(q / R, sqrt(max(1.0 - dot(q / R, q / R), 0.0)));
    float dif = clamp(dot(n, normalize(vec3(lightDir * 0.83, 0.6))), 0.0, 1.0);
    float band = sin(n.y * 14.0 + fbm(vec2(n.x * 2.5 + t * 0.02, n.y * 5.0)) * 3.5);
    vec3 pc = mix(vec3(0.85, 0.55, 0.28), vec3(0.95, 0.85, 0.65), 0.5 + 0.5 * band);
    pc = mix(pc, vec3(0.5, 0.3, 0.2), smoothstep(0.55, 0.8, fbm(vec2(n.x * 4.0, n.y * 9.0 - t * 0.03))));
    col = pc * (0.06 + dif * 1.25);
    col += vec3(0.5, 0.7, 1.0) * pow(1.0 - n.z, 3.0) * (0.2 + 0.8 * dif);
    if (rq.y < 0.0) col = mix(col, ringCol * 1.1, ring * 0.9);
  } else {
    col += vec3(0.4, 0.6, 1.0) * exp(-(r - R) * 38.0) * 0.35 * smoothstep(-0.2, 0.6, dot(q / r, normalize(lightDir)));
    col = mix(col, ringCol, ring * 0.9);
  }
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uCells;
  vec2 p = (uv - 0.5) * vec2(uAsp, 1.0);

  // Wide screens hold the planet right of centre, clear of the text column; narrow ones centre it and shrink it
  // to fit. It breathes a little in size and sways a little, so it is never quite still. The scroll rolls it,
  // brings it closer, slides it right so the closing text has room, and moves the sun from the upper left
  // (2.57 rad) over the top to the right.
  float sc = uScroll * uScroll * (3.0 - 2.0 * uScroll);
  vec2 centre = uAsp > 1.0 ? vec2(uAsp * 0.5 - 0.5 + 0.2 * sc, 0.06 - 0.08 * sc) : vec2(0.0, 0.22);
  float size = min(0.8, uAsp * 1.05) * (1.0 + 0.025 * sin(uTime * 0.11)) * (1.0 + 0.4 * sc);
  vec2 q = rot(0.03 * sin(uTime * 0.07) + 0.55 * sc) * (p - centre) / size;

  vec3 col = starfield(rot(uTime * 0.004) * p * 0.6, uTime) * 1.2;
  col += planet(q, uTime, 2.57 - 2.2 * sc) * 1.4;
  col += shoot(p, uTime) * 0.7;
  col = 1.0 - exp(-col * 1.05);   // filmic roll-off
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
uniform float uLite;      // 1 = skip the streak
uniform float uCalm;
out vec4 outColor;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 cellAt(ivec2 c) { return texelFetch(uScene, clamp(c, ivec2(0), ivec2(uCells) - 1), 0).rgb; }

void main() {
  float tt = uTime * (1.0 - uCalm);   // the letters, the dither and the grain all run on this clock
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
  float dither = hash(vec2(cell) + floor(tt * 14.0)) - 0.5;
  float level = clamp(pow(L, 0.8) * ${N}.0 + dither * 0.9, 0.0, ${N}.0 - 0.01);
  // chaos: a cell takes any letter from a wide stretch of the ink scale around its tone, and re-rolls often, out of step
  float lvl = floor(level);
  float rnd = hash(vec2(cell) * 1.37 + floor(tt * 3.4 + hash(vec2(cell).yx) * 6.0));
  float centre = lvl / (${N}.0 - 1.0) * (${M}.0 - 1.0);
  float idx = clamp(floor(centre + (rnd - 0.5) * ${WINDOW}.0 + 0.5), 0.0, ${M}.0 - 1.0);
  float gInk = idx / (${M}.0 - 1.0);

  // edges become line glyphs that follow them
  float mag = length(g);
  if (mag > 0.15 && L > 0.1) {
    float e = abs(g.x) > 2.0 * abs(g.y) ? 1.0 : (abs(g.y) > 2.0 * abs(g.x) ? 0.0 : (g.x * g.y > 0.0 ? 3.0 : 2.0));
    idx = ${M}.0 + e;
    gInk = L;   // the line glyphs sit after the ramp
  }

  float total = ${M}.0 + 4.0;
  // the glyph takes only part of its cell, so there is air between the characters
  vec2 lc = (local - 0.5) * 1.3 + 0.5;
  float inside = step(0.0, lc.x) * step(lc.x, 1.0) * step(0.0, lc.y) * step(lc.y, 1.0);
  lc = clamp(lc, 0.0, 1.0);
  vec2 gu = vec2((idx + 0.06 + 0.88 * lc.x) / total, 0.04 + 0.92 * (1.0 - lc.y));
  // chromatic fringing grows toward the edges of the frame
  vec2 off = (fc / uRes - 0.5) * vec2(0.0022, 0.0);
  vec3 a = vec3(texture(uAtlas, gu + off).a, texture(uAtlas, gu).a, texture(uAtlas, gu - off).a) * inside;

  vec3 ink = mix(vec3(L), c, 1.55) * (0.85 + 1.1 * L) * uTint;   // push the colour
  ink *= clamp((L + 0.2) / (gInk + 0.2), 0.5, 1.8);               // a heavy letter on a dark spot is dimmed, a light one is lifted

  // bloom, from the blurred levels of the picture
  vec3 glow = textureLod(uScene, suv, 3.0).rgb * 0.7 + textureLod(uScene, suv, 5.0).rgb * 0.9;

  // anamorphic streak: bright parts smear sideways, blue
  vec3 streak = vec3(0.0);
  if (uLite < 0.5) for (int i = -8; i <= 8; i++) {
    vec3 s = textureLod(uScene, suv + vec2(float(i) * 0.014, 0.0), 2.0).rgb;
    streak += max(s - 0.65, 0.0) * (1.0 - abs(float(i)) / 9.0);
  }
  streak *= vec3(0.45, 0.7, 1.0) * 0.45;

  vec2 uv = fc / uRes;
  float vig = smoothstep(1.2, 0.25, length((uv - 0.5) * vec2(1.3, 1.0)));
  vec3 col = vec3(0.03, 0.034, 0.046) + glow * uPower * 0.07 * uTint + streak * uPower * 0.22 + ink * a * uPower * 0.8;
  col *= 0.4 + 0.6 * vig;
  col += (hash(fc + tt * 61.0) - 0.5) * 0.028;   // grain
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
  const us = loc(sceneProg, ['uCells', 'uAsp', 'uTime', 'uScroll']);
  const ua = loc(asciiProg, ['uScene', 'uAtlas', 'uCells', 'uCellPx', 'uRes', 'uTint', 'uPower', 'uTime', 'uLite', 'uCalm']);

  // ---------- the glyph atlas: a ramp sorted by how much ink each character really has ----------

  const atlas = gl.createTexture();
  function buildAtlas() {
    const gw = 40, gh = 72;
    const font = `600 ${gh * 0.78}px "Geist Mono", ui-monospace, Menlo, monospace`;
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
    const glyphs = [...ink.map((e) => e.ch), '-', '|', '/', '\\'];
    const ramp = ink.map((e) => e.ch);
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
  let cols = 1, rows = 1, W = 1, H = 1, cellPx = [11, 18];

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, TIERS[tier].dpr);
    W = Math.max(2, Math.round(innerWidth * dpr));
    H = Math.max(2, Math.round(innerHeight * dpr));
    canvas.width = W;
    canvas.height = H;
    cellPx = [TIERS[tier].cell[0] * dpr, TIERS[tier].cell[1] * dpr];
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

  let time = 0;
  let last = 0;
  let avgDt = 1 / 60;
  let governorT = -3;   // ignore the first seconds: compiling and loading stall frames
  let frameN = 0;
  let scrolled = 0;   // eased page progress; stays 0 with reduced motion
  const power = 0.38;

  function draw() {
    // pass one
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, cols, rows);
    gl.useProgram(sceneProg);
    gl.uniform2f(us.uCells, cols, rows);
    gl.uniform1f(us.uAsp, W / H);
    gl.uniform1f(us.uTime, time);
    gl.uniform1f(us.uScroll, scrolled);
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
    gl.uniform1f(ua.uLite, TIERS[tier].lite);
    gl.uniform1f(ua.uCalm, reduce ? 1 : 0);   // reduced motion: the letters hold still
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    if (document.hidden) return;
    time += dt;
    const goal = Math.min(Math.max(scrollY / Math.max(document.documentElement.scrollHeight - innerHeight, 1), 0), 1);
    scrolled += (goal - scrolled) * Math.min(dt * 2.5, 1);
    const k = Math.min(dt * 1.6, 1);
    for (let i = 0; i < 3; i++) tint[i] += (tintTarget[i] - tint[i]) * k;
    // Frames running long means the device is struggling: step down a tier (and never back up).
    avgDt += (dt - avgDt) * 0.04;
    governorT += dt;
    if (governorT > 2.5) {
      if (avgDt > 0.036 && tier < TIERS.length - 1) { tier++; resize(); }
      governorT = 0;
    }
    if (TIERS[tier].skip && frameN++ % 2) return;
    draw();
  }

  // A phone's address bar showing or hiding changes only the height a little; the canvas just stretches for that
  // instead of reallocating every buffer mid-scroll.
  let sizedW = innerWidth, sizedH = innerHeight;
  addEventListener('resize', () => {
    if (innerWidth === sizedW && Math.abs(innerHeight - sizedH) < 160) return;
    sizedW = innerWidth;
    sizedH = innerHeight;
    resize();
  });
  resize();
  if (!reduce) requestAnimationFrame(frame);

  window.site = Object.assign(window.site || {}, {
    sceneGL: { canvas },
    // Section calls this when it takes over the screen.
    grade: (name) => { tintTarget = GRADES[name] || GRADES.cold; if (reduce) { tint.splice(0, 3, ...tintTarget); draw(); } },
  });

  // The canvas fades in once the page is ready.
  const show = () => { canvas.style.transition = reduce ? 'none' : 'opacity 2.4s ease'; canvas.style.opacity = '1'; };
  if (window.site?.ready) window.site.ready.then(show); else show();
})();
