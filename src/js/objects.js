// Decorative 3D solids on one fixed canvas. Each solid follows an empty [data-obj] slot in the layout.
import {
  AmbientLight, BoxGeometry, CylinderGeometry, DirectionalLight, DodecahedronGeometry, EdgesGeometry,
  Group, IcosahedronGeometry, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, OctahedronGeometry,
  OrthographicCamera, Scene, TetrahedronGeometry, WebGLRenderer,
} from 'three';

const AMBER = 0xe8963f;
const BASE_SIZE = 2.2; // world units spanned by every shape, so slot width maps to scale

// Dark metal faces; polygon offset keeps outlines from z-fighting with them.
const faceOptions = { color: 0x2a2620, roughness: 0.38, metalness: 0.45, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
const flatFaces = new MeshStandardMaterial({ ...faceOptions, flatShading: true });
const outline = new LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.85 });

const faceted = (geometry) => {
  const group = new Group();
  group.add(new Mesh(geometry, flatFaces), new LineSegments(new EdgesGeometry(geometry, 20), outline));
  return group;
};

// A three-row pyramid of cubes, the same stack Impulse settles and sleeps.
const pyramid = () => {
  const group = new Group();
  const cube = new BoxGeometry(0.62, 0.62, 0.62);
  const edges = new EdgesGeometry(cube);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 3 - row; i++) {
      const box = new Group();
      box.add(new Mesh(cube, flatFaces), new LineSegments(edges, outline));
      box.position.set((i - (2 - row) / 2) * 0.68, row * 0.68 - 0.6, 0);
      group.add(box);
    }
  }
  return group;
};

const SHAPES = {
  ico: () => faceted(new IcosahedronGeometry(1.05, 0)),
  octa: () => faceted(new OctahedronGeometry(1.1, 0)),
  dodeca: () => faceted(new DodecahedronGeometry(1.05, 0)),
  tetra: () => faceted(new TetrahedronGeometry(1.25, 0)),
  prism: () => faceted(new CylinderGeometry(0.85, 0.85, 1.5, 6)),
  cube: () => faceted(new BoxGeometry(1.45, 1.45, 1.45)),
  pyramid,
};

let renderer;
try {
  renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
} catch (e) {
  renderer = null; // no WebGL: the page simply has no solids
}

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.domElement.className = 'objects-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  document.body.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new OrthographicCamera(0, 0, 0, 0, -2000, 2000);
  scene.add(new AmbientLight(0x6a5a48, 2.0));
  const key = new DirectionalLight(0xffa552, 5.5);
  key.position.set(-0.6, 1, 1.2);
  const fill = new DirectionalLight(0xffe6cc, 1.8);
  fill.position.set(1, -0.5, 0.8);
  scene.add(key, fill);

  const slots = [...document.querySelectorAll('[data-obj]')].map((el) => {
    const root = new Group();
    const spin = SHAPES[el.dataset.obj]();
    root.add(spin);
    root.visible = false;
    scene.add(root);
    return { el, root, spin, show: 0, tilt: 0.25 + Math.random() * 0.4, phase: Math.random() * 6 };
  });

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / innerHeight) * 2 - 1;
  });

  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.left = -innerWidth / 2;
    camera.right = innerWidth / 2;
    camera.top = innerHeight / 2;
    camera.bottom = -innerHeight / 2;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const easeOut = (t) => 1 - (1 - t) ** 3;
  let last = 0;
  let drewLastFrame = false;

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // Solids spin faster while the page is scrolling.
    const boost = 1 + Math.min(Math.abs(window.site?.lenis?.velocity ?? 0) * 0.08, 5);
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;

    let anyVisible = false;
    for (const slot of slots) {
      const rect = slot.el.getBoundingClientRect();
      const inView = rect.width > 0 && rect.bottom > -80 && rect.top < innerHeight + 80;
      slot.show += ((inView ? 1 : 0) - slot.show) * Math.min(dt * 5, 1);
      slot.root.visible = slot.show > 0.01;
      if (!slot.root.visible) continue;
      anyVisible = true;

      slot.root.position.set(rect.left + rect.width / 2 - innerWidth / 2, innerHeight / 2 - (rect.top + rect.height / 2), 0);
      slot.root.scale.setScalar((rect.width / BASE_SIZE) * easeOut(slot.show));
      slot.root.rotation.y = pointer.x * 0.35;
      slot.spin.rotation.y += dt * 0.28 * boost;
      slot.spin.rotation.x = slot.tilt + pointer.y * 0.3 + Math.sin(now / 2400 + slot.phase) * 0.08;
    }

    if (anyVisible || drewLastFrame) renderer.render(scene, camera);
    drewLastFrame = anyVisible;
  }
  requestAnimationFrame(frame);
}
