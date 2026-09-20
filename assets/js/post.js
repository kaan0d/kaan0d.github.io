// Post page motion: reading progress, section highlight in the contents list, block reveals.
(() => {
  const { $, $$, reduce, ready } = window.site || {};
  if (!ready) return;

  ready.then(() => {
    gsap.to('.progress span', {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: { trigger: '.post', start: 'top top', end: 'bottom bottom', scrub: true },
    });

    const headings = $$('.post-body h2');
    headings.forEach((h2, i) => {
      const item = $(`.toc a[href="#${h2.id}"]`)?.parentElement;
      if (!item) return;
      ScrollTrigger.create({
        trigger: h2,
        start: 'top 40%',
        endTrigger: headings[i + 1] || '.post-body',
        end: headings[i + 1] ? 'top 40%' : 'bottom 40%',
        toggleClass: { targets: item, className: 'is-active' },
      });
    });

    if (reduce) return;
    ScrollTrigger.batch('.post-body > *', {
      start: 'top 94%',
      once: true,
      onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1, stagger: { amount: 0.4 }, ease: 'expo.out', overwrite: true }),
    });
  });
})();
