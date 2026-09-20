// Hero background: slow topographic contour lines with a hill that follows the cursor.
// Exposes site.heroGL.canvas for the intro fade. Does nothing without WebGL2.
(() => {
  const canvas = document.querySelector('.hero__gl');
  const gl = canvas?.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;

  const reduce = document.documentElement.classList.contains('reduce');
  const hero = canvas.parentElement;

  const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
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

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 m = (uMouse - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * 0.045;

  vec2 warp = vec2(fbm(p * 1.3 + t), fbm(p * 1.3 + 5.2 - t));
  float h = fbm(p * 1.6 + warp * 1.6 + t * 0.5);
  h += 0.2 * exp(-dot(p - m, p - m) * 7.0);

  float s = h * 11.0;
  float line = 1.0 - clamp(abs(fract(s - 0.5) - 0.5) / fwidth(s), 0.0, 1.0);

  // Lines live top-right and fade behind the headline at bottom-left.
  float mask = smoothstep(0.1, 0.95, uv.y * 0.75 + uv.x * 0.55);

  vec3 bg = vec3(0.039, 0.039, 0.035);
  vec3 accent = vec3(0.91, 0.588, 0.247);
  vec3 col = bg + accent * (h - 0.35) * 0.05 * mask;
  col = mix(col, accent, line * 0.26 * mask);
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.015;
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

  const uRes = gl.getUniformLocation(program, 'uRes');
  const uTime = gl.getUniformLocation(program, 'uTime');
  const uMouse = gl.getUniformLocation(program, 'uMouse');

  const mouse = { x: 0.7, y: 0.6, tx: 0.7, ty: 0.6 };
  let visible = true;
  let time = 0;
  let last = 0;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.25);
    canvas.width = Math.round(hero.clientWidth * dpr);
    canvas.height = Math.round(hero.clientHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    draw();
  }

  function draw() {
    gl.uniform1f(uTime, time);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (!visible || document.hidden) return;
    time += dt;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    draw();
  }

  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    mouse.tx = (e.clientX - r.left) / r.width;
    mouse.ty = 1 - (e.clientY - r.top) / r.height;
  });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(hero);
  new ResizeObserver(resize).observe(hero);

  resize();
  if (!reduce) requestAnimationFrame(frame);
  window.site = Object.assign(window.site || {}, { heroGL: { canvas } });
})();
