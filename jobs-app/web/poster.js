// Poster maker: draws a shareable image (1080 x 1350, Instagram/WhatsApp friendly)
// with the page name or one job, a QR code and the short link.
(function () {
  const W = 1080, H = 1350;
  const GREEN = '#0b6b4f', DARK = '#06392a', CREAM = '#fbf7ee', INK = '#14201b';

  function loadImage(src) {
    return new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
  }
  function wrap(ctx, text, x, y, maxW, lineH, maxLines) {
    const words = String(text).split(/\s+/); let line = ''; let n = 0;
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        n++;
        if (n === maxLines) { ctx.fillText(line + '…', x, y); return y + lineH; }
        ctx.fillText(line, x, y); line = words[i]; y += lineH;
      } else line = test;
    }
    if (line) { ctx.fillText(line, x, y); y += lineH; }
    return y;
  }
  function fit(ctx, text, maxW, size, weight) {
    let s = size;
    do { ctx.font = `${weight} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; s -= 4; }
    while (ctx.measureText(text).width > maxW && s > 30);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  async function drawQR(ctx, link, x, y, size) {
    ctx.fillStyle = '#fff'; roundRect(ctx, x - 24, y - 24, size + 48, size + 48, 28); ctx.fill();
    const img = await loadImage('/api/qr.svg?u=' + encodeURIComponent(link));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x, y, size, size);
  }

  function base(ctx) {
    ctx.fillStyle = CREAM; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = GREEN; ctx.fillRect(0, 0, W, 430);
    ctx.fillStyle = DARK; ctx.fillRect(0, 430, W, 10);
    ctx.textBaseline = 'alphabetic';
  }
  function footer(ctx, link) {
    ctx.fillStyle = INK; ctx.textAlign = 'center';
    ctx.font = '600 40px system-ui, sans-serif';
    ctx.fillText('Scan the code or type:', W / 2, 1215);
    fit(ctx, link.replace(/^https?:\/\//, ''), W - 120, 52, 800);
    ctx.fillStyle = GREEN;
    ctx.fillText(link.replace(/^https?:\/\//, ''), W / 2, 1285);
    ctx.textAlign = 'left';
  }

  // Page poster: name, roles, QR, link.
  async function page(canvas, board, link) {
    const ctx = canvas.getContext('2d'); base(ctx);
    ctx.fillStyle = '#fff'; ctx.font = '600 44px system-ui, sans-serif';
    ctx.fillText('JOBS', 80, 120);
    fit(ctx, board.name, W - 160, 96, 800);
    wrap(ctx, board.name, 80, 230, W - 160, 100, 2);
    ctx.font = '500 42px system-ui, sans-serif'; ctx.fillStyle = '#d8efe6';
    ctx.fillText(board.town ? 'Jobs in and around ' + board.town : 'Apply on your phone, free', 80, 390);

    // role chips
    ctx.font = '600 38px system-ui, sans-serif';
    let x = 80, y = 500;
    for (const r of board.roles.slice(0, 8)) {
      const w = ctx.measureText(r).width + 48;
      if (x + w > W - 80) { x = 80; y += 76; }
      if (y > 650) break;
      ctx.fillStyle = '#e5f2ed'; roundRect(ctx, x, y, w, 60, 30); ctx.fill();
      ctx.fillStyle = DARK; ctx.fillText(r, x + 24, y + 43);
      x += w + 14;
    }
    await drawQR(ctx, link, (W - 380) / 2, 760, 380);
    footer(ctx, link);
  }

  // Job poster: "Pharmacist · Karimnagar · ₹18,000", firm, QR, link.
  async function job(canvas, j, link, boardName) {
    const ctx = canvas.getContext('2d'); base(ctx);
    ctx.fillStyle = '#fff'; ctx.font = '600 40px system-ui, sans-serif';
    ctx.fillText('JOB OPEN · ' + (boardName || '').toUpperCase().slice(0, 30), 80, 110);
    fit(ctx, j.role, W - 160, 110, 800);
    ctx.fillText(j.role, 80, 245);
    ctx.font = '600 52px system-ui, sans-serif'; ctx.fillStyle = '#d8efe6';
    const bits = [j.town, j.salary ? '₹' + Number(j.salary).toLocaleString('en-IN') + ' / month' : ''].filter(Boolean).join(' · ');
    ctx.fillText(bits, 80, 350);

    ctx.fillStyle = INK; ctx.font = '700 46px system-ui, sans-serif';
    if (j.firm) {
      ctx.fillText(j.firm.name, 80, 525);
      ctx.font = '500 36px system-ui, sans-serif'; ctx.fillStyle = '#5d6b65';
      ctx.fillText([j.firm.type, j.firm.town].filter(Boolean).join(' · '), 80, 580);
    }
    if (j.details) {
      ctx.font = '400 34px system-ui, sans-serif'; ctx.fillStyle = INK;
      wrap(ctx, j.details, 80, 650, W - 160, 46, 2);
    }
    await drawQR(ctx, link, (W - 340) / 2, 790, 340);
    footer(ctx, link);
  }

  window.Poster = { page, job };
})();
