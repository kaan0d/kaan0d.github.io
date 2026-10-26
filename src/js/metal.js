// Liquid chrome for every .btn: one shared Three.js renderer draws the metal into the hovered button's own 2D canvas.
// anime.js drives the pour (reveal radius) and the arrow. Without WebGL the CSS fallback in base.css stays.
import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderer } from 'three';
import { animate } from 'animejs';

const VERT = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = `precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uOrigin;
uniform float uReveal;
uniform vec2 uMouse;
uniform float uForce;
varying vec2 vUv;

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

// Height of the liquid: slow warped swells plus rings that spread from the pointer.
float height(vec2 p, vec2 m) {
  float t = uTime * 0.3;
  vec2 w = vec2(fbm(p * 0.7 + vec2(t, -t)), fbm(p * 0.7 + 4.1 - vec2(t * 0.7, t)));
  float h = fbm(p * 0.8 + w * 1.8);
  float r = length(p - m);
  return h + uForce * 0.07 * sin(r * 9.0 - uTime * 5.0) * exp(-r * 2.2);
}

void main() {
  float asp = uRes.x / uRes.y;
  vec2 k = vec2(asp, 1.0);
  vec2 p = vUv * k;
  vec2 m = uMouse * k;

  float e = 0.02;
  float h = height(p, m);
  vec2 g = vec2(height(p + vec2(e, 0.0), m) - h, height(p + vec2(0.0, e), m) - h) / e;
  vec3 n = normalize(vec3(-g * 0.7, 1.0));

  // Studio reflection read through the normal: dark horizon, bright softboxes, one hot highlight.
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
  float bands = smoothstep(0.12, 0.88, sin(r.y * 4.5 + r.x * 2.0 + h * 2.0) * 0.5 + 0.5);
  float sky = smoothstep(-0.3, 0.9, r.y);
  vec3 col = mix(vec3(0.03, 0.035, 0.045), vec3(0.93, 0.95, 0.98), clamp(bands * 0.8 + sky * 0.3, 0.0, 1.0));
  col += vec3(1.0, 0.96, 0.9) * pow(max(dot(n, normalize(vec3(0.35, 0.55, 1.0))), 0.0), 60.0) * 0.9;

  // Keep the metal in the light range so the dark label stays readable on every band.
  col = 0.52 + 0.48 * smoothstep(0.08, 0.92, col);

  // The pour: a circle growing from the pointer with a wobbling, liquid edge.
  vec2 o = uOrigin * k;
  vec2 far = vec2(max(uOrigin.x, 1.0 - uOrigin.x) * asp, max(uOrigin.y, 1.0 - uOrigin.y));
  float edge = uReveal * length(far) * 1.12;
  float wob = (fbm(p * 1.6 + uTime) - 0.5) * 0.45 * sin(uReveal * 3.14159);
  float mask = 1.0 - smoothstep(edge - 0.03, edge + 0.03, length(p - o) + wob);

  gl_FragColor = vec4(col * mask, mask);
}`;

let renderer;
try {
  renderer = new WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' });
} catch (e) {
  renderer = null; // no WebGL: the CSS fallback stays
}

if (renderer) {
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uRes: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uOrigin: { value: new Vector2(0.5, 0.5) },
    uReveal: { value: 0 },
    uMouse: { value: new Vector2(0.5, 0.5) },
    uForce: { value: 0 },
  };
  scene.add(new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true })));

  const items = [...document.querySelectorAll('.btn')].map((el) => {
    // Everything but the canvas goes into one label that sits above it.
    const label = document.createElement('span');
    label.className = 'btn__label';
    label.append(...el.childNodes);
    const canvas = document.createElement('canvas');
    canvas.className = 'btn__metal';
    canvas.setAttribute('aria-hidden', 'true');
    el.append(canvas, label);
    return {
      el, canvas,
      ctx: canvas.getContext('2d'),
      arrow: label.querySelector('.btn__arrow'),
      state: { reveal: 0 },
      origin: [0.5, 0.5], mouse: [0.5, 0.5], target: [0.5, 0.5], force: 0, hover: false, drawn: false, tween: null,
    };
  });

  const at = (item, e) => {
    const r = item.el.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
  };

  function resize(item) {
    const r = item.el.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(r.width * dpr));
    const h = Math.max(2, Math.round(r.height * dpr));
    if (item.canvas.width !== w || item.canvas.height !== h) { item.canvas.width = w; item.canvas.height = h; }
    renderer.setSize(w, h, false);
    uniforms.uRes.value.set(w, h);
  }

  const nudge = (item, on) => {
    if (!item.arrow) return;
    const right = item.arrow.textContent.trim() === '→';
    animate(item.arrow, { x: on ? (right ? 6 : 4) : 0, y: on ? (right ? 0 : -4) : 0, duration: on ? 700 : 450, ease: on ? 'outElastic(1, .6)' : 'outExpo' });
  };

  const pour = (item, origin, to, duration, ease) => {
    item.origin = origin;
    item.tween?.pause();
    item.tween = animate(item.state, { reveal: to, duration, ease });
  };

  let running = false;
  let last = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000 || 0, 0.05);
    last = now;
    uniforms.uTime.value += dt;
    let live = false;
    for (const item of items) {
      if (!item.hover && item.state.reveal < 0.002) {
        if (item.drawn) { item.ctx.clearRect(0, 0, item.canvas.width, item.canvas.height); item.drawn = false; }
        continue;
      }
      live = true;
      resize(item);
      const dx = item.target[0] - item.mouse[0];
      const dy = item.target[1] - item.mouse[1];
      item.mouse[0] += dx * 0.18;
      item.mouse[1] += dy * 0.18;
      item.force += (Math.min(Math.hypot(dx, dy) * 8, 1.4) - item.force) * 0.12;
      uniforms.uOrigin.value.set(item.origin[0], item.origin[1]);
      uniforms.uReveal.value = item.state.reveal;
      uniforms.uMouse.value.set(item.mouse[0], item.mouse[1]);
      uniforms.uForce.value = item.force;
      renderer.render(scene, camera);
      item.ctx.clearRect(0, 0, item.canvas.width, item.canvas.height);
      item.ctx.drawImage(renderer.domElement, 0, 0);
      item.drawn = true;
    }
    if (live) requestAnimationFrame(frame); else running = false;
  }
  const start = () => { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } };

  for (const item of items) {
    const { el } = item;
    el.addEventListener('pointerenter', (e) => {
      item.hover = true;
      const p = at(item, e);
      item.mouse = [...p];
      item.target = [...p];
      pour(item, p, 1, 1200, 'outExpo');
      nudge(item, true);
      start();
    });
    el.addEventListener('pointermove', (e) => { item.target = at(item, e); });
    el.addEventListener('pointerleave', (e) => {
      item.hover = false;
      pour(item, at(item, e), 0, 800, 'inOutQuad');
      nudge(item, false);
      start();
    });
    // Keyboard focus pours from the centre.
    el.addEventListener('focus', () => {
      if (!el.matches(':focus-visible')) return;
      item.hover = true;
      item.mouse = [0.5, 0.5];
      item.target = [0.5, 0.5];
      pour(item, [0.5, 0.5], 1, 1200, 'outExpo');
      nudge(item, true);
      start();
    });
    el.addEventListener('blur', () => {
      if (!item.hover) return;
      item.hover = false;
      pour(item, [0.5, 0.5], 0, 800, 'inOutQuad');
      nudge(item, false);
      start();
    });
  }

  document.documentElement.classList.add('has-metal');
}
