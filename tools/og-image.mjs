// Makes assets/og.png (1200x630) from the live home page: the ASCII planet with the name set over it.
// Needs Chrome and a built site. Run: npm run og
import { chromium } from 'playwright-core';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.resolve('index.html')).href);
await page.waitForTimeout(9000); // the curtain, then the background fading in

await page.evaluate(() => {
  for (const sel of ['main', '.site-header', '.site-footer', '.curtain']) {
    const el = document.querySelector(sel);
    if (el) el.style.opacity = '0';
  }
  const card = document.createElement('div');
  card.style.cssText = 'position:fixed;left:64px;bottom:56px;z-index:99;color:#f1eee8;text-shadow:0 0 24px #0b0d12,0 0 48px #0b0d12';
  card.innerHTML = '<div style="font:400 112px/0.95 \'Instrument Serif\',serif;letter-spacing:-0.02em">Kaan <em style="color:#e8963f">Dinç</em></div>'
    + '<div style="margin-top:14px;font:500 22px/1.3 \'Geist Mono\',monospace;letter-spacing:0.06em;text-transform:uppercase;color:#b9b6ae">Computer engineer · full-stack and desktop apps</div>';
  document.body.append(card);
});
await page.waitForTimeout(800);
await page.screenshot({ path: 'assets/og.png' });
await browser.close();
console.log('wrote assets/og.png');
