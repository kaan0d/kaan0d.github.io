// Home page motion: hero, counters, marquee, about scrub, timeline, project stack, repo pan.
(() => {
  const { $, $$, reduce, ready } = window.site || {};
  if (!ready) return;

  ready.then(() => {
    const glCanvas = window.site.heroGL?.canvas;
    if (glCanvas) gsap.to(glCanvas, { opacity: 1, duration: reduce ? 0 : 2.4, ease: 'power2.out' });
    if (reduce) return;

    hero();
    counters();
    marquee();
    aboutScrub();
    timeline();
    projectStack();
    repoPan();
    ScrollTrigger.refresh();
  });

  // Content drifts up and dims as the hero leaves the screen.
  function hero() {
    gsap.to('.hero__inner', {
      y: -90,
      opacity: 0.15,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
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

  // Featured projects pin in turn; each earlier card recedes as the next slides over it.
  function projectStack() {
    $$('.media').forEach((media) => {
      gsap.fromTo($('img', media), { yPercent: -4 }, {
        yPercent: 4,
        ease: 'none',
        scrollTrigger: { trigger: media, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    gsap.matchMedia().add('(min-width: 900px) and (min-height: 760px)', () => {
      const cards = $$('.stack-card');
      const last = cards[cards.length - 1];
      cards.forEach((card, i) => {
        if (card === last) return;
        ScrollTrigger.create({ trigger: card, start: 'top top', endTrigger: last, end: 'top top', pin: true, pinSpacing: false });
        gsap.to($('.stack-card__inner', card), {
          scale: 0.93,
          '--dim': 0.72,
          ease: 'none',
          scrollTrigger: { trigger: cards[i + 1], start: 'top bottom', end: 'top top', scrub: true },
        });
      });
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
