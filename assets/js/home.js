// Home page motion: scenes (grade, HUD, nav), hero, counters, marquee, about scrub, timeline, project reveals, repo reel.
(() => {
  const { $, $$, reduce, ready, opened } = window.site || {};
  if (!ready) return;

  ready.then(() => {
    scenes();
    if (reduce) return;

    counters();
    marquee();
    aboutScrub();
    timeline();
    films();
    repoPan();
    ScrollTrigger.refresh();
  });

  // The hero fades back as the first scene ends; waits for the curtain so it does not fight the intro.
  (opened || ready).then(() => {
    if (reduce) return;
    gsap.to('.hero__inner', {
      y: -80,
      opacity: 0.12,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
  });

  // Each [data-scene] section sets the grade of the shader, the HUD label and the highlighted header link.
  function scenes() {
    const sections = $$('[data-scene]');
    const links = $$('.site-nav a[data-spy]');
    const noEl = $('[data-scene-no]');
    const nameEl = $('[data-scene-name]');
    let last = null;

    const update = () => {
      const middle = window.innerHeight * 0.45;
      let current = sections[0];
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= middle) current = section;
      }
      if (window.scrollY >= ScrollTrigger.maxScroll(window) - 4) current = sections[sections.length - 1];
      if (current === last) return;
      last = current;

      window.site.grade?.(current.dataset.grade);
      if (noEl) noEl.textContent = String(sections.indexOf(current) + 1).padStart(2, '0');
      if (nameEl) nameEl.textContent = current.dataset.scene;

      // The contact section has the id "links"; the header calls it nothing, so the last link stays lit.
      const id = current.id === 'links' ? null : current.id;
      for (const a of links) {
        const on = a.dataset.spy === id;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      }
    };
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: update, onRefresh: update });
  }

  function counters() {
    $$('[data-count]').forEach((el) => {
      const end = Number(el.dataset.count);
      const decimals = Number(el.dataset.decimals || 0);
      const format = (v) => v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      const state = { value: 0 };
      el.textContent = format(0);
      ScrollTrigger.create({
        trigger: el,
        start: 'top 92%',
        once: true,
        onEnter: () => gsap.to(state, { value: end, duration: 2.2, ease: 'expo.out', onUpdate: () => { el.textContent = format(state.value); } }),
      });
    });
  }

  // Skill names run on their own and speed up with scroll velocity, reversing with direction.
  function marquee() {
    const loop = gsap.to('.marquee__track', { xPercent: -50, duration: 45, ease: 'none', repeat: -1 });
    let settle;
    ScrollTrigger.create({
      trigger: '.marquee',
      start: 'top bottom',
      end: 'bottom top',
      onToggle: (self) => loop[self.isActive ? 'play' : 'pause'](),
      onUpdate: (self) => {
        const speed = 1 + Math.min(Math.abs(self.getVelocity()) / 250, 6);
        settle?.kill();
        settle = gsap.timeline()
          .to(loop, { timeScale: self.direction * speed, duration: 0.2 })
          .to(loop, { timeScale: 1, duration: 1.4, ease: 'power2.out' });
      },
    });
  }

  // Words light up as the reader scrolls through the statement.
  function aboutScrub() {
    SplitText.create('[data-scrub]', {
      type: 'words',
      wordsClass: 'word',
      autoSplit: true,
      onSplit: (self) => gsap.fromTo(self.words, { opacity: 0.16 }, {
        opacity: 1,
        stagger: 0.12,
        ease: 'none',
        scrollTrigger: { trigger: '[data-scrub]', start: 'top 82%', end: 'bottom 48%', scrub: true },
      }),
    });
  }

  function timeline() {
    gsap.to('.timeline__fill', {
      scaleY: 1,
      ease: 'none',
      scrollTrigger: { trigger: '.timeline', start: 'top 70%', end: 'bottom 70%', scrub: true },
    });
  }

  // Each project frame opens like a curtain, then its image drifts while it crosses the screen.
  function films() {
    $$('.film').forEach((film) => {
      const frame = $('.film__frame', film);
      const img = $('img', frame);
      const rail = $('.film__rail', film);

      gsap.from(rail, { opacity: 0, y: 20, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: film, start: 'top 85%', once: true } });
      gsap.fromTo(frame, { clipPath: 'inset(0 0 100% 0)' }, {
        clipPath: 'inset(0 0 0% 0)',
        duration: 1.5,
        ease: 'expo.inOut',
        scrollTrigger: { trigger: frame, start: 'top 85%', once: true },
      });
      if (img) {
        gsap.fromTo(img, { scale: 1.3 }, { scale: 1, duration: 1.8, ease: 'expo.out', scrollTrigger: { trigger: frame, start: 'top 85%', once: true } });
        gsap.fromTo(img, { yPercent: -4 }, {
          yPercent: 4,
          ease: 'none',
          scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      }
    });
  }

  // Vertical scroll drives a horizontal track while the section is pinned.
  function repoPan() {
    gsap.matchMedia().add('(min-width: 900px)', () => {
      const track = $('.repos__track');
      const distance = () => track.scrollWidth - window.innerWidth;
      gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: { trigger: '.repos', start: 'top top', end: () => `+=${distance()}`, pin: true, scrub: 0.6, invalidateOnRefresh: true },
      });
    });
  }
})();
