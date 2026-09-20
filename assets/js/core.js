// Shared behavior for every page: smooth scroll, header, anchors, reveals.
(() => {
  const scriptBase = document.currentScript.src.replace(/core.js.*$/, '');
  const root = document.documentElement;
  const reduce = root.classList.contains('reduce');
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const site = (window.site = { reduce, $, $$ });

  if (!window.gsap || !window.ScrollTrigger || !window.SplitText || !window.Lenis) return; // 4 s safety net shows content
  gsap.registerPlugin(ScrollTrigger, SplitText);

  const header = $('.site-header');
  const cue = $('.scroll-cue');

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

  // ---------- header stays put; it only gains a backdrop once the page moves ----------

  const NEAR_BOTTOM = 120;
  let cueReady = false;

  const updateCue = () => cue.classList.toggle('is-hidden', !cueReady || window.scrollY > ScrollTrigger.maxScroll(window) - NEAR_BOTTOM);

  function onScroll(self) {
    header.classList.toggle('is-scrolled', self.scroll() > 24);
    updateCue();
  }

  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: onScroll, onRefresh: onScroll });

  // ---------- header links: on small screens they scroll sideways ----------

  const nav = $('.site-nav');

  // Edge fades show which side still has links.
  const updateNavFade = () => {
    nav.classList.toggle('fade-left', nav.scrollLeft > 4);
    nav.classList.toggle('fade-right', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4);
  };
  nav.addEventListener('scroll', updateNavFade, { passive: true });
  addEventListener('resize', updateNavFade);
  updateNavFade();

  // Keeps the highlighted link centered in the scrolling row.
  site.syncNav = (smooth = true) => {
    const active = $('.is-active', nav);
    if (!active || nav.scrollWidth <= nav.clientWidth) return;
    const offset = active.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
    nav.scrollTo({ left: offset - (nav.clientWidth - active.offsetWidth) / 2, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  };

  cue.addEventListener('click', () => {
    site.scrollTo(Math.min(window.scrollY + window.innerHeight * 0.85, ScrollTrigger.maxScroll(window)));
  });

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
    site.scrollTo(url.hash ? document.getElementById(url.hash.slice(1)) || 0 : 0);
    if (url.hash) history.replaceState(null, '', url.hash);
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
    root.classList.add('ready');
    updateNavFade();
    if (root.dataset.page !== 'home') site.syncNav(false);
    else if (!reduce && nav.scrollWidth > nav.clientWidth) {
      // One small nudge tells first-time visitors the row scrolls.
      setTimeout(() => {
        if (nav.scrollLeft > 0) return;
        nav.scrollTo({ left: 56, behavior: 'smooth' });
        setTimeout(() => nav.scrollTo({ left: 0, behavior: 'smooth' }), 650);
      }, 2000);
    }
    setTimeout(() => { cueReady = true; updateCue(); }, reduce ? 0 : 1500);
    if (!reduce) {
      initReveals();
      intro();
    }
    // Decorative solids: wide screens only, loaded after everything else.
    if (!reduce && matchMedia('(min-width: 1000px)').matches && $('[data-obj]')) {
      import(scriptBase + 'objects.js').catch(() => {});
    }
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) setTimeout(() => site.scrollTo(target, true), 150);
    }
  })();

  addEventListener('load', () => ScrollTrigger.refresh());
})();
