// Shared behavior for every page: smooth scroll, header, menu, intro curtain, timecode, reveals.
(() => {
  const root = document.documentElement;
  const reduce = root.classList.contains('reduce');
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const site = (window.site = { reduce, $, $$ });

  // Calm mode: no flicker, no glitter, the letters hold still. Remembered between visits.
  const calmBtn = $('[data-calm]');
  const setCalm = (on) => {
    root.classList.toggle('calm', on);
    calmBtn?.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem('calm', on ? '1' : '0'); } catch (e) { /* private mode: it just resets next visit */ }
  };
  calmBtn?.setAttribute('aria-pressed', String(root.classList.contains('calm')));
  calmBtn?.addEventListener('click', () => setCalm(!root.classList.contains('calm')));

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

  function onScroll(self) {
    header.classList.toggle('is-scrolled', self.scroll() > 24);
    const max = ScrollTrigger.maxScroll(window) || 1;
    const progress = Math.min(Math.max(self.scroll() / max, 0), 1);
    const frames = Math.round(progress * RUNTIME * FPS);
    const s = Math.floor(frames / FPS);
    if (timecodeEl) timecodeEl.textContent = `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}:${pad(frames % FPS)}`;
  }

  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: onScroll, onRefresh: onScroll });

  // ---------- menu (small screens) ----------

  // While the menu covers the screen, the page behind it is out of reach for Tab and screen readers.
  const behind = $$('main, .site-footer');
  const setMenu = (open) => {
    const was = root.classList.contains('menu-open');
    root.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    behind.forEach((el) => { el.inert = open; });
    if (open) lenis?.stop(); else lenis?.start();
    if (open && !was) $('a', nav)?.focus();
    if (!open && was && nav.contains(document.activeElement)) menuBtn.focus();
  };
  menuBtn.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  matchMedia('(min-width: 1100px)').addEventListener('change', () => setMenu(false));

  // ---------- curtain: the opening of the first visit to the home page ----------

  const [top, bottom] = $$('.curtain__half');
  const firstVisit = root.classList.contains('intro');
  try { sessionStorage.setItem('seen', '1'); } catch (e) { /* private mode: the intro just repeats */ }

  site.openCurtain = async () => {
    if (!curtain || reduce || !firstVisit) return;
    const count = $('.curtain__count');
    const n = { v: 0 };
    await gsap.to(n, { v: 100, duration: 1, ease: 'power2.inOut', onUpdate: () => { count.textContent = pad(n.v); } });
    await gsap.timeline()
      .to([count, $('.curtain__label')], { autoAlpha: 0, y: -24, duration: 0.4, ease: 'power2.in' })
      .to(top, { yPercent: -100, duration: 1.1, ease: 'expo.inOut' }, '>-0.05')
      .to(bottom, { yPercent: 100, duration: 1.1, ease: 'expo.inOut' }, '<');
    gsap.set(curtain, { display: 'none' });
  };

  // ---------- links: same-page anchors scroll smoothly, everything else navigates normally ----------

  const cleanPath = (p) => p.replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '');

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;

    if (cleanPath(url.pathname) !== cleanPath(location.pathname)) return;

    e.preventDefault();
    const target = url.hash ? document.getElementById(url.hash.slice(1)) : null;
    site.scrollTo(target || 0);
    if (url.hash) history.replaceState(null, '', url.hash);
    // Move focus too, so the next Tab continues from where the page now is.
    if (target) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });

  $$('[data-top]').forEach((btn) => btn.addEventListener('click', () => site.scrollTo(0)));

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
  }

  // Top-of-page content: header, then each [data-hero] element in document order.
  function intro() {
    // On the home page the headline waits a beat for the background to fade in.
    const wait = root.dataset.page === 'home' ? 0.4 : 0;
    gsap.from($$('.site-header > *'), { opacity: 0, y: -14, duration: 1, stagger: 0.08, ease: 'expo.out' });
    $$('[data-hero]').forEach((el, i) => {
      if (el.hasAttribute('data-split')) {
        site.splitLines(el, { delay: 0.1 + wait });
        return;
      }
      gsap.set(el, { visibility: 'visible' });
      gsap.fromTo(el, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 1.1, delay: 0.35 + wait + i * 0.1, ease: 'expo.out' });
    });
  }

  // ---------- boot ----------

  site.ready = (async () => {
    await document.fonts.ready;
    root.classList.add('ready');
    if (!reduce) {
      initReveals();
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
