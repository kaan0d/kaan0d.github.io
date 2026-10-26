// The scene behind the page: a projector beam through haze with drifting dust.
// The grade (shadow and beam colours) follows the section on screen: site.grade(name).
// Does nothing without WebGL2; the page then keeps its plain background.
(() => {
  const canvas = document.querySelector('.scene-gl');
  const gl = canvas?.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;

  const reduce = document.documentElement.classList.contains('reduce');
  const home = document.documentElement.dataset.page === 'home';

  const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uScroll;
uniform float uPower;
uniform vec3 uShadow;
uniform vec3 uBeam;
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

// One layer of dust: a jittered grid of motes that drift and twinkle.
float dust(vec2 p, float scale, float seed, float t) {
  vec2 q = p * scale + vec2(t * 0.12, -t * 0.2) * (0.6 + seed);
  vec2 id = floor(q), f = fract(q) - 0.5;
  float h = hash(id + seed * 17.0);
  vec2 off = vec2(hash(id + 3.1 + seed), hash(id + 7.7 + seed)) - 0.5;
  float d = length(f - off * 0.7);
  float tw = 0.5 + 0.5 * sin(t * (0.6 + h * 1.4) + h * 40.0);
  return smoothstep(0.07 + 0.03 * h, 0.0, d) * step(0.55, h) * tw;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(asp, 1.0);
  vec2 m = (uMouse - 0.5) * vec2(asp, 1.0);
  float t = uTime;

  // Source sits above the top-right corner; the beam leans toward the cursor and swings slowly with scroll.
  vec2 src = vec2(0.42 * asp, 0.75);
  float lean = 0.55 + (m.x * 0.35) + sin(uScroll * 6.2832 * 1.5) * 0.18;
  vec2 v = p - src;
  float len = length(v);
  float ang = atan(v.x, -v.y);                       // 0 straight down
  float da = ang + lean * 0.9;                       // aim, radians
  float width = 0.2 + len * 0.16;
  float cone = smoothstep(width, width * 0.15, abs(da));
  cone *= smoothstep(0.0, 0.25, len) * exp(-len * 0.8);

  // Haze: slow smoke that the beam lights up.
  vec2 w = vec2(fbm(p * 1.6 + vec2(t * 0.03, -t * 0.02)), fbm(p * 1.6 + 5.2 - t * 0.025));
  float haze = fbm(p * 2.2 + w * 1.8 + t * 0.02);
  float beam = cone * (0.35 + 1.1 * haze);

  // Soft pool of light that follows the cursor.
  float pool = exp(-dot(p - m, p - m) * 6.0) * 0.1;

  float motes = dust(p, 9.0, 0.0, t) + dust(p, 17.0, 1.0, t) * 0.7 + dust(p, 31.0, 2.0, t) * 0.45;
  motes *= (0.25 + beam * 2.4);

  vec3 col = uShadow;
  col += uBeam * (beam * 0.3 + pool * 0.6) * uPower;
  col += uBeam * motes * 0.55 * uPower;
  // Light falls off toward the bottom so footer and text sit on shadow.
  col *= mix(0.7, 1.0, uv.y);
  col += (hash(gl_FragCoord.xy + t) - 0.5) * 0.012;
  outColor = vec4(col, 1.0);
}`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  // One oversized triangle covers the screen.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = Object.fromEntries(['uRes', 'uTime', 'uMouse', 'uScroll', 'uPower', 'uShadow', 'uBeam'].map((n) => [n, gl.getUniformLocation(program, n)]));

  // Grades: [shadow rgb, beam rgb]. Teal shadows with warm light is the base look.
  const GRADES = {
    cold: [[0.040, 0.050, 0.078], [0.46, 0.62, 0.86]],
    amber: [[0.062, 0.052, 0.050], [0.97, 0.64, 0.30]],
    teal: [[0.030, 0.060, 0.074], [0.36, 0.80, 0.78]],
    ember: [[0.070, 0.042, 0.040], [0.96, 0.46, 0.26]],
  };
  const cur = { shadow: [...GRADES.cold[0]], beam: [...GRADES.cold[1]], power: home ? 1 : 0.55 };
  let target = GRADES.cold;

  const mouse = { x: 0.7, y: 0.6, tx: 0.7, ty: 0.6 };
  let visible = true;
  let time = 0;
  let last = 0;
  let scroll = 0;

  function resize() {
    // The scene is soft, so a fraction of the real pixel count is enough.
    const dpr = Math.min(devicePixelRatio || 1, 1) * 0.6;
    canvas.width = Math.max(2, Math.round(innerWidth * dpr));
    canvas.height = Math.max(2, Math.round(innerHeight * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    draw();
  }

  function draw() {
    gl.uniform1f(u.uTime, time);
    gl.uniform2f(u.uMouse, mouse.x, mouse.y);
    gl.uniform1f(u.uScroll, scroll);
    gl.uniform1f(u.uPower, cur.power);
    gl.uniform3fv(u.uShadow, cur.shadow);
    gl.uniform3fv(u.uBeam, cur.beam);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    if (!visible || document.hidden) return;
    time += dt;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    const k = Math.min(dt * 1.6, 1);
    for (let i = 0; i < 3; i++) {
      cur.shadow[i] += (target[0][i] - cur.shadow[i]) * k;
      cur.beam[i] += (target[1][i] - cur.beam[i]) * k;
    }
    const max = document.documentElement.scrollHeight - innerHeight;
    scroll = max > 0 ? scrollY / max : 0;
    draw();
  }

  addEventListener('pointermove', (e) => {
    mouse.tx = e.clientX / innerWidth;
    mouse.ty = 1 - e.clientY / innerHeight;
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { last = 0; });
  addEventListener('resize', resize);

  resize();
  if (!reduce) requestAnimationFrame(frame);

  window.site = Object.assign(window.site || {}, {
    sceneGL: { canvas },
    // Section calls this when it takes over the screen.
    grade: (name) => { target = GRADES[name] || GRADES.cold; if (reduce) { cur.shadow = [...target[0]]; cur.beam = [...target[1]]; draw(); } },
  });
  gsapFade();

  // Fade the canvas in once the page is ready (gsap loads before this file runs).
  function gsapFade() {
    const show = () => { canvas.style.transition = reduce ? 'none' : 'opacity 2.4s ease'; canvas.style.opacity = '1'; };
    if (window.site?.ready) window.site.ready.then(show); else show();
  }
})();
