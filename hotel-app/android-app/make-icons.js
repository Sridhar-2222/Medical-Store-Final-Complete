// Renders Fingertip Hotel launcher icons and splash screens into the Android project (uses Playwright).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const res = path.join(__dirname, 'android/app/src/main/res');
const BLUE = '#0f766e'; // Fingertip Hotel teal
const glyph = (s) => `<g transform="${s}"><g fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"><path d="M12 31a20 20 0 0 1 40 0"/><path d="M16 44V34a16 16 0 0 1 32 0v10"/><path d="M22 48V34a10 10 0 0 1 20 0v8"/><path d="M28 51V35a4 4 0 0 1 8 0v14"/></g></g>`;
const svgs = {
  legacy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${BLUE}"/>${glyph('')}</svg>`,
  round: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${BLUE}"/>${glyph('translate(1 0)')}</svg>`,
  // adaptive foreground: glyph inside the central 66/108 safe zone, transparent background
  fg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${glyph('translate(25 22) scale(0.9)')}</svg>`
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  async function render(svg, w, h, bg, file, logo) {
    await p.setViewportSize({ width: w, height: h });
    const inner = logo ? `<div style="width:${logo}px;height:${logo}px">${svgs.legacy.replace('<svg ', '<svg width="100%" height="100%" ')}</div>` : svg.replace('<svg ', '<svg width="100%" height="100%" ');
    await p.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;display:grid;place-items:center;background:${bg}">${inner}</body></html>`);
    await p.screenshot({ path: file, omitBackground: bg === 'transparent' });
  }
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const dir = path.join(res, 'mipmap-' + d);
    await render(svgs.legacy, 48 * k, 48 * k, 'transparent', path.join(dir, 'ic_launcher.png'));
    await render(svgs.round, 48 * k, 48 * k, 'transparent', path.join(dir, 'ic_launcher_round.png'));
    await render(svgs.fg, 108 * k, 108 * k, 'transparent', path.join(dir, 'ic_launcher_foreground.png'));
  }
  for (const f of fs.readdirSync(res)) {
    const sp = path.join(res, f, 'splash.png');
    if (!fs.existsSync(sp)) continue;
    const buf = fs.readFileSync(sp);
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    await render('', w, h, '#f3f5f9', sp, Math.round(Math.min(w, h) * 0.22));
  }
  await b.close();
  fs.writeFileSync(path.join(res, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BLUE}</color>\n</resources>\n`);
  console.log('icons and splash written');
})();
