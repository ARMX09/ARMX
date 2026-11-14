// يرسم العبارة الختامية كصور PNG شفافة (1920×1080) بخط Cairo عبر Chromium
// لأن المتصفح يتعامل مع تشكيل الحروف العربية والمسافات بشكل صحيح.
// الناتج: build/line1.png و build/line2.png
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const dir = __dirname;
const { ending_text: lines } = JSON.parse(fs.readFileSync(path.join(dir, 'shots.json'), 'utf8'));
const font = (f) => 'file://' + path.join(dir, 'fonts', f);

const html = (text, top) => `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:Cairo;font-weight:700;src:url(${font('cairo-arabic-700-normal.woff2')}) format('woff2');unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF,U+200C-200E}
@font-face{font-family:Cairo;font-weight:700;src:url(${font('cairo-latin-700-normal.woff2')}) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
html,body{margin:0;width:1920px;height:1080px;background:transparent}
div{position:absolute;left:0;right:0;top:${top}px;text-align:center;font:700 80px/1.3 Cairo;color:#fff;
text-shadow:0 3px 10px rgba(0,0,0,.65),0 1px 2px rgba(0,0,0,.8)}
</style></head><body><div>${text}</div></body></html>`;

(async () => {
  fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const [i, top] of [[0, 400], [1, 530]]) {
    await page.setContent(html(lines[i], top));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(dir, 'build', `line${i + 1}.png`), omitBackground: true });
  }
  await browser.close();
})();
