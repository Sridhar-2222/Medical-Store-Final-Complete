# BizCore Review

A phone app that gives a business owner a clear **accounting view** of the business, plus a
**Customer Vault** to stay in touch with customers. Rebuilt from scratch; it replaces `generic-app/`.

## 1. The owner's accounting view
**Enter (per department, morning or evening):**
- **Sales**: from the billing computer's day-end report (photo), handwritten bills, or typed
- **Collections**: cash, UPI, card, other
- **Walk-ins**: number of customers / guests / patients
- **Spending**: every purchase bill (photo) + every expense (salary, gas, rent, repairs…) + miscellaneous
- **Cash in hand** counted at close, and cash deposited / taken out
- **Stock**: goods received, stock issued to departments, stock counts, wastage

Photos of bills, vouchers, issue slips, stock sheets and day-end reports are **read on the phone,
with no internet**. An optional Google Gemini key reads handwritten or messy bills better.

**See (any day to any day; by day, week or month; random days; mornings vs evenings):**
- Sales vs spending, sales − spending, collected vs sold, walk-ins and spend per customer
- Marks on: sales drops and unusual highs, high-spending days, days spending beat sales,
  spending rising against sales, cash short or over, collections short, price rises against earlier
  bills, short deliveries, wastage, missing stock, low spend per customer
- Key ratios with healthy ranges for the business type (food cost, expiry loss, OTA commission…)

## 2. Customer Vault
Every customer has a vault titled with the business's own name ("Sai Ram Hotel", "ABC Furniture
Shop"): their records (prescriptions, warranties, service dates, stays, memberships, occasions…),
reminders and every message. The owner sees who is due and sends a ready WhatsApp message in one
tap. Connected to an office system, each customer also gets a private vault web page.

## Phone only, or with the office system
- **Phone only** (default): everything stays on the phone. Backup to Drive / WhatsApp from More.
- **Office system** (optional): run `node server/server.js` on a computer (Node 18+, no installs),
  set `APP_PIN`. On the phone: More → Office system → enter its address and PIN. Every entry is sent
  there; other phones see the same numbers; entries made offline wait and go later.
- Billing software can send numbers to `POST /api/entries` (JSON rows: date, department, type,
  amount, method, half), or export a CSV and use Add → Import.

## 14 business types
General, Pharmacy (chemist), Grocery, Restaurant / Café, Hotel, Salon / Spa, Clinic, Clothing,
Electronics, Hardware, Bakery, Auto service, Gym, Home / professional services. Each has its own
departments, key ratios, guide and vault records. More → Guide shows them.

## Build and test
```bash
node scripts/build.js        # build/www (app), build/bizcore-review.html (single file)
npm test                     # core + office server
node test/ui-smoke.js        # every screen at phone size
node test/phone-e2e.js       # daily numbers, bill photo + day-end report read on device, reports, vault, stock
node test/sync-e2e.js        # two phones + office system, offline queue, vault page
```
The Android app is built from `build/www` by `generic-app/android-app` (`npm run apk` there).

## Files
```
core/industries.js  business types: departments, cost categories, key ratios, guide, vault
core/review.js      the review logic: entries, insights, flags, stock, vault, import
core/base.js        storage, settings, customers, backup, offline-change replay
core/ocr-parse.js   turns photo text into bill lines / day-end figures
core/ai.js          optional Gemini reading
web/                the app (ui.js shell, screens-add.js, screens-review.js, app.css)
server/             optional office system
```
