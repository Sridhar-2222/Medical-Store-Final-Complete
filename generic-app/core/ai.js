/*
 * Optional AI bill reader (Google Gemini REST API, no SDK needed).
 * Works from the Node server (key in GOOGLE_API_KEY) or straight from the
 * browser in standalone mode (key saved on that device only).
 * Returns purchase lines: [{name, qty, cost, price, batch, expiry, taxRate}]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BizAI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function buildPrompt(presetName, itemLabel) {
    return 'You are reading a supplier purchase bill / invoice for a "' + presetName + '" business. ' +
      'Extract every ' + (itemLabel || 'item') + ' line. Return ONLY a JSON array, no prose, like: ' +
      '[{"name":"Item name with size/strength","qty":10,"free":0,"cost":12.5,"price":15,"batch":"B123","expiry":"2026-12-31","taxRate":12,"barcode":""}] ' +
      'where cost = purchase rate per unit before tax, price = MRP / selling price per unit if printed, ' +
      'expiry in YYYY-MM-DD (use last day of month if only month/year). Use "" or 0 for unknown values. ' +
      'If the image is not a bill, return [].';
  }

  function parseResponse(text) {
    if (!text) return [];
    var t = String(text).replace(/```json|```/gi, '').trim();
    var s = t.indexOf('['), e = t.lastIndexOf(']');
    if (s < 0 || e < s) return [];
    var arr;
    try { arr = JSON.parse(t.slice(s, e + 1)); } catch (err) { return []; }
    if (!Array.isArray(arr)) return [];
    return arr.map(function (x) {
      x = x || {};
      var exp = String(x.expiry || '').trim();
      var m = exp.match(/^(\d{4})-(\d{2})$/);
      if (m) { var last = new Date(+m[1], +m[2], 0).getDate(); exp = m[1] + '-' + m[2] + '-' + (last < 10 ? '0' : '') + last; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) exp = '';
      return {
        name: String(x.name || '').trim(), qty: Number(x.qty) || 0, free: Number(x.free) || 0,
        cost: Number(x.cost) || 0, price: Number(x.price || x.mrp) || 0, batch: String(x.batch || '').trim(),
        expiry: exp, taxRate: Number(x.taxRate) || 0, barcode: String(x.barcode || '').trim()
      };
    }).filter(function (x) { return x.name && x.qty > 0; });
  }

  // fetchFn: global fetch (browser / Node 18+)
  function readBill(fetchFn, opts) {
    var model = opts.model || 'gemini-2.5-flash';
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    var body = { contents: [{ parts: [
      { text: buildPrompt(opts.presetName || 'retail', opts.itemLabel) },
      { inline_data: { mime_type: opts.mimeType || 'image/jpeg', data: opts.base64 } }
    ] }], generationConfig: { temperature: 0 } };
    return fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.j && res.j.error && res.j.error.message) || 'AI request failed');
        var parts = (((res.j.candidates || [])[0] || {}).content || {}).parts || [];
        return parseResponse(parts.map(function (p) { return p.text || ''; }).join(''));
      });
  }

  return { buildPrompt: buildPrompt, parseResponse: parseResponse, readBill: readBill };
});
