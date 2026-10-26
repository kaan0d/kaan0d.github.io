// Shared behavior for every page: smooth scroll, header, menu, curtain, cursor, timecode, reveals.
(() => {
  const root = document.documentElement;
  const reduce = root.classList.contains('reduce');
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const site = (window.site = { reduce, $, $$ });

  if (!window.gsap || !window.ScrollTrigger || !window.SplitText || !window.Lenis) return; // 4 s safety net shows content
  gsap.registerPlugin(ScrollTrigger, SplitText);

  const header = $('.site-header');
  const nav = $('.site-nav');
  const menuBtn = $('.menu-btn');
  const curtain = $('.curtain');

  // ---------- smooth scroll ----------

  const lenis = reduce ? null : new Lenis({ duration: 1.1, easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)) });
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  site.lenis = lenis;

  // Ease in and out so long jumps do not lurch off the start line.
  const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

  site.scrollTo = (target, immediate = false) => {
    if (lenis) {
      lenis.resize(); // pin spacers added after init would otherwise clamp the target
      const to = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY;
      const distance = Math.abs(to - window.scrollY);
      // Longer trips take longer, capped so the far end of the page stays reachable.
      const duration = Math.min(3.4, 0.9 + distance / 3500);
      return lenis.scrollTo(target, { duration, easing: easeInOut, immediate });
    }
    return typeof target === 'number' ? window.scrollTo({ top: target }) : target.scrollIntoView();
  };

  // ---------- header backdrop, timecode and HUD ----------

  const RUNTIME = 6120; // the page runs 1 h 42 min; the timecode is just scroll position
  const FPS = 24;
  const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');
  const timecodeEl = $('[data-timecode]');
  const pctEl = $('[data-scene-pct]');

  function onScroll(self) {
    header.classList.toggle('is-scrolled', self.scroll() > 24);
    const max = ScrollTrigger.maxScroll(window) || 1;
    const progress = Math.min(Math.max(self.scroll() / max, 0), 1);
    const frames = Math.round(progress * RUNTIME * FPS);
    const s = Math.floor(frames / FPS);
    if (timecodeEl) timecodeEl.textContent = `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}:${pad(frames % FPS)}`;
    if (pctEl) pctEl.textContent = `${Math.round(progress * 100)}%`;
  }

  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: onScroll, onRefresh: onScroll });

  // ---------- menu (small screens) ----------

  const setMenu = (open) => {
    root.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) lenis?.stop(); else lenis?.start();
  };
  menuBtn.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  matchMedia('(min-width: 1100px)').addEventListener('change', () => setMenu(false));

  // ---------- curtain: runs on the way out of a page and the way in ----------

  const halves = $$('.curtain__half');
  const [top, bottom] = halves;
  const seen = (() => { try { return sessionStorage.getItem('seen'); } catch (e) { return null; } })();
  const firstVisit = !seen && root.dataset.page === 'home';
  try { sessionStorage.setItem('seen', '1'); } catch (e) { /* private mode: the intro just repeats */ }

  site.openCurtain = async () => {
    if (!curtain || reduce) return;
    const count = $('.curtain__count');
    const label = $('.curtain__label');
    if (firstVisit) {
      const n = { v: 0 };
      await gsap.to(n, { v: 100, duration: 1.5, ease: 'power2.inOut', onUpdate: () => { count.textContent = pad(n.v); } });
    } else {
      gsap.set([count, label], { autoAlpha: 0 });
    }
    await gsap.timeline()
      .to([count, label], { autoAlpha: 0, y: -24, duration: 0.4, ease: 'power2.in' })
      .to(top, { yPercent: -100, duration: firstVisit ? 1.1 : 0.8, ease: 'expo.inOut' }, '>-0.05')
      .to(bottom, { yPercent: 100, duration: firstVisit ? 1.1 : 0.8, ease: 'expo.inOut' }, '<');
    gsap.set(curtain, { display: 'none' });
  };

  const leave = (href) => {
    gsap.set(curtain, { display: 'block' });
    gsap.set($$('.curtain__count, .curtain__label'), { autoAlpha: 0 });
    gsap.timeline({ onComplete: () => { location.href = href; } })
      .fromTo(top, { yPercent: -100 }, { yPercent: 0, duration: 0.55, ease: 'expo.inOut' })
      .fromTo(bottom, { yPercent: 100 }, { yPercent: 0, duration: 0.55, ease: 'expo.inOut' }, '<');
  };

  // Back/forward restores the page from memory with the curtain still closed.
  addEventListener('pageshow', (e) => { if (e.persisted && curtain) gsap.set(curtain, { display: 'none' }); });

  // ---------- links: same-page anchors scroll smoothly, other pages go through the curtain ----------

  const cleanPath = (p) => p.replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '');

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;

    if (cleanPath(url.pathname) !== cleanPath(location.pathname)) {
      if (reduce) return;
      e.preventDefault();
      leave(a.href);
      return;
    }

    e.preventDefault();
    site.scrollTo(url.hash ? document.getElementById(url.hash.slice(1)) || 0 : 0);
    if (url.hash) history.replaceState(null, '', url.hash);
  });

  $$('[data-top]').forEach((btn) => btn.addEventListener('click', () => site.scrollTo(0)));

  // ---------- cursor ----------

  site.fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  function initCursor() {
    const ring = $('.cursor');
    const word = $('span', ring);
    root.classList.add('has-cursor');
    const x = gsap.quickTo(ring, 'x', { duration: 0.35, ease: 'power3' });
    const y = gsap.quickTo(ring, 'y', { duration: 0.35, ease: 'power3' });
    ring.classList.add('is-hidden');
    addEventListener('pointermove', (e) => { ring.classList.remove('is-hidden'); x(e.clientX); y(e.clientY); }, { passive: true });
    document.addEventListener('pointerleave', () => ring.classList.add('is-hidden'));
    document.addEventListener('pointerover', (e) => {
      const label = e.target.closest('[data-cursor]');
      word.textContent = label ? label.dataset.cursor : '';
      ring.classList.toggle('is-label', !!label);
      ring.classList.toggle('is-link', !label && !!e.target.closest('a, button, summary'));
    });
  }

  // ---------- reveals ----------

  // Heading lines rise out of a mask. Re-splits on resize and font load.
  site.splitLines = (el, vars = {}) => SplitText.create(el, {
    type: 'lines',
    mask: 'lines',
    autoSplit: true,
    onSplit: (self) => {
      gsap.set(el, { visibility: 'visible' });
      return gsap.from(self.lines, { yPercent: 140, duration: 1.2, ease: 'expo.out', stagger: 0.09, ...vars });
    },
  });

  function initReveals() {
    $$('[data-split]:not([data-hero])').forEach((el) => {
      site.splitLines(el, { scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });

    ScrollTrigger.batch('[data-fade]:not([data-hero])', {
      start: 'top 92%',
      once: true,
      onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, stagger: { amount: 0.4 }, ease: 'expo.out', overwrite: true }),
    });

    if (!site.fine) return;
    $$('[data-magnetic]').forEach((el) => {
      const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
      const y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        x((e.clientX - r.left - r.width / 2) * 0.28);
        y((e.clientY - r.top - r.height / 2) * 0.28);
      });
      el.addEventListener('pointerleave', () => { x(0); y(0); });
    });
  }

  // Top-of-page content: header, then each [data-hero] element in document order.
  function intro() {
    gsap.from($$('.site-header > *'), { opacity: 0, y: -14, duration: 1, stagger: 0.08, ease: 'expo.out' });
    $$('[data-hero]').forEach((el, i) => {
      if (el.hasAttribute('data-split')) {
        site.splitLines(el, { delay: 0.1 });
        return;
      }
      gsap.set(el, { visibility: 'visible' });
      gsap.fromTo(el, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 1.1, delay: 0.35 + i * 0.1, ease: 'expo.out' });
    });
  }

  // ---------- boot ----------

  site.ready = (async () => {
    await document.fonts.ready;
    root.classList.add('ready');
    if (!reduce) {
      initReveals();
      if (site.fine) initCursor();
    }
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) setTimeout(() => site.scrollTo(target, true), 150);
    }
  })();

  // Scripts that need the opened page (hero text, pinned sections) wait on this one.
  site.opened = site.ready.then(async () => {
    await site.openCurtain();
    if (!reduce) intro();
  });

  addEventListener('load', () => ScrollTrigger.refresh());
})();
