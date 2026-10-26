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

  const N = 30;                 // tonal levels
  const K = 3;                  // characters per level, picked at random so no letter repeats in a row
  const CELL = [11, 18];         // one character, in CSS pixels
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
uniform float uJourney;   // 0 until the galaxy fills the frame, then 0 to 4.7 through five places
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
  float base = 0.34 * pow(max(1.0 - (ax / 1.12) * (ax / 1.12), 0.0), 0.65);
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
  vec3 irisLo = vec3(0.09, 0.035, 0.012);
  vec3 irisHi = vec3(0.46, 0.22, 0.08);
  vec3 iris = mix(irisLo, irisHi, clamp(fibres * 1.2 + fine * 0.25, 0.0, 1.0));
  float collar = smoothstep(rp + 0.02, rp + 0.075, r) * (1.0 - smoothstep(rp + 0.075, rp + 0.13, r));
  iris = mix(iris, vec3(0.6, 0.34, 0.15), collar * 0.5);
  iris *= 1.0 - 0.55 * crypts;
  iris *= mix(1.0, 0.28, smoothstep(ri - 0.06, ri, r));
  iris *= 0.45 + 0.55 * smoothstep(-0.05, 0.28, upper - q.y);     // the upper lid shades the iris

  float inIris = 1.0 - smoothstep(ri - 0.005, ri + 0.005, r);
  vec3 col = mix(sclera, iris, inIris);
  float pm = 1.0 - smoothstep(rp - 0.004, rp + 0.004, r);
  col = mix(col, vec3(0.0), pm);

  // skin and the crease above the lid
  // the face around the eye: lit from above, a shadowed socket, the brow with its hairs, the side of the nose
  vec3 skin = vec3(0.78, 0.52, 0.38);
  float socket = smoothstep(0.95, 0.15, length(vec2(q.x / 1.3, (q.y - 0.05) / 0.6)));
  skin *= 1.0 - 0.45 * socket;
  skin *= 0.62 + 0.38 * smoothstep(-0.8, 0.7, q.y);
  skin *= 1.0 - 0.35 * smoothstep(-1.15, -1.8, q.x);
  skin *= 1.0 - 0.25 * smoothstep(-0.2, -0.42, q.y) * smoothstep(-0.6, -0.1, q.y);
  skin *= 0.88 + 0.24 * noise(q * 70.0);                                    // pores
  float browC = 0.52 + 0.06 * q.x - 0.07 * q.x * q.x;
  float brow = smoothstep(0.085, 0.025, abs(q.y - browC)) * smoothstep(-1.25, -0.8, q.x) * smoothstep(1.35, 0.9, q.x);
  float hair = step(0.42, noise(vec2(q.x * 60.0 + q.y * 25.0, q.y * 7.0)));
  skin = mix(skin, vec3(0.12, 0.07, 0.05), brow * (0.35 + 0.65 * hair));
  skin *= 0.55 * smoothstep(3.0, 0.8, length(q * vec2(0.8, 1.3)));          // the face fades into the dark
  float crease = exp(-pow((q.y - (upper * 1.45 + 0.028)) / 0.011, 2.0)) * smoothstep(1.1, 0.7, ax);
  skin += vec3(0.5, 0.32, 0.2) * crease * 0.5;
  col = mix(skin, col, inside);
  float lidEdge = smoothstep(0.018, 0.0, abs(q.y - upper)) * smoothstep(1.12, 0.3, ax);
  float lashLen = (0.045 + 0.05 * noise(vec2(q.x * 75.0, 2.0))) * smoothstep(1.1, 0.3, ax);
  float lash = step(upper, q.y) * step(q.y, upper + lashLen) * step(0.5, noise(vec2(q.x * 95.0, 5.0))) * smoothstep(1.05, 0.8, ax);
  col = mix(col, vec3(0.03, 0.02, 0.02), lash * 0.9);                        // lashes
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


