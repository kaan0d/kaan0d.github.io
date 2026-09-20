// Shared behavior for every page: smooth scroll, header, menu, page transitions, reveals.
(() => {
  const root = document.documentElement;
  const reduce = root.classList.contains('reduce');
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const site = (window.site = { reduce, $, $$ });

  if (!window.gsap || !window.ScrollTrigger || !window.SplitText || !window.Lenis) return; // 4 s safety net shows content
  gsap.registerPlugin(ScrollTrigger, SplitText);

  const header = $('.site-header');
  const curtain = $('.curtain');
  const menu = $('#menu');
  const menuToggle = $('.site-nav__menu');
  let menuOpen = false;

  // ---------- smooth scroll ----------

  const lenis = reduce ? null : new Lenis({ duration: 1.1, easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)) });
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  site.lenis = lenis;

  site.scrollTo = (target, immediate = false) => {
    if (lenis) return lenis.scrollTo(target, { duration: 1.4, immediate });
    return target === 0 ? window.scrollTo(0, 0) : target.scrollIntoView();
  };

  // ---------- header: hides while reading down, returns on scroll up ----------

  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      header.classList.toggle('is-scrolled', self.scroll() > 24);
      header.classList.toggle('is-hidden', !reduce && !menuOpen && self.direction === 1 && self.scroll() > 240);
    },
  });

  // ---------- menu ----------

  const menuLinks = $$('.menu__list a > span');
  const menuExt = $$('.menu__ext li');

  function setMenuLabel(text) {
    const label = $('.roll__in', menuToggle);
    label.textContent = text;
    label.dataset.text = text;
  }

  function setMenu(open) {
    if (open === menuOpen) return;
    menuOpen = open;
    menuToggle.setAttribute('aria-expanded', open);
    setMenuLabel(open ? 'close' : 'menu');
    $('main').inert = open;
    $('.site-footer').inert = open;
    header.classList.remove('is-hidden');

    if (open) {
      menu.hidden = false;
      lenis?.stop();
      if (reduce) return;
      gsap.fromTo(menu, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.9, ease: 'expo.inOut' });
      gsap.fromTo(menuLinks, { yPercent: 110 }, { yPercent: 0, duration: 1.1, stagger: 0.05, delay: 0.3, ease: 'expo.out' });
      gsap.fromTo(menuExt, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.06, delay: 0.55, ease: 'expo.out' });
      return;
    }

    lenis?.start();
    if (reduce) { menu.hidden = true; return; }
    gsap.to(menu, { clipPath: 'inset(0 0 100% 0)', duration: 0.7, ease: 'expo.inOut', onComplete: () => { menu.hidden = true; } });
  }

  menuToggle.addEventListener('click', () => setMenu(!menuOpen));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  // ---------- links: same-page anchors scroll, other pages get the curtain ----------

  const cleanPath = (p) => p.replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '');

  function leave(href) {
    try { sessionStorage.setItem('curtain', '1'); } catch (e) { /* private mode: navigate without curtain */ }
    gsap.fromTo(curtain, { yPercent: 100, visibility: 'visible' }, { yPercent: 0, duration: 0.8, ease: 'expo.inOut', onComplete: () => { location.href = href; } });
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;

    e.preventDefault();
    const samePage = cleanPath(url.pathname) === cleanPath(location.pathname);
    if (!samePage) {
      if (reduce) { location.href = url.href; return; }
      leave(url.href);
      return;
    }

    const target = url.hash ? document.getElementById(url.hash.slice(1)) : null;
    const wasOpen = menuOpen;
    setMenu(false);
    setTimeout(() => site.scrollTo(target || 0), wasOpen ? 450 : 0);
    if (url.hash) history.replaceState(null, '', url.hash);
  });

  $$('[data-top]').forEach((btn) => btn.addEventListener('click', () => site.scrollTo(0)));

  // Restoring from the back/forward cache must not leave the curtain covering the page.
  addEventListener('pageshow', (e) => {
    if (e.persisted) gsap.set(curtain, { yPercent: 100, visibility: 'hidden' });
  });

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

  site.fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  site.ready = (async () => {
    await document.fonts.ready;
    const entering = root.classList.contains('curtain-on');
    if (entering) {
      try { sessionStorage.removeItem('curtain'); } catch (e) { /* ignore */ }
      gsap.set(curtain, { yPercent: 0, visibility: 'visible' });
      root.classList.remove('curtain-on');
      gsap.to(curtain, { yPercent: -100, duration: 1, ease: 'expo.inOut', delay: 0.1, onComplete: () => gsap.set(curtain, { visibility: 'hidden', yPercent: 100 }) });
      await new Promise((r) => setTimeout(r, 600));
    }
    root.classList.add('ready');
    if (!reduce) {
      initReveals();
      intro();
    }
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) setTimeout(() => site.scrollTo(target, true), 50);
    }
  })();

  addEventListener('load', () => ScrollTrigger.refresh());
})();
