// Home page motion: scenes (grade, nav), hero, about scrub, timeline, project reveals, terminal cards.
(() => {
  const { $, $$, reduce, ready, opened } = window.site || {};
  if (!ready) return;

  ready.then(() => {
    scenes();
    if (reduce) return;

    aboutScrub();
    timeline();
    films();
    terminals();
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

  // Each [data-scene] section sets the grade of the shader and the highlighted header link.
  function scenes() {
    const sections = $$('[data-scene]');
    const links = $$('.site-nav a[data-spy]');
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

      const id = current.id;
      for (const a of links) {
        const on = a.dataset.spy === id;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      }
    };
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: update, onRefresh: update });
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

  // Each terminal card types its command and prints the output lines when it scrolls in.
  function terminals() {
    $$('.term').forEach((term) => {
      const lines = $$('.term__line', term);
      const cursor = $('.term__cursor', term);
      gsap.set(lines, { autoAlpha: 0 });
      gsap.set(cursor, { autoAlpha: 0 });
      const tl = gsap.timeline({ paused: true, delay: 0.3 });
      lines.forEach((line) => {
        const typed = line.hasAttribute('data-type') ? $('.t', line) : null;
        if (typed) {
          const text = typed.textContent;
          const n = { c: 0 };
          typed.textContent = '';
          tl.set(line, { autoAlpha: 1 })
            .to(n, { c: text.length, duration: Math.max(0.5, text.length * 0.045), ease: 'none', onUpdate: () => { typed.textContent = text.slice(0, Math.round(n.c)); } })
            .to({}, { duration: 0.25 });
        } else {
          tl.fromTo(line, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out' }, '>+0.08');
        }
      });
      tl.set(cursor, { autoAlpha: 1 });
      ScrollTrigger.create({ trigger: term, start: 'top 90%', once: true, onEnter: () => tl.play() });
    });
  }

  // Each project frame opens like a curtain, then its image settles in.
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
      }
    });
  }

})();
