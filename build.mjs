// Static site build: src/ -> index.html, blog.html, posts/*.html. Run: npm run build
import fs from 'node:fs';
import path from 'node:path';
import { buildSync } from 'esbuild';

const SITE = 'https://kaandinc.com';
const NAME = 'Kaan Dinç';
const VENDOR = {
  'node_modules/gsap/dist/gsap.min.js': 'assets/vendor/gsap.min.js',
  'node_modules/gsap/dist/ScrollTrigger.min.js': 'assets/vendor/ScrollTrigger.min.js',
  'node_modules/gsap/dist/SplitText.min.js': 'assets/vendor/SplitText.min.js',
  'node_modules/lenis/dist/lenis.min.js': 'assets/vendor/lenis.min.js',
  'node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2': 'assets/fonts/Geist-Variable.woff2',
  'node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2': 'assets/fonts/GeistMono-Variable.woff2',
};

// ---------- helpers ----------

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const stripTags = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

function parseFrontmatter(raw) {
  const [, head, body] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta = Object.fromEntries(head.split('\n').map((line) => {
    const i = line.indexOf(': ');
    return [line.slice(0, i), line.slice(i + 2)];
  }));
  return { meta, body };
}

const slugify = (text) => stripTags(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Hover-roll link text: the copy in ::after slides up over the original.
const roll = (text) => `<span class="roll__in" data-text="${esc(text)}">${text}</span>`;

// ---------- posts ----------

function loadPosts() {
  const dir = 'src/posts';
  const posts = fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((file) => {
    const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(dir, file), 'utf8'));
    const used = new Set();
    const toc = [];
    const html = body.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, inner) => {
      let id = slugify(inner) || 'section';
      while (used.has(id)) id += '-2';
      used.add(id);
      toc.push({ id, text: stripTags(inner) });
      return `<h2 id="${id}">${inner}</h2>`;
    });
    // Reading time counts paragraphs only; tables, charts and code are skimmed.
    const prose = (body.match(/<p[^>]*>[\s\S]*?<\/p>/g) || []).map(stripTags).join(' ');
    const firstParagraph = stripTags(body.match(/<p[^>]*>[\s\S]*?<\/p>/)[0]);
    return {
      slug: file.replace(/\.html$/, ''),
      title: meta.title,
      date: meta.date,
      label: meta.label,
      html,
      toc,
      minutes: Math.max(1, Math.round(prose.split(' ').length / 220)),
      description: firstParagraph.length > 155 ? firstParagraph.slice(0, 155).replace(/\s\S*$/, '') + '...' : firstParagraph,
    };
  });
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- page shell ----------

const SECTION_LINKS = ['about', 'projects', 'experience', 'skills', 'education', 'repos', 'links'];
const CV_URL = 'https://drive.google.com/file/d/1M5Ri6U8PAwSgwr31EN4JDeT90P7OuCPo/view';
const EXTERNAL_LINKS = [
  ['email', 'mailto:kaan.dnc.7505@gmail.com'],
  ['github', 'https://github.com/kaan0d'],
  ['linkedin', 'https://www.linkedin.com/in/kaandinc/'],
  ['cv', CV_URL],
];

const PERSON_LD = `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: NAME,
  jobTitle: 'Computer Engineer',
  url: SITE,
  sameAs: ['https://github.com/kaan0d', 'https://www.linkedin.com/in/kaandinc/'],
  alumniOf: { '@type': 'CollegeOrUniversity', name: 'Gaziosmanpaşa University' },
})}</script>`;

function shell({ file, kind, title, description, main }) {
  const base = '../'.repeat(file.split('/').length - 1);
  const home = base || './';
  const canonical = file === 'index.html' ? SITE + '/' : `${SITE}/${file.replace(/\.html$/, '')}`;
  const fullTitle = kind === 'home' ? `${NAME} | Computer Engineer, full-stack and desktop developer` : `${title} | ${NAME}`;
  const scripts = ['gsap.min.js', 'ScrollTrigger.min.js', 'SplitText.min.js', 'lenis.min.js']
    .map((s) => `<script defer src="${base}assets/vendor/${s}"></script>`)
    .join('\n');
  const pageScripts = { home: ['hero-gl.js', 'home.js'], blog: [], post: ['post.js'] }[kind];

  return `<!doctype html>
<html lang="en" data-page="${kind}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#0a0a09">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${kind === 'post' ? 'article' : 'website'}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="${base}assets/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${base}assets/css/base.css">
<link rel="stylesheet" href="${base}assets/css/${kind}.css">
<script>
(function (d) {
  d.classList.add('js');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) d.classList.add('reduce');
  try { if (sessionStorage.getItem('curtain')) d.classList.add('curtain-on'); } catch (e) {}
  // Safety net: reveal content if the animation scripts never report ready.
  setTimeout(function () { if (!d.classList.contains('ready')) d.classList.add('no-anim'); }, 4000);
})(document.documentElement);
</script>
${kind === 'home' ? PERSON_LD : ''}
</head>
<body>
<div class="curtain" aria-hidden="true"></div>
<a class="skip" href="#main">skip to content</a>

<header class="site-header">
  <a class="site-header__brand" href="${home}" aria-label="${NAME}, home">${NAME}</a>
  <nav class="site-nav" aria-label="primary">
    <a class="roll" href="${home}#projects">${roll('projects')}</a>
    <a class="roll" href="${base}blog">${roll('blog')}</a>
    <a class="roll" href="${CV_URL}" target="_blank" rel="noopener">${roll('cv')}</a>
    <button class="site-nav__menu roll" type="button" aria-expanded="false" aria-controls="menu">${roll('menu')}</button>
  </nav>
</header>

<nav class="rail" aria-label="sections">
  <ul>
${SECTION_LINKS.map((s) => `    <li><a href="${home}#${s}" data-spy="${s}">${s}</a></li>`).join('\n')}
    <li class="rail__gap"><a href="${base}blog"${kind === 'home' ? '' : ' class="is-active" aria-current="true"'}>blog</a></li>
  </ul>
</nav>

<div class="menu" id="menu" hidden>
  <div class="menu__inner">
    <ul class="menu__list">
${SECTION_LINKS.map((s) => `      <li><a href="${home}#${s}"><span>${s}</span></a></li>`).join('\n')}
      <li><a href="${base}blog"><span>blog</span></a></li>
    </ul>
    <ul class="menu__ext">
${EXTERNAL_LINKS.map(([k, href]) => `      <li><a class="roll" href="${href}"${k === 'email' ? '' : ' target="_blank" rel="noopener"'}>${roll(k)}</a></li>`).join('\n')}
    </ul>
  </div>
</div>

<main id="main">
${main}
</main>

<footer class="site-footer">
  <span>${NAME}</span>
  <span>Çanakkale, Turkey</span>
  <button class="roll" type="button" data-top>${roll('back to top')}</button>
</footer>

<button class="scroll-cue is-hidden" type="button" aria-label="scroll down"><span></span></button>

${scripts}
<script defer src="${base}assets/js/core.js"></script>
${pageScripts.map((s) => `<script defer src="${base}assets/js/${s}"></script>`).join('\n')}
</body>
</html>
`;
}

