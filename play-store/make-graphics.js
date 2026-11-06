// Makes the Google Play graphics from the real app: node play-store/make-graphics.js
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { serve } = require('../review-app/test/serve');
const out = path.join(__dirname, 'graphics');
(async () => {
  const st = await serve(path.join(__dirname, '../review-app/build/www'));
  const url = 'http://127.0.0.1:' + st.address().port + '/';
  const b = await chromium.launch();
  const BLUE = '#1f4fd8';
  const mark = '<svg viewBox="0 0 64 64" width="100%" height="100%"><rect width="64" height="64" rx="14" fill="' + BLUE + '"/><path d="M20 16h16a10 10 0 0 1 2 19.8A10 10 0 0 1 36 52H20z" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/><path d="M20 34h17" stroke="#fff" stroke-width="6"/></svg>';
  // 512 x 512 icon (Play adds the rounded mask itself, so the square is full-bleed)
  let p = await b.newPage({ viewport: { width: 512, height: 512 } });
  await p.setContent('<body style="margin:0;background:' + BLUE + '">' + mark.replace('rx="14"', 'rx="0"') + '</body>');
  await p.screenshot({ path: path.join(out, 'icon-512.png') }); await p.close();
  // 1024 x 500 feature graphic
  p = await b.newPage({ viewport: { width: 1024, height: 500 } });
  await p.setContent('<body style="margin:0;width:1024px;height:500px;background:linear-gradient(120deg,#1f4fd8,#163aa6);color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;gap:48px;padding:0 70px;box-sizing:border-box">' +
    '<div style="width:170px;height:170px;flex:none;border-radius:36px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.25)">' + mark + '</div>' +
    '<div><div style="font-size:72px;font-weight:800;letter-spacing:-1px">BizCore</div><div style="font-size:30px;opacity:.95;margin-top:6px">Sales, spending &amp; profit for your business</div>' +
    '<div style="font-size:22px;opacity:.8;margin-top:18px">Photo of every bill · Profit every day · Customer vault</div></div></body>');
  await p.screenshot({ path: path.join(out, 'feature-1024x500.png') }); await p.close();
  // phone screenshots, 1080 x 1920
  const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 });
  p = await ctx.newPage();
  await p.goto(url); await p.click('[data-k="restaurant"]'); await p.fill('#su-name', 'Saffron Restaurant'); await p.click('#su-go');
  await p.waitForSelector('.hdr'); await p.waitForTimeout(2600);
  const shots = [['home', '1-main-headers'], ['accounts', '2-accounts'], ['pl', '3-profit-loss'], ['purchase-add', '4-purchase-bill-photo'], ['reports', '5-reports'], ['alerts', '6-alerts'], ['store', '7-store']];
  for (const [r, name] of shots) {
    if (r !== 'home') { await p.goto(url + '#' + r); await p.waitForTimeout(500); }
    await p.screenshot({ path: path.join(out, 'phone-' + name + '.png') });
  }
  const cid = await p.evaluate(() => App.api.list('customers').rows[0].id);
  await p.evaluate((id) => App.go('vault', { id }), cid); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(out, 'phone-8-customer-vault.png') });
  await b.close(); st.close();
  console.log('graphics written to play-store/graphics');
})().catch((e) => { console.error(e); process.exit(1); });
