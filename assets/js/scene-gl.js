// The scene behind the page: a few soft lights drifting over a dark ground, one trailing the cursor.
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

// A soft round glow centred on c.
float blob(vec2 p, vec2 c, float r) {
  vec2 d = p - c;
  return exp(-dot(d, d) / (r * r));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(asp, 1.0);
  vec2 m = (uMouse - 0.5) * vec2(asp, 1.0);
  float t = uTime * 0.12 + uScroll * 2.0;

  // Three slow lights drifting on their own paths, one more that trails the cursor.
  float g = blob(p, vec2(sin(t * 0.9) * 0.55 * asp * 0.8, cos(t * 0.7) * 0.32), 0.55);
  g += 0.8 * blob(p, vec2(cos(t * 0.6 + 2.0) * 0.5 * asp * 0.8, sin(t * 0.8 + 1.0) * 0.38), 0.45);
  g += 0.6 * blob(p, vec2(sin(t * 0.5 + 4.0) * 0.4 * asp, cos(t * 0.45 + 3.0) * 0.3), 0.7);
  g += 0.7 * blob(p, m * 0.7, 0.4);

  vec3 col = uShadow + uBeam * g * 0.2 * uPower;
  col *= mix(0.75, 1.0, uv.y);
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
    cold: [[0.040, 0.046, 0.066], [0.30, 0.42, 0.80]],
    amber: [[0.058, 0.050, 0.046], [0.95, 0.52, 0.16]],
    teal: [[0.034, 0.052, 0.060], [0.16, 0.66, 0.66]],
    ember: [[0.062, 0.046, 0.044], [0.92, 0.32, 0.16]],
  };
  const cur = { shadow: [...GRADES.cold[0]], beam: [...GRADES.cold[1]], power: home ? 1 : 0.7 };
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
