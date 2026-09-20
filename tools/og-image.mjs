// Draws the 1200x630 link-preview image (assets/og.png): K mark, name, and the site's solids.
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const W = 1200;
const H = 630;
const AMBER = '#e8963f';

// ---------- small vector helpers ----------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(...a);
const unit = (a) => a.map((v) => v / len(a));
const mean = (pts) => pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length);

// Rotate about x, then about y.
function rotate([x, y, z], ax, ay) {
  const y1 = y * Math.cos(ax) - z * Math.sin(ax);
  const z1 = y * Math.sin(ax) + z * Math.cos(ax);
  return [x * Math.cos(ay) + z1 * Math.sin(ay), y1, -x * Math.sin(ay) + z1 * Math.cos(ay)];
}

// ---------- solids: a face is { pts, center } where center is the solid's middle ----------

const solidFaces = (polys, center = [0, 0, 0]) => polys.map((pts) => ({ pts, center }));

function octahedron() {
  const polys = [];
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) polys.push([[sx, 0, 0], [0, sy, 0], [0, 0, sz]]);
  return solidFaces(polys);
}

const T = (1 + Math.sqrt(5)) / 2;
const ICO_VERTS = [[-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0], [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T], [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1]].map(unit);
const ICO_FACES = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

const icosahedron = () => solidFaces(ICO_FACES.map((f) => f.map((i) => ICO_VERTS[i])));

// A dodecahedron is the dual of the icosahedron: one pentagon per icosahedron vertex.
function dodecahedron() {
  const centroids = ICO_FACES.map((f) => unit(mean(f.map((i) => ICO_VERTS[i]))));
  const polys = ICO_VERTS.map((axis, vi) => {
    const ring = ICO_FACES.map((f, fi) => (f.includes(vi) ? centroids[fi] : null)).filter(Boolean);
    const u = unit(cross(axis, Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const v = cross(axis, u);
    return ring.sort((a, b) => Math.atan2(dot(a, v), dot(a, u)) - Math.atan2(dot(b, v), dot(b, u)));
  });
  return solidFaces(polys);
}

// Three rows of cubes stacked into a pyramid, the shape Impulse settles into.
function cubePyramid() {
  const faces = [];
  const h = 0.31;
  const quads = [[[1, 1, 1], [1, 1, -1], [1, -1, -1], [1, -1, 1]], [[-1, 1, 1], [-1, -1, 1], [-1, -1, -1], [-1, 1, -1]], [[1, 1, 1], [-1, 1, 1], [-1, 1, -1], [1, 1, -1]], [[1, -1, 1], [1, -1, -1], [-1, -1, -1], [-1, -1, 1]], [[1, 1, 1], [1, -1, 1], [-1, -1, 1], [-1, 1, 1]], [[1, 1, -1], [-1, 1, -1], [-1, -1, -1], [1, -1, -1]]];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 3 - row; i++) {
      const center = [(i - (2 - row) / 2) * 0.68, row * 0.68 - 0.6, 0];
      for (const q of quads) faces.push({ pts: q.map(([x, y, z]) => [center[0] + x * h, center[1] + y * h, center[2] + z * h]), center });
    }
  }
  return faces;
}

// ---------- drawing ----------

const LIGHT = unit([-0.45, 0.75, 0.6]);
const FILL = unit([0.6, -0.3, 0.8]);
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const DARK = [28, 26, 23];
const LIT = [138, 88, 40];

// Flat-shaded faces (dark metal lit by warm light) with amber edges, like the 3D slots on the site.
function drawSolid(faces, { cx, cy, size, ax, ay }) {
  const drawn = [];
  for (const face of faces) {
    const pts = face.pts.map((p) => rotate(p, ax, ay));
    const outward = rotate(sub(mean(face.pts), face.center), ax, ay);
    let normal = unit(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    if (dot(normal, outward) < 0) normal = normal.map((v) => -v);
    if (normal[2] <= 0) continue;
    const light = Math.max(0, dot(normal, LIGHT)) ** 1.2 + 0.25 * Math.max(0, dot(normal, FILL));
    drawn.push({ pts, depth: mean(pts)[2], fill: hex(mix(DARK, LIT, Math.min(1, light))) });
  }
  drawn.sort((a, b) => a.depth - b.depth);
  return drawn
    .map((f) => {
      const d = f.pts.map((p) => `${(cx + p[0] * size).toFixed(1)},${(cy - p[1] * size).toFixed(1)}`).join(' ');
      return `<polygon points="${d}" fill="${f.fill}" stroke="${AMBER}" stroke-width="2" stroke-linejoin="round"/>`;
    })
    .join('\n');
}

const solids = [
  drawSolid(icosahedron(), { cx: 905, cy: 300, size: 172, ax: 0.5, ay: 0.55 }),
  drawSolid(dodecahedron(), { cx: 742, cy: 505, size: 78, ax: 0.35, ay: -0.4 }),
  drawSolid(octahedron(), { cx: 1090, cy: 505, size: 92, ax: 0.42, ay: 0.7 }),
  drawSolid(cubePyramid(), { cx: 1088, cy: 128, size: 62, ax: 0.5, ay: -0.55 }),
].join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.75" cy="0.48" r="0.55">
      <stop offset="0" stop-color="${AMBER}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${AMBER}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0a0a09"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
${solids}
  <g transform="translate(72 72) scale(1.75)">
    <rect width="64" height="64" rx="14" fill="#121211" stroke="#2b2926" stroke-width="1.2"/>
    <path d="M20 16v32M44 16L26 32l18 16" fill="none" stroke="${AMBER}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="72" y="318" font-family="Geist" font-weight="600" font-size="100" letter-spacing="-4" fill="#ebe8e2">Kaan Dinç</text>
  <text x="74" y="384" font-family="Geist" font-weight="400" font-size="34" fill="#8f8c85">Computer engineer.</text>
  <text x="74" y="428" font-family="Geist" font-weight="400" font-size="34" fill="#8f8c85">Full-stack apps and desktop tools,</text>
  <text x="74" y="472" font-family="Geist" font-weight="400" font-size="34" fill="#8f8c85">built end to end.</text>
  <text x="74" y="566" font-family="Geist Mono" font-weight="400" font-size="28" fill="${AMBER}">kaandinc.com</text>
</svg>`;

const fonts = 'node_modules/geist/dist/fonts';
const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: {
    loadSystemFonts: false,
    fontFiles: [`${fonts}/geist-sans/Geist-Regular.ttf`, `${fonts}/geist-sans/Geist-SemiBold.ttf`, `${fonts}/geist-mono/GeistMono-Regular.ttf`],
    defaultFontFamily: 'Geist',
  },
}).render().asPng();

fs.writeFileSync('assets/og.png', png);
console.log(`assets/og.png ${(png.length / 1024).toFixed(0)} KB`);