// The stars belong to the world, not to any one picture: three layers stream outward as the camera falls,
// each fading out as the next fades in, so there is always depth and never a cut.
vec3 worldStarsW(vec2 wp, float J, float t) {
  vec3 acc = vec3(0.0);
  for (int l = 0; l < 3; l++) {
    float ph = J * 0.45 + float(l) / 3.0;
    float u = fract(ph);
    acc += starfield(wp / exp(u * 2.4) + float(l) * 7.3 + floor(ph) * 3.1, t) * sin(3.14159 * u) * 1.7;
  }
  return acc;
}
vec3 worldStars(vec2 p, float J, float t) { return worldStarsW(rot(-t * 0.02) * rot(0.35) * p * 1.318, J, t); }

vec3 galaxyBody(vec2 gp, float t) {
  float r = length(gp) + 1e-4;
  float a = atan(gp.y, gp.x);
  float spin = a - 1.7 * log(r + 0.05) + t * 0.16;
  float arms = pow(0.5 + 0.5 * cos(2.0 * spin), 2.5);
  float lane = pow(0.5 + 0.5 * cos(2.0 * (spin + 0.55)), 5.0);
  float disk = exp(-r * 1.7);
  float clump = fbm(gp * 9.0 + vec2(0.0, t * 0.02));
  float knots = smoothstep(0.7, 0.86, fbm(gp * 15.0 - 4.0)) * arms * disk;

  vec3 col = vec3(1.0, 0.78, 0.45) * (exp(-r * r * 38.0) * 1.8 + exp(-r * 6.0) * 0.55);
  col += mix(vec3(0.22, 0.38, 1.0), vec3(0.75, 0.5, 1.0), clump) * arms * disk * (0.5 + clump) * 1.7;
  col += vec3(1.0, 0.35, 0.55) * knots * 1.4;

  // clouds of gas: violet and teal, drifting
  float neb = fbm(gp * 2.6 + vec2(t * 0.012, -t * 0.008));
  vec3 nebCol = mix(vec3(0.5, 0.12, 0.72), vec3(0.08, 0.6, 0.85), fbm(gp * 3.4 + 7.0));
  col += nebCol * pow(neb, 2.2) * (0.25 + 0.5 * arms) * exp(-r * 1.1) * 1.4;

  // the core throws diffraction spikes, like a telescope image
  col += vec3(1.0, 0.9, 0.75) * (exp(-abs(gp.x) * 55.0) * exp(-abs(gp.y) * 2.6) + exp(-abs(gp.y) * 55.0) * exp(-abs(gp.x) * 2.6)) * 0.9;

  col *= 1.0 - 0.65 * lane * disk * smoothstep(0.08, 0.4, r);
  return col * 1.35;
}

vec3 galaxy(vec2 gp, float t) { return galaxyBody(gp, t) + worldStarsW(gp, 0.0, t) * 1.35; }

