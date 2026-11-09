#!/usr/bin/env node
// Writes docs/BUSINESS-GUIDE.md from core/industries.js so the guide always matches the app.
'use strict';
const fs = require('fs');
const path = require('path');
const I = require('../core/industries');
const out = ['# BizCore Review: guide for every business type', '',
  'BizCore is a review platform. The owner (or their staff) enters purchase bills, expenses, revenue, walk-ins,',
  'miscellaneous costs and stock movements, by typing, by photographing bills and printouts, or by importing from',
  'their billing software. BizCore turns that into analysis for any day range, flags what needs checking, and gives',
  'every customer a vault through which the owner stays in touch.', '',
  'It is not billing software. Billing and stock screens exist only for a client who asks for them (Settings → Screens).', '',
  '## What every business enters', '',
  '| Input | How |', '|---|---|',
  '| Sales / revenue | Daily numbers screen, photo of the day-end report printout, or import from billing software |',
  '| Collections (cash, UPI, card, other) | Daily numbers, day-end report photo, import |',
  '| Walk-ins (customers, guests, patients) | Daily numbers for morning and evening, day-end report photo, import |',
  '| Purchase bills | Photo (read on the phone, or by AI) with item lines; or typed |',
  '| Expenses (fixed or variable) and miscellaneous | Photo of vouchers, Daily numbers, import |',
  '| Goods received, supplies issued, stock counts, wastage | Photo of challans, issue slips, count sheets; or typed |', '',
  '## What every owner gets', '',
  '- Any day to any day: sales, collections, expenses, purchases, profit, walk-ins, average spend per customer',
  '- Day-on-day change in sales, morning vs evening, department by department',
  '- Spot checks on random days or chosen days, compared with the whole period',
  '- Collections short of sales, price rises against earlier bills, short deliveries, wastage, unusual spending',
  '- Purchased vs supplied vs stock in hand, with missing stock in quantity and money',
  '- Stock used against sales, day by day',
  '- Key ratios for the business type with healthy ranges (below)',
  '- Customer vault: records, bills, reminders and WhatsApp messages for every customer; a private link per customer when the shop runs a server', ''];
for (const { key } of I.list()) {
  const p = I.get(key), r = p.review, pb = r.playbook;
  out.push('## ' + p.icon + ' ' + p.name, '');
  out.push('**Departments:** ' + r.departments.join(', '), '');
  out.push('**Photograph:** ' + pb.photos.join('; '), '');
  out.push('**Enter:** ' + pb.inputs.join('; '), '');
  out.push('**Owner learns:**', ...pb.owner.map((x) => '- ' + x), '');
  out.push('**Customers get:**', ...pb.customers.map((x) => '- ' + x), '');
  out.push('**Customer vault keeps:** ' + r.vault.records.map((x) => x.label + (x.dueLabel ? ' (reminder: ' + x.dueLabel.toLowerCase() + ')' : '')).join(', '), '');
  out.push('**Ready messages:** ' + r.vault.templates.map((t) => t.label).join(', '), '');
  out.push('| Key number | Healthy range | Why it matters |', '|---|---|---|', ...r.kpis.map((k) => '| ' + k.label + ' | ' + k.lo + '–' + k.hi + '% | ' + k.why + ' |'), '');
}
fs.writeFileSync(path.join(__dirname, '../docs/BUSINESS-GUIDE.md'), out.join('\n'));
console.log('Wrote docs/BUSINESS-GUIDE.md (' + I.list().length + ' business types)');
