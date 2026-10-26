// The scene behind the page, drawn as ASCII. Pass one renders a small picture (an eye that you zoom into until
// its pupil opens onto a spiral galaxy); pass two turns every pixel of that picture into a character.
// On the home page the scroll position is the zoom; on other pages the galaxy just turns.
// site.grade(name) tints the characters per section. Does nothing without WebGL2.
(() => {
  const canvas = document.querySelector('.scene-gl');
  const gl = canvas?.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;

  const root = document.documentElement;
  const reduce = root.classList.contains('reduce');
  const home = root.dataset.page === 'home';

  const RAMP = ' .:-=+*#%@';
  const N = RAMP.length;
  const CELL = [8, 14]; // one character, in CSS pixels

  const VERT = `#version 300 es
layout(location = 0) in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

  // ---------- pass one: the picture, one pixel per character ----------

  const SCENE = `#version 300 es
precision highp float;
uniform vec2 uCells;
uniform float uAsp;
uniform float uTime;
uniform float uZoom;     // 0 = whole eye, 1 = inside the galaxy
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
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

// x: brightness of the eye, y: how much of this point is pupil (1 inside it)
vec2 eye(vec2 q, float t) {
  float r = length(q), a = atan(q.y, q.x);
  float ax = abs(q.x);

  float h = 0.36 * pow(max(1.0 - (ax / 1.1) * (ax / 1.1), 0.0), 0.75);   // eyelid: an almond
  float lid = smoothstep(0.0, 0.02, h - abs(q.y));

  float ri = 0.30;
  float rp = 0.115 + 0.012 * sin(t * 0.8);

  float vein = fbm(vec2(a * 5.0, r * 9.0) + 3.0);
  float sclera = 0.5 - 0.2 * smoothstep(0.55, 0.95, vein) * smoothstep(ri, 0.7, r);
  sclera *= 1.0 - 0.5 * smoothstep(0.5, 1.0, ax);

  float fibres = fbm(vec2(a * 14.0, r * 7.0 - t * 0.04));
  float fine = noise(vec2(a * 42.0, r * 3.0));
  float iris = 0.22 + 0.5 * fibres + 0.12 * fine;
  float collar = smoothstep(rp + 0.02, rp + 0.08, r) * (1.0 - smoothstep(rp + 0.08, rp + 0.14, r));
  iris = mix(iris, 0.95, collar * 0.45);
  iris *= mix(1.0, 0.4, smoothstep(ri - 0.05, ri, r));

  float inIris = 1.0 - smoothstep(ri - 0.006, ri + 0.006, r);
  float lum = mix(sclera, iris, inIris);
  float pupil = 1.0 - smoothstep(rp - 0.006, rp + 0.006, r);

  lum += 1.1 * smoothstep(0.032, 0.0, length(q - vec2(-0.075, 0.075)));   // the light on the cornea
  lum = mix(0.05, lum, lid);
  return vec2(lum, pupil * lid);
}

float galaxy(vec2 gp, float t) {
  float r = length(gp) + 1e-4;
  float a = atan(gp.y, gp.x);
  float spin = a - 1.9 * log(r + 0.04) + t * 0.12;
  float arms = pow(0.5 + 0.5 * cos(2.0 * spin), 2.2);
  float disk = exp(-r * 1.9);
  float core = exp(-r * r * 55.0) * 1.3 + exp(-r * 7.0) * 0.35;
  float dust = fbm(gp * 7.0 + vec2(0.0, t * 0.02));
  float g = core * 1.5 + disk * arms * (0.5 + 1.0 * dust) * 1.7;

  vec2 sg = gp * 38.0;
  vec2 id = floor(sg);
  float hs = hash(id);
  float star = step(0.955, hs) * smoothstep(0.35, 0.0, length(fract(sg) - 0.5)) * (0.5 + 0.5 * sin(t * 2.0 + hs * 50.0));
  return clamp(g + star * 0.9 * (0.3 + disk), 0.0, 1.4);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uCells;
  vec2 p = (uv - 0.5) * vec2(uAsp, 1.0);
  p += (uMouse - 0.5) * 0.03 * (1.0 - uZoom);

  float z = 0.8 * pow(17.5, uZoom);                       // the camera falls into the pupil
  vec2 centre = vec2(mix(0.16, 0.0, smoothstep(0.0, 0.6, uZoom)), 0.0);
  vec2 q = (p - centre) / z;

  vec2 e = eye(q, uTime);
  float w = 1.0 + 2.0 * smoothstep(0.7, 1.0, uZoom);      // once the pupil fills the screen, pull back to show the whole galaxy
  float gal = galaxy(q / 0.115 * w, uTime);

  float lum = mix(e.x, gal, e.y);
  outColor = vec4(lum, e.y, 0.0, 1.0);
}`;

  // ---------- pass two: characters ----------

  const ASCII = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform vec2 uCells;
uniform vec2 uCellPx;
uniform vec2 uRes;
uniform vec3 uTint;
uniform float uPower;
out vec4 outColor;

void main() {
  vec2 cell = floor(gl_FragCoord.xy / uCellPx);
  vec2 s = texture(uScene, (cell + 0.5) / uCells).rg;
  float lum = clamp(s.x, 0.0, 1.0);
  float idx = floor(lum * ${N}.0 * 0.999);
  vec2 local = fract(gl_FragCoord.xy / uCellPx);
  float a = texture(uAtlas, vec2((idx + local.x) / ${N}.0, 1.0 - local.y)).a;

  vec3 warm = vec3(1.0, 0.72, 0.42);
  vec3 cool = vec3(0.55, 0.7, 1.0);
  vec3 col = mix(warm, cool, s.y) * uTint;

  vec2 uv = gl_FragCoord.xy / uRes;
  float vignette = smoothstep(1.15, 0.2, length((uv - 0.5) * vec2(1.25, 1.0)));
  float k = uPower * (0.25 + 0.75 * lum) * (0.35 + 0.65 * vignette);
  outColor = vec4(vec3(0.034, 0.038, 0.05) + col * a * k, 1.0);
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
  const us = loc(sceneProg, ['uCells', 'uAsp', 'uTime', 'uZoom', 'uMouse']);
  const ua = loc(asciiProg, ['uScene', 'uAtlas', 'uCells', 'uCellPx', 'uRes', 'uTint', 'uPower']);

  // Glyph atlas: the ramp in one row, drawn big and sampled down.
  const atlas = gl.createTexture();
  function buildAtlas() {
    const gw = 32, gh = 56;
    const c = document.createElement('canvas');
    c.width = gw * N;
    c.height = gh;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.font = `700 ${gh * 0.86}px "Geist Mono", ui-monospace, Menlo, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    [...RAMP].forEach((ch, i) => { if (ch !== ' ') g.fillText(ch, gw * i + gw / 2, gh / 2 + 2); });
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  buildAtlas();
  (document.fonts?.load('700 40px "Geist Mono"') || Promise.resolve()).then(() => { buildAtlas(); draw(); }).catch(() => {});

  // The small picture lives in a framebuffer, one pixel per character cell.
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    draw();
  }

  // Section tints (multiplied into the characters).
  const GRADES = { cold: [0.78, 0.88, 1.0], amber: [1.0, 0.9, 0.78], teal: [0.78, 1.0, 0.96], ember: [1.0, 0.82, 0.74] };
  const tint = [...GRADES.cold];
  let tintTarget = GRADES.cold;

  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  let time = 0;
  let last = 0;
  let zoom = home ? 0 : 1;
  const basePower = home ? 0.75 : 0.6;
  let power = basePower;

  function draw() {
    // pass one
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, cols, rows);
    gl.useProgram(sceneProg);
    gl.uniform2f(us.uCells, cols, rows);
    gl.uniform1f(us.uAsp, W / H);
    gl.uniform1f(us.uTime, time);
    gl.uniform1f(us.uZoom, zoom);
    gl.uniform2f(us.uMouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

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
      // The scroll is the zoom: one and a half screens from the whole eye to the whole galaxy.
      const goal = Math.min(Math.max(scrollY / (innerHeight * 1.5), 0), 1);
      zoom += (goal - zoom) * Math.min(dt * 4, 1);
      power = basePower + 0.5 * (1 - zoom); // the eye at the top is the brightest moment
    }
    draw();
  }

  addEventListener('pointermove', (e) => {
    mouse.tx = e.clientX / innerWidth;
    mouse.ty = 1 - e.clientY / innerHeight;
  }, { passive: true });
  addEventListener('resize', resize);
  resize();
  if (!reduce) requestAnimationFrame(frame);

  window.site = Object.assign(window.site || {}, {
    sceneGL: { canvas },
    // Section calls this when it takes over the screen.
    grade: (name) => { tintTarget = GRADES[name] || GRADES.cold; if (reduce) { tint.splice(0, 3, ...tintTarget); draw(); } },
  });

  // Fade the canvas in once the page is ready.
  const show = () => { canvas.style.transition = reduce ? 'none' : 'opacity 2.4s ease'; canvas.style.opacity = '1'; };
  if (window.site?.ready) window.site.ready.then(show); else show();
})();