// Warp: stars streak outward from the centre, fastest while the pupil opens onto the galaxy.
vec3 warp(vec2 p, float t, float s) {
  if (s < 0.01) return vec3(0.0);
  float r = length(p) + 1e-4;
  float a = atan(p.y, p.x) / 6.2831853 + 0.5;
  vec3 acc = vec3(0.0);
  for (int l = 0; l < 3; l++) {
    float n = 46.0 + float(l) * 31.0;
    float ang = a * n;
    float id = floor(ang);
    float h = hash(vec2(id, float(l) * 7.1));
    float z = fract(h + t * (0.35 + 0.25 * float(l)) * (0.4 + s));
    float rr = z * z * 1.6;
    float len = s * (0.06 + 0.9 * z * z);
    float across = r * abs(fract(ang) - 0.5) * 6.2831853 / n;
    float along = smoothstep(len, 0.0, rr - r) * step(r, rr);
    float line = smoothstep(0.004 + 0.003 * z, 0.0, across) * along;
    vec3 tone = mix(vec3(0.6, 0.75, 1.0), vec3(1.0, 0.8, 0.55), hash(vec2(id, 3.3)));
    acc += tone * line * (0.4 + z) * step(0.5, h);
  }
  return acc * s * 1.6;
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

// ---- glitter around the eye: short flashes of four-point stars, thickest near the lids ----

vec3 sparkle(vec2 q, float t) {
  vec3 acc = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    float sc = 9.0 + 7.0 * float(l);
    vec2 g = q * sc + vec2(float(l) * 5.7, float(l) * 2.3);
    vec2 id = floor(g);
    float h = hash(id + float(l) * 13.1);
    vec2 d = fract(g) - 0.5 - (vec2(hash(id + 1.7), hash(id + 4.1)) - 0.5) * 0.6;
    float tw = pow(0.5 + 0.5 * sin(t * (2.0 + h * 5.0) + h * 80.0), 6.0);
    float star = exp(-abs(d.x) * 38.0) * exp(-abs(d.y) * 6.0) + exp(-abs(d.y) * 38.0) * exp(-abs(d.x) * 6.0);
    float core = exp(-dot(d, d) * 160.0);
    float e = length(vec2(q.x / 1.35, q.y / 0.62));
    float on = step(0.6, h) * smoothstep(2.4, 0.9, e);
    vec3 tone = mix(vec3(1.0, 0.88, 0.55), vec3(1.0, 0.62, 0.85), hash(id + 9.1));
    acc += tone * (star * 0.7 + core * 1.4) * tw * on;
  }
  return acc * 1.5;
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
  col += sparkle(q, t) * (1.0 - smoothstep(0.05, 0.4, uZoom)) * uOpen;
  col += vec3(0.7, 0.85, 1.0) * rim * smoothstep(0.2, 0.5, uZoom) * (1.0 - smoothstep(0.62, 0.8, uZoom)) * 0.5;
  return col;
}

// ---- the journey: one world, one zoom. Every place already hangs at the centre, tiny, long before the camera
// reaches it; the camera keeps magnifying, the old place thins out as it outgrows the frame and the next one
// swells to fill it. Nothing is cut or faded as a whole picture.

vec3 galaxyObj(vec2 q, float t) { return galaxyBody(rot(-t * 0.02) * rot(0.35) * q * 1.318, t); }

vec3 nebulaObj(vec2 q, float t) {
  float r = length(q);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float k = float(i);
    vec2 q2 = q * (1.2 + 0.5 * k) + vec2(k * 3.7, t * 0.012 * (k + 1.0));
    float n = fbm(q2 * 1.6 + k * 5.0);
    float m = fbm(q2 * 2.3 + 9.0 + k);
    vec3 c1 = k < 1.0 ? vec3(0.55, 0.12, 0.75) : (k < 2.0 ? vec3(0.08, 0.6, 0.85) : (k < 3.0 ? vec3(1.0, 0.55, 0.2) : vec3(0.2, 0.35, 1.0)));
    vec3 c2 = k < 1.0 ? vec3(0.9, 0.3, 0.6) : (k < 2.0 ? vec3(0.2, 0.9, 0.7) : (k < 3.0 ? vec3(1.0, 0.85, 0.5) : vec3(0.6, 0.5, 1.0)));
    col += mix(c1, c2, m) * pow(n, 2.3) * (0.9 / (1.0 + 0.5 * k));
  }
  col *= smoothstep(1.7, 0.5, r) * 0.7;
  // the young star at its heart: this is what becomes the sun of the next place
  col += vec3(0.85, 0.92, 1.0) * (exp(-r * r * 500.0) * 2.2 + exp(-r * 16.0) * 0.5);
  return col;
}

