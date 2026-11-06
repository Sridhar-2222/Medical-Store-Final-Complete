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

  // ---- Review mode: read any receipt (purchase bill, expense voucher, wastage sheet) ----
  function receiptPrompt(o) {
    return 'You are reading a receipt for a "' + (o.presetName || 'small business') + '"' + (o.department ? ', department "' + o.department + '"' : '') + '. ' +
      'Typical bills here: ' + (o.hints || 'purchases and expenses') + '. ' +
      'Return ONLY one JSON object, no prose: {"vendor":"","billNo":"","date":"YYYY-MM-DD","total":0,"tax":0,' +
      '"type":"purchase|expense|wastage|misc|supply|stock","category":"","costType":"fixed|variable",' +
      '"items":[{"name":"","qty":0,"unit":"","rate":0,"amount":0}],"notes":[""]}. ' +
      (o.expectType === 'supply' ? 'This is a stock issue / supply slip (goods given out from the store): type "supply", list each item and quantity issued. ' : '') +
      (o.expectType === 'stock' ? 'This is a stock count sheet (goods physically in hand): type "stock", list each item and the quantity counted. ' : '') +
      'Rules: rate = price per unit; amount = line total; total = final amount payable. ' +
      'Pick category from this list when it fits: ' + (o.categories || []).join(', ') + '. ' +
      'costType is "fixed" for rent, salary, EMI, licence, internet, insurance; otherwise "variable". ' +
      'In notes, mention anything a reviewer should check: overwritten or handwritten amounts, missing date or bill number, ' +
      'items marked damaged / returned / expired / wastage, totals that do not add up, unusually high rates. Use "" or 0 when unknown.';
  }
  function parseReceipt(text) {
    if (!text) return null;
    var t = String(text).replace(/```json|```/gi, '').trim();
    var s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s < 0 || e < s) return null;
    var o;
    try { o = JSON.parse(t.slice(s, e + 1)); } catch (err) { return null; }
    var date = /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') ? o.date : '';
    return {
      vendor: String(o.vendor || '').trim(), billNo: String(o.billNo || '').trim(), date: date,
      total: Number(o.total) || 0, tax: Number(o.tax) || 0,
      type: ['purchase', 'expense', 'wastage', 'misc', 'supply', 'stock'].indexOf(o.type) >= 0 ? o.type : 'purchase',
      category: String(o.category || '').trim(), costType: o.costType === 'fixed' ? 'fixed' : 'variable',
      items: (Array.isArray(o.items) ? o.items : []).map(function (x) {
        x = x || {};
        return { name: String(x.name || '').trim(), qty: Number(x.qty) || 0, unit: String(x.unit || '').trim(), rate: Number(x.rate) || 0, amount: Number(x.amount) || 0 };
      }).filter(function (x) { return x.name; }),
      notes: (Array.isArray(o.notes) ? o.notes : []).map(String).filter(function (n) { return n.trim(); })
    };
  }
  function readSalesReport(fetchFn, opts) {
    var model = opts.model || 'gemini-2.5-flash';
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    var prompt = 'This is a day-end sales report printed by the billing machine of a "' + (opts.presetName || 'business') + '". Return ONLY JSON: ' +
      '{"date":"YYYY-MM-DD","sale":0,"cash":0,"upi":0,"card":0,"other":0,"walkins":0} where sale = net sales for the day, cash/upi/card/other = money received by each mode, ' +
      'walkins = number of bills, covers, guests or customers. Use 0 when not printed.';
    var body = { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: opts.mimeType || 'image/jpeg', data: opts.base64 } }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } };
    return fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.j && res.j.error && res.j.error.message) || 'AI request failed');
        var t = ((((res.j.candidates || [])[0] || {}).content || {}).parts || []).map(function (p) { return p.text || ''; }).join('').replace(/```json|```/g, '');
        var o; try { o = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch (e) { throw new Error('The AI could not read this report'); }
        var n = function (v) { return Number(v) || 0; };
        return { date: /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') ? o.date : '', sale: n(o.sale), cash: n(o.cash), upi: n(o.upi), card: n(o.card), other: n(o.other), walkins: Math.round(n(o.walkins)) };
      });
  }
  function readReceipt(fetchFn, opts) {
    var model = opts.model || 'gemini-2.5-flash';
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    var body = { contents: [{ parts: [{ text: receiptPrompt(opts) }, { inline_data: { mime_type: opts.mimeType || 'image/jpeg', data: opts.base64 } }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' } };
    return fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.j && res.j.error && res.j.error.message) || 'AI request failed');
        var parts = (((res.j.candidates || [])[0] || {}).content || {}).parts || [];
        var out = parseReceipt(parts.map(function (p) { return p.text || ''; }).join(''));
        if (!out) throw new Error('The AI could not read this receipt');
        return out;
      });
  }

  // ---- Provider-neutral calls: Google Gemini or OpenAI (owner chooses in Business setup) ----
  // opts: { provider: 'gemini'|'openai', apiKey, model, base64?, mimeType? }
  function callAI(fetchFn, opts, prompt, wantJson) {
    if (!opts.apiKey) return Promise.reject(new Error('Add an AI key in Business setup → AI'));
    if (opts.provider === 'openai') {
      var content = [{ type: 'text', text: prompt }];
      if (opts.base64) content.push({ type: 'image_url', image_url: { url: 'data:' + (opts.mimeType || 'image/jpeg') + ';base64,' + opts.base64 } });
      var body = { model: opts.model || 'gpt-4o-mini', temperature: 0, messages: [{ role: 'user', content: content }] };
      if (wantJson) body.response_format = { type: 'json_object' };
      return fetchFn('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + opts.apiKey }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || 'OpenAI request failed'); return ((j.choices || [])[0] || {}).message ? j.choices[0].message.content || '' : ''; }); });
    }
    var parts = [{ text: prompt }];
    if (opts.base64) parts.push({ inline_data: { mime_type: opts.mimeType || 'image/jpeg', data: opts.base64 } });
    var gbody = { contents: [{ parts: parts }], generationConfig: wantJson ? { temperature: 0, responseMimeType: 'application/json' } : { temperature: 0.3 } };
    return fetchFn('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(opts.model || 'gemini-2.5-flash') + ':generateContent',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey }, body: JSON.stringify(gbody) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || 'Gemini request failed'); return ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(function (p) { return p.text || ''; }).join(''); }); });
  }
  function readBillAny(fetchFn, opts) {
    return callAI(fetchFn, opts, receiptPrompt(opts), true).then(function (t) { var o = parseReceipt(t); if (!o) throw new Error('The AI could not read this bill'); return o; });
  }
  function readReportAny(fetchFn, opts) {
    var prompt = 'This is a day-end sales report printed by the billing machine of a "' + (opts.presetName || 'business') + '". Return ONLY JSON: ' +
      '{"date":"YYYY-MM-DD","sale":0,"cash":0,"upi":0,"card":0,"other":0,"walkins":0}. sale = net sales; cash/upi/card/other = money received by each mode; walkins = number of bills, covers or customers. 0 when not printed.';
    return callAI(fetchFn, opts, prompt, true).then(function (t) {
      var o; try { o = JSON.parse(String(t).replace(/```json|```/g, '').slice(String(t).indexOf('{'))); } catch (e) { throw new Error('The AI could not read this report'); }
      var n = function (v) { return Number(v) || 0; };
      return { date: /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') ? o.date : '', sale: n(o.sale), cash: n(o.cash), upi: n(o.upi), card: n(o.card), other: n(o.other), walkins: Math.round(n(o.walkins)) };
    });
  }
  // Ask a question about the business; facts = plain-text summary of the numbers
  function askBusiness(fetchFn, opts, facts, question) {
    var prompt = 'You advise the owner of a small ' + (opts.presetName || 'business') + ' in India. Use only these figures:\n' + facts +
      '\n\nQuestion: ' + question + '\nAnswer in simple language, at most 8 short bullet points, with concrete actions. Do not invent numbers.';
    return callAI(fetchFn, opts, prompt, false);
  }

  return { callAI: callAI, readBillAny: readBillAny, readReportAny: readReportAny, askBusiness: askBusiness, buildPrompt: buildPrompt, parseResponse: parseResponse, readBill: readBill, receiptPrompt: receiptPrompt, parseReceipt: parseReceipt, readReceipt: readReceipt, readSalesReport: readSalesReport };
});
