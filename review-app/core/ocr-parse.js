/*
 * Turns raw text read from a bill photo (on-device OCR) into a structured
 * receipt: vendor, bill number, date, item lines (qty, unit, rate, amount) and
 * total. Bills are messy, so this is best-effort: the reviewer always checks
 * and corrects the result before it is saved.
 * UMD module, no dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BizOCRParse = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var UNITS = 'kg|kgs|g|gm|gms|grm|ltr|ltrs|l|lt|ml|pcs|pc|nos|no|dozen|doz|dz|box|boxes|pkt|pkts|packet|bag|bags|bottle|btl|strip|strips|tin|can|bunch|tray|crate|mtr|m|ft|set|unit|units|plate|pair';
  var SKIP = /\b(sub\s*total|grand\s*total|total|net\s*amount|amount\s*payable|round(ed)?\s*off|cgst|sgst|igst|gst|vat|tax|discount|balance|cash|change|tendered|paid|upi|card|phone|ph\.?|mob(ile)?|gstin|fssai|dl\s*no|invoice|bill\s*no|date|time|thank|visit|address|tel|email|www\.)\b/i;
  var TOTAL = /\b(grand\s*total|net\s*(amount|payable|total)|amount\s*payable|bill\s*amount|total\s*amount|total)\b/i;

  // OCR often reads 0 as O, 1 as l or I and 5 as S inside numbers.
  function fixDigits(s) {
    return s.replace(/(?<=\d)[oO](?=\d|\b)/g, '0').replace(/(?<=\d)[lI|](?=\d)/g, '1').replace(/(?<=\d)[sS](?=\d)/g, '5');
  }
  function numbersIn(s) {
    var out = [];
    var re = /(?:^|[^\w.])(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,3})?)(?![\w])/g, m;
    while ((m = re.exec(s))) out.push({ v: parseFloat(m[1].replace(/,/g, '')), i: m.index + m[0].indexOf(m[1]), raw: m[1] });
    return out;
  }
  function close(a, b) { return Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.03); }

  function parseDate(text) {
    var m = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
    if (m) {
      var d = +m[1], mo = +m[2], y = +m[3];
      if (y < 100) y += 2000;
      if (mo > 12 && d <= 12) { var t = d; d = mo; mo = t; }
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
    }
    m = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (m) return m[0];
    var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    m = text.match(/\b(\d{1,2})[\s\-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-,]*(\d{2,4})\b/i);
    if (m) { var yy = +m[3]; if (yy < 100) yy += 2000; var mm = months.indexOf(m[2].toLowerCase()) + 1; return yy + '-' + (mm < 10 ? '0' : '') + mm + '-' + (+m[1] < 10 ? '0' : '') + (+m[1]); }
    return '';
  }

  function parseLine(line) {
    var clean = fixDigits(line).replace(/[₹$€£]|\brs\.?|\binr\b/gi, ' ').replace(/\s+/g, ' ').trim();
    clean = clean.replace(/^(?:s\.?\s*no\.?\s*)?\d{1,3}\s*[.)\-:]?\s+(?=[A-Za-z])/i, ''); // leading serial number
    var nums = numbersIn(clean);
    if (nums.length < 2) return null;
    var firstNum = nums[0].i;
    var name = clean.slice(0, firstNum).replace(/^[\d.\s)\-:]+/, '').replace(/[\-:|]+$/, '').trim();
    if (!/[a-z]{2,}/i.test(name)) return null;
    var unitM = clean.slice(firstNum).match(new RegExp('\\b(' + UNITS + ')\\b', 'i')) || name.match(new RegExp('\\b(' + UNITS + ')\\s*$', 'i'));
    var unit = unitM ? unitM[1].toLowerCase() : '';
    if (unitM && name.match(new RegExp('\\b(' + UNITS + ')\\s*$', 'i'))) name = name.replace(new RegExp('\\s*\\b(' + UNITS + ')\\s*$', 'i'), '');
    var v = nums.map(function (n) { return n.v; });
    var amount = v[v.length - 1], qty = 0, rate = 0;
    // try qty × rate = amount using any two earlier numbers (handles extra columns like MRP or tax %)
    for (var a = v.length - 2; a >= 0 && !qty; a--) {
      for (var b = a - 1; b >= 0; b--) {
        if (close(v[b] * v[a], amount)) { qty = v[b]; rate = v[a]; break; }
      }
    }
    if (!qty) {
      if (v.length >= 3) { qty = v[0]; rate = v[v.length - 2]; }
      else { qty = v[0]; rate = qty ? amount / qty : 0; }
    }
    if (amount <= 0 || qty <= 0 || qty > 100000) return null;
    return { name: name, qty: Math.round(qty * 1000) / 1000, unit: unit, rate: Math.round(rate * 100) / 100, amount: Math.round(amount * 100) / 100 };
  }

  // Stock count sheets and issue slips often list just "Item  qty  unit".
  function parseQtyLine(line) {
    var clean = fixDigits(line).replace(/\s+/g, ' ').trim().replace(/^(?:s\.?\s*no\.?\s*)?\d{1,3}\s*[.)\-:]?\s+(?=[A-Za-z])/i, '');
    var m = clean.match(new RegExp('^([A-Za-z][A-Za-z0-9 &()\\/.,\'-]*?)[\\s:\\-]+(\\d+(?:\\.\\d+)?)\\s*(' + UNITS + ')?\\b(.*)$', 'i'));
    if (!m) return null;
    var name = m[1].trim(), qty = parseFloat(m[2]), unit = (m[3] || '').toLowerCase();
    if (!/[a-z]{2,}/i.test(name) || !(qty > 0)) return null;
    var rest = numbersIn(m[4] || '');
    var rate = rest.length ? rest[0].v : 0;
    return { name: name, qty: qty, unit: unit, rate: rate, amount: rate ? Math.round(rate * qty * 100) / 100 : 0 };
  }

  function parse(text, opts) {
    var qtyMode = opts && opts.mode === 'qty';
    var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var vendor = '';
    for (var i = 0; i < Math.min(lines.length, 5); i++) {
      var l = lines[i];
      if (/[a-z]{3,}/i.test(l) && !/\b(tax\s*invoice|invoice|bill|cash\s*memo|receipt|gstin|phone|ph|mob)\b/i.test(l) && !/^\d/.test(l)) { vendor = l.replace(/[^\w&.,'\- ]/g, '').trim(); break; }
    }
    var billNo = '';
    var bm = text.match(/\b(?:bill|invoice|inv|receipt|memo)\s*(?:no|number|#)?\s*[:.\-#]?\s*([A-Z0-9][A-Z0-9\-\/]{1,20})/i);
    if (bm && /\d/.test(bm[1])) billNo = bm[1];
    var total = 0, totals = [];
    lines.forEach(function (l) {
      if (TOTAL.test(l) && !/sub\s*total/i.test(l)) {
        var n = numbersIn(fixDigits(l));
        if (n.length) totals.push({ v: n[n.length - 1].v, grand: /grand|net|payable/i.test(l) });
      }
    });
    if (totals.length) {
      var g = totals.filter(function (t) { return t.grand; });
      total = (g.length ? g : totals).reduce(function (a, t) { return Math.max(a, t.v); }, 0);
    }
    var items = [];
    lines.forEach(function (l) {
      if (SKIP.test(l) || /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/.test(l)) return;   // totals, tax, header lines with dates
      var it = qtyMode ? (parseQtyLine(l) || parseLine(l)) : parseLine(l);
      if (it) items.push(it);
    });
    var sum = items.reduce(function (a, it) { return a + it.amount; }, 0);
    var tax = 0;
    var tm = text.match(/\b(?:gst|tax|cgst\s*\+\s*sgst)\b[^\n\d]*([\d,]+\.?\d*)/i);
    if (tm) tax = parseFloat(tm[1].replace(/,/g, '')) || 0;
    var wastageWords = /\b(waste|wastage|spoil(ed|t)?|damaged|expired|rotten|return(ed)?|broken|leak(ed|ing)?)\b/i;
    var notes = [];
    if (wastageWords.test(text)) notes.push('Bill mentions damaged, expired, returned or spoiled goods.');
    return { vendor: vendor, billNo: billNo, date: parseDate(text), total: total || Math.round(sum * 100) / 100, tax: tax, items: items, notes: notes };
  }

  // Day-end sales report / Z-report printed by a billing machine.
  function parseSalesReport(text) {
    var lines = String(text || '').split(/\r?\n/).map(function (l) { return fixDigits(l.trim()); }).filter(Boolean);
    var out = { date: parseDate(text), sale: 0, cash: 0, upi: 0, card: 0, other: 0, walkins: 0 };
    function last(l) { var n = numbersIn(l.replace(/[₹]|\brs\.?/gi, ' ')); return n.length ? n[n.length - 1].v : 0; }
    lines.forEach(function (l) {
      var low = l.toLowerCase();
      if (/(no\.?\s*of|number of|total)\s*(bills|invoices|guests|covers|customers|pax|transactions)|bill\s*count|\bcovers\b|footfall|\bpax\b|\bguests\b/.test(low)) { var w = last(l); if (w && w < 100000) out.walkins = Math.max(out.walkins, Math.round(w)); return; }
      if (/\b(net|grand|total|gross)\s*(sales|amount|revenue|collection)?\b/.test(low) && !/(tax|gst|discount|refund|void|cancel)/.test(low)) { var v = last(l); if (/net/.test(low) || v > out.sale) out.sale = /net/.test(low) ? v : Math.max(out.sale, v); return; }
      if (/\bcash\b/.test(low) && !/cashier/.test(low)) { out.cash = Math.max(out.cash, last(l)); return; }
      if (/\b(upi|gpay|google\s*pay|phonepe|paytm|bhim|qr)\b/.test(low)) { out.upi += last(l); return; }
      if (/\b(card|credit\s*card|debit|visa|master|pos\s*machine|swipe)\b/.test(low)) { out.card += last(l); return; }
      if (/\b(wallet|online|zomato|swiggy|aggregator|cheque|bank)\b/.test(low)) { out.other += last(l); }
    });
    return out;
  }

  return { parse: parse, parseSalesReport: parseSalesReport, parseLine: parseLine, parseQtyLine: parseQtyLine, parseDate: parseDate };
});