vec3 systemObj(vec2 q, float t) {
  float r = length(q);
  float a = atan(q.y, q.x);
  float flare = 0.5 + 0.5 * sin(a * 9.0 + t * 0.8 + fbm(vec2(a * 3.0, t * 0.1)) * 4.0);
  vec3 col = vec3(1.0, 0.85, 0.5) * (exp(-r * r * 700.0) * 4.0 + exp(-r * 16.0) * 0.8 + exp(-r * 6.0) * 0.25 * flare);
  for (int i = 0; i < 4; i++) {
    float k = float(i);
    float rk = 0.22 + 0.17 * k;
    vec2 o = rot(0.35) * q;
    o.y /= 0.36;
    float d = length(o) - rk;
    col += vec3(0.5, 0.65, 1.0) * exp(-d * d * 9000.0) * 0.35;
    float th = t * (0.5 / (1.0 + 0.7 * k)) + k * 2.1;
    vec2 pw = rot(-0.35) * vec2(cos(th) * rk, sin(th) * rk * 0.36);
    float dp = length(q - pw);
    vec3 pc = i == 0 ? vec3(0.9, 0.5, 0.3) : (i == 1 ? vec3(0.4, 0.7, 1.0) : (i == 2 ? vec3(0.9, 0.8, 0.6) : vec3(0.6, 0.5, 0.9)));
    float size = 0.012 + 0.008 * k;
    col += pc * (smoothstep(size, size * 0.4, dp) * 1.4 + exp(-dp * dp / (size * size * 6.0)) * 0.4);
  }
  return col;
}

vec3 planetObj(vec2 q, float t) {
  float R = 0.34;
  float r = length(q);
  vec3 col = vec3(1.0, 0.82, 0.5) * (exp(-r * r * 40.0) * 0.8 + exp(-r * 3.0) * 0.15);   // the sun, behind it
  vec2 rq = rot(-0.25) * q;
  float rd = length(vec2(rq.x, rq.y / 0.26));
  float ring = smoothstep(0.52, 0.54, rd) * smoothstep(0.95, 0.93, rd);
  float grain = 0.5 + 0.5 * sin(rd * 140.0 + fbm(vec2(rd * 30.0, 1.0)) * 6.0);
  vec3 ringCol = mix(vec3(0.6, 0.5, 0.38), vec3(0.95, 0.85, 0.65), grain) * (0.4 + 0.6 * fbm(vec2(rd * 60.0, 3.0)));
  vec2 lightDir = vec2(-0.7, 0.45);
  if (r < R) {
    vec3 n = vec3(q / R, sqrt(max(1.0 - dot(q / R, q / R), 0.0)));
    float dif = clamp(dot(n, normalize(vec3(-0.7, 0.45, 0.6))), 0.0, 1.0);
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
  vec2 mp = rot(0.25) * vec2(cos(t * 0.35) * 0.85, sin(t * 0.35) * 0.2);
  float md = length(q - mp);
  col += vec3(0.8, 0.8, 0.82) * smoothstep(0.045, 0.035, md) * (0.5 + 0.5 * clamp(dot(normalize(q - mp + 1e-3), normalize(lightDir)) + 0.5, 0.0, 1.0));
  return col;
}

vec3 holeObj(vec2 q, float t) {
  float r = length(q);
  float rs = 0.13;
  vec2 dq = vec2(q.x, q.y / 0.1);
  float dr = length(dq);
  float disk = smoothstep(0.17, 0.2, dr) * smoothstep(0.95, 0.5, dr);
  float streak = fbm(vec2(dr * 22.0 - t * 0.4, atan(dq.y, dq.x) * 2.0));
  float dop = 0.55 + 0.7 * smoothstep(-0.5, 0.5, -q.x);
  vec3 dcol = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.9, 0.7), exp(-(dr - 0.2) * 5.0)) * (0.5 + 1.1 * streak) * dop * disk * 1.6;
  float lr = abs(r - 0.2);
  float lens = exp(-lr * lr * 2200.0) * (0.35 + 0.65 * abs(q.y) / (r + 1e-3));
  vec3 col = vec3(1.0, 0.62, 0.28) * lens * dop * 1.3;
  col *= 1.0 - smoothstep(rs, rs - 0.006, r);
  col += dcol * (q.y < 0.0 ? 1.0 : smoothstep(rs * 0.9, rs * 1.5, r));
  col += vec3(1.0, 0.85, 0.6) * exp(-pow((r - rs * 1.55) / 0.006, 2.0)) * 0.7;
  return col;
}