// ---------- page bodies ----------

function blogMain(posts) {
  const years = [...new Set(posts.map((p) => p.date.slice(0, 4)))];
  const groups = years.map((year) => `
    <section class="year" data-fade>
      <h2 class="year__label">${year}</h2>
      <ul class="post-list">
${posts.filter((p) => p.date.startsWith(year)).map((p) => `        <li><a class="post-row" href="posts/${p.slug}">
          <span class="post-row__date">${p.label}</span>
          <span class="post-row__title">${p.title}</span>
          <span class="post-row__meta">${p.minutes} min read</span>
          <span class="post-row__arrow" aria-hidden="true">&rarr;</span>
        </a></li>`).join('\n')}
      </ul>
    </section>`).join('\n');

  return `<section class="blog-hero">
  <div class="obj" data-obj="tetra" aria-hidden="true"></div>
  <h1 class="blog-hero__title" data-split="lines" data-hero>blog</h1>
  <p class="blog-hero__lede" data-fade data-hero>notes on what i've been building.</p>
</section>
<div class="blog-index">${groups}
</div>`;
}

function postMain(post, posts) {
  const i = posts.findIndex((p) => p.slug === post.slug);
  const newer = posts[i - 1];
  const older = posts[i + 1];
  const toc = post.toc.length < 3 ? '' : `
    <aside class="toc" aria-label="on this page">
      <ol>
${post.toc.map((t) => `        <li><a href="#${t.id}">${t.text}</a></li>`).join('\n')}
      </ol>
    </aside>`;
  const step = (p, dir) => p ? `<a class="post-step post-step--${dir}" href="${p.slug}">
      <span class="post-step__dir">${dir === 'newer' ? '&larr; newer' : 'older &rarr;'}</span>
      <span class="post-step__title">${p.title}</span>
    </a>` : '<span></span>';

  return `<div class="progress" aria-hidden="true"><span></span></div>
<article class="post">
  <header class="post-head">
    <a class="post-head__back roll" href="../blog">${roll('&larr; blog')}</a>
    <p class="post-head__meta" data-hero><time datetime="${post.date}">${post.label}</time> &nbsp;/&nbsp; ${post.minutes} min read</p>
    <h1 class="post-head__title" data-split="lines" data-hero>${post.title}</h1>
  </header>
  <div class="post-layout${toc ? ' has-toc' : ''}">${toc}
    <div class="post-body">
${post.html}
    </div>
  </div>
</article>
<nav class="post-steps" aria-label="more posts">
  ${step(newer, 'newer')}
  ${step(older, 'older')}
</nav>`;
}

// ---------- run ----------

for (const [from, to] of Object.entries(VENDOR)) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

// Three.js is tree-shaken into one file that core.js loads lazily on wide screens.
buildSync({ entryPoints: ['src/js/objects.js'], bundle: true, minify: true, format: 'esm', outfile: 'assets/js/objects.js' });

const posts = loadPosts();
const urls = [`${SITE}/`, `${SITE}/blog`];

write('index.html', shell({
  file: 'index.html',
  kind: 'home',
  title: NAME,
  description: 'Kaan Dinç, computer engineer interested in the defense industry. Full-stack apps, desktop tools, a packet analyzer and a physics engine, built end to end. See projects and CV.',
  main: fs.readFileSync('src/index.html', 'utf8').replace(/\$\{ROLL\}([^<]+)/g, (_, text) => roll(text)),
}));

write('blog.html', shell({
  file: 'blog.html',
  kind: 'blog',
  title: 'Blog',
  description: "Notes on what I've been building: a packet analyzer, a physics engine, desktop apps and more.",
  main: blogMain(posts),
}));

for (const post of posts) {
  write(`posts/${post.slug}.html`, shell({
    file: `posts/${post.slug}.html`,
    kind: 'post',
    title: post.title,
    description: post.description,
    main: postMain(post, posts),
  }));
  urls.push(`${SITE}/posts/${post.slug}`);
}

write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`built ${posts.length} posts + home + blog`);
