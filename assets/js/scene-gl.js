// The scene behind the page: a slow pool of liquid chrome lit by the cursor.
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
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

// Height of the liquid surface: slow, domain-warped swells.
float height(vec2 p, float t) {
  vec2 w = vec2(fbm(p * 0.9 + vec2(t, -t * 0.7)), fbm(p * 0.9 + 5.2 - vec2(t * 0.8, t)));
  return fbm(p * 1.1 + w * 1.9);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(asp, 1.0) * 1.5;
  vec2 m = (uMouse - 0.5) * vec2(asp, 1.0) * 1.5;
  float t = uTime * 0.035 + uScroll * 1.2;

  // Surface normal from the height field's slope.
  float e = 0.012;
  float h = height(p, t);
  float hx = height(p + vec2(e, 0.0), t) - h;
  float hy = height(p + vec2(0.0, e), t) - h;
  vec3 n = normalize(vec3(-hx, -hy, e * 0.55));

  // One light that follows the cursor, one fixed rim from the top right.
  vec3 L = normalize(vec3(m - p, 0.55));
  vec3 R = normalize(vec3(0.7, 0.9, 0.6));
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
  float rim = pow(max(dot(reflect(-R, n), vec3(0.0, 0.0, 1.0)), 0.0), 18.0);

  // Chrome look: a studio gradient read through the normal, banded into dark and light stripes.
  float band = n.x * 3.2 + n.y * 4.4;
  float env = smoothstep(0.35, 0.95, 0.5 + 0.5 * sin(band * 5.0 + h * 6.0));
  env *= smoothstep(0.0, 0.5, length(vec2(hx, hy)) / e);

  vec3 col = uShadow * (0.75 + 0.5 * h);
  col += uBeam * (spec * 0.55 + rim * 0.35 + env * 0.1) * uPower;
  col *= mix(0.7, 1.0, uv.y);
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.012;
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
    cold: [[0.040, 0.046, 0.062], [0.74, 0.82, 0.95]],
    amber: [[0.058, 0.050, 0.046], [1.00, 0.80, 0.55]],
    teal: [[0.034, 0.052, 0.060], [0.70, 0.92, 0.92]],
    ember: [[0.062, 0.046, 0.044], [1.00, 0.72, 0.58]],
  };
  const cur = { shadow: [...GRADES.cold[0]], beam: [...GRADES.cold[1]], power: home ? 0.5 : 0.35 };
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