vec3 journeyScene(vec2 p, float J, float t) {
  vec3 col = worldStars(p, J, t) * 1.35;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float w = smoothstep(fi - 1.6, fi - 0.9, J) * (i < 4 ? 1.0 - smoothstep(fi + 0.5, fi + 1.2, J) : 1.0);
    if (w > 0.002) {
      vec2 q = p / exp(1.45 * (J - fi));
      vec3 o = i == 0 ? galaxyObj(q, t) : (i == 1 ? nebulaObj(q, t) : (i == 2 ? systemObj(q, t) : (i == 3 ? planetObj(q, t) : holeObj(q, t))));
      col += o * w;
    }
  }
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uCells;
  vec2 p = (uv - 0.5) * vec2(uAsp, 1.0);

  float fall = min(uZoom / 0.78, 1.0);
  float zz = 1.02 * pow(22.0, fall);                         // the camera falls into the pupil
  float w = 1.0 + 2.4 * smoothstep(0.78, 1.0, uZoom);       // then pulls back to show the whole galaxy
  vec2 centre = vec2(mix(0.05, 0.0, smoothstep(0.0, 0.6, uZoom)), 0.0);
  float roll = 0.35 * smoothstep(0.3, 1.0, uZoom) + 0.004 * sin(uTime * 0.9);   // a slow roll, a little hand shake

  // motion blur along the line of the zoom
  vec3 col = vec3(0.0);
  if (uJourney > 0.0001) {
    float J = min(uJourney, 4.7);
    for (int i = 0; i < 3; i++) {
      col += journeyScene(p * (1.0 - uSpeed * 0.05 * float(i)), J, uTime);
    }
    col /= 3.0;
  } else {
    for (int i = 0; i < 5; i++) {
      vec2 pi = (p - centre) * (1.0 - uSpeed * 0.06 * float(i)) + centre;
      col += sceneAt(pi, zz * (1.0 + uSpeed * 0.02 * float(i)), w, centre, roll, uTime);
    }
    col /= 5.0;
  }

  float warpS = smoothstep(0.5, 0.68, uZoom) * (1.0 - smoothstep(0.76, 0.96, uZoom));
  col += warp(p, uTime, warpS);
  col += shoot(p, uTime) * smoothstep(0.82, 1.0, uZoom);

  // a white-out as the pupil takes the whole frame
  col += vec3(0.65, 0.8, 1.0) * exp(-pow((uZoom - 0.66) / 0.05, 2.0)) * 0.1;

  col = 1.0 - exp(-col * 1.05);                              // filmic roll-off
  // alpha carries where the glitter is, so the second pass can print stars there
  vec2 q0 = rot(roll) * (p - centre) / zz;
  float spark = clamp(dot(sparkle(q0, uTime), vec3(0.4)), 0.0, 1.0) * (1.0 - smoothstep(0.05, 0.4, uZoom)) * uOpen;
  outColor = vec4(col, spark);
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
float sparkAt(ivec2 c) { return texelFetch(uScene, clamp(c, ivec2(0), ivec2(uCells) - 1), 0).a; }

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
  float lvl = floor(level);
  float rnd = hash(vec2(cell) * 1.37 + floor(uTime * 1.6 + hash(vec2(cell).yx) * 4.0));   // every cell re-rolls now and then, out of step
  float idx = lvl * ${K}.0 + floor(rnd * ${K}.0);

  // edges become line glyphs that follow them
  float mag = length(g);
  if (mag > 0.15 && L > 0.1) {
    float e = abs(g.x) > 2.0 * abs(g.y) ? 1.0 : (abs(g.y) > 2.0 * abs(g.x) ? 0.0 : (g.x * g.y > 0.0 ? 3.0 : 2.0));
    idx = ${N * K}.0 + e;   // the line glyphs sit after the ramp
  }

  // glitter prints as little stars
  float sp = sparkAt(cell);
  if (sp > 0.22) idx = ${N * K}.0 + 4.0 + (sp > 0.55 ? 1.0 : 0.0);

  float total = ${N * K}.0 + 6.0;
  // the glyph takes only part of its cell, so there is air between the characters
  vec2 lc = (local - 0.5) * 1.3 + 0.5;
  float inside = step(0.0, lc.x) * step(lc.x, 1.0) * step(0.0, lc.y) * step(lc.y, 1.0);
  lc = clamp(lc, 0.0, 1.0);
  vec2 gu = vec2((idx + 0.06 + 0.88 * lc.x) / total, 0.04 + 0.92 * (1.0 - lc.y));
  // chromatic fringing grows toward the edges of the frame
  vec2 off = (fc / uRes - 0.5) * vec2(0.0022, 0.0);
  vec3 a = vec3(texture(uAtlas, gu + off).a, texture(uAtlas, gu).a, texture(uAtlas, gu - off).a) * inside;

  vec3 ink = mix(vec3(L), c, 1.55) * (0.85 + 1.1 * L) * uTint;   // push the colour
  if (sp > 0.22) ink = vec3(1.0, 0.86, 0.6) * (0.9 + 1.4 * sp);

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
  const us = loc(sceneProg, ['uCells', 'uAsp', 'uTime', 'uZoom', 'uOpen', 'uSpeed', 'uJourney', 'uMouse']);
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
    // Sorted by ink, the candidates are cut into N levels; each level keeps K neighbours of nearly the same weight.
    const M = ink.length;
    const levels = [];
    for (let k = 0; k < N; k++) {
      const start = Math.round((k * (M - K)) / (N - 1));
      levels.push(ink.slice(start, start + K).map((e) => e.ch));
    }
    const glyphs = [...levels.flat(), '-', '|', '/', '\\', '+', '*'];
    const ramp = levels.map((l) => l[0]);
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
  let journey = 0;   // 0 to 4.7: nebula, a star and its planets, a giant, a black hole
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
    gl.uniform1f(us.uJourney, journey);
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

  const smoothstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

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
      // After the galaxy, the rest of the page is the rest of the fall.
      const maxScroll = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
      const start = innerHeight * FALL;
      const jGoal = Math.min(Math.max((scrollY - start) / Math.max(maxScroll - start, 1), 0), 1) * 4.7;
      const nj = journey + (jGoal - journey) * Math.min(dt * 2.2, 1);
      speed = dt ? (next - zoom) / dt + ((nj - journey) / dt) * 0.4 : 0;
      zoom = next;
      journey = nj;
      power = basePower + 0.2 * (1 - Math.min(zoom * 2.5, 1)) + 0.4 * smoothstep(0.55, 0.9, zoom);   // space is the brightest part   // the opening shot is the brightest
    }
    draw();
  }

  addEventListener('pointermove', (e) => {
    mouse.tx = e.clientX / innerWidth;
    mouse.ty = 1 - e.clientY / innerHeight;
  }, { passive: true });
  addEventListener('resize', resize);
  if (reduce) addEventListener('scroll', () => {
    zoom = goalZoom();
    const maxScroll = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
    const start = innerHeight * FALL;
    journey = home ? Math.min(Math.max((scrollY - start) / Math.max(maxScroll - start, 1), 0), 1) * 4.7 : 0;
    draw();
  }, { passive: true });
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
