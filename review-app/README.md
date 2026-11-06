# Fingertrip.biz AI (BizCore 3.x)

Android app id `biz.fingertrip.ai`. Play Store kit: `../play-store/`.

**Main page → Header → Feature → Entry.** Six main headers, joined by the fingertip line:

| Header | Features |
|---|---|
| **Accounts** | 📷 Upload a bill (choose where it belongs) · Sales (per department A/B/C, morning/evening, day-end report photo) · Purchases (bill photo) · Salaries · Staff advances · Fixed costs (spread per day) · Maintenance · Variable expenses · Sudden / miscellaneous (reason required) · Daily summary · Cash in hand · Profit & Loss |
| **Customers** | Customer list → Customer vault (records, photos, files, discount, offers, messages) · Bulk reminder (discount offer, video or own message to many customers, one WhatsApp at a time) · Reminders due (no red marks) · Customer discount · Special discount · Messages · Customer video |
| **Store** | Store categories → purchase bills (photo or file, no item-level stock), this week vs 4-week average |
| **Reports** | Daily summary (share on WhatsApp) · Profit & Loss · Alerts · Sales report · Spending report · Spot check · Ask AI (OpenAI or Gemini) |
| **Staff** | Attendance (present automatically from bills each person writes; owner marks P / ½ / A / L) · Staff advances (given, recovered from salary or cash, balance per person) · Staff list with salary and ID / documents · salaries per month |
| **Work areas** (named per business, e.g. *Rooms & guests*) | Daily counts that fit the business (hotel: rooms available / sold, check-ins, guests; garments: pieces, alterations in / out; restaurant: diners, tables, takeaway, delivery…), key numbers worked out from them (occupancy, average room rate, pending alterations, average bill per diner…), register photo |
| **Master** (no login) | Features: show / hide / rename every header and feature · Work areas: change what is counted · Example lines · then Business details & vault title · Sales departments · Store categories · Usual fixed costs · Videos (YouTube, owner & customers) · AI · Office system · Backup · Guide |

📷 **Photo** and 📎 **File** sit inside every page where a bill or account is updated, and every feature list starts with an **Upload bill** button. Examples are kept to one short "e.g." line per feature. Photos are
read on the phone (offline): bills → supplier, bill no, date, total; day-end report → sales, cash,
UPI, card, bills; visiting card / ID → name, phone. With an OpenAI or Gemini key, AI reads them
when online. Photos are kept in the phone's file store, in backups, and on the office system.

**Profit & Loss:** Sales − Purchases = Gross profit; − variable − maintenance − sudden − fixed
share = Net profit. Fixed share = monthly fixed costs (entered bill for the month, else the usual
amount; salaries entered, else the staff list) ÷ days in the month × days in the period.

## Phone only, or with the office system
- **Phone only** (default): everything stays on the phone. Backup to Drive / WhatsApp from More.
- **Office system** (optional): run `node server/server.js` on a computer (Node 18+, no installs),
  set `APP_PIN`. On the phone: More → Office system → enter its address and PIN. Every entry is sent
  there; other phones see the same numbers; entries made offline wait and go later.
- Billing software can send numbers to `POST /api/entries` (JSON rows: date, department, type,
  amount, method, half), or export a CSV and use Add → Import.

## 14 business types (work areas for each: `core/workareas.js`)
General, Pharmacy (chemist), Grocery, Restaurant / Café, Hotel, Salon / Spa, Clinic, Clothing,
Electronics, Hardware, Bakery, Auto service, Gym, Home / professional services. Each has its own
departments, key ratios, guide and vault records. More → Guide shows them.

## Build and test
```bash
node scripts/build.js        # build/www (app), build/bizcore-review.html (single file)
npm test                     # core + office server
node test/ui-smoke.js        # every screen at phone size
node test/phone-e2e.js       # headers, sales from report photo, bill photo, expenses, salaries, P&L, vault photo, offer
node test/sync-e2e.js        # two phones + office system, offline queue, vault page
```
The Android app is built from `build/www` by `generic-app/android-app` (`npm run apk` there).

## Files
```
core/industries.js  business types: departments, cost categories, key ratios, guide, vault
core/review.js      entries, insights, flags, vault, import
core/accounts.js    sales departments, store categories, expense kinds, staff & salaries, P&L, alerts, offers
core/base.js        storage, settings, customers, backup, offline-change replay
core/ocr-parse.js   turns photo text into bill lines / day-end figures
core/ai.js          optional Gemini reading
web/                the app (ui.js shell, files.js photos & files, screens-accounts.js, screens-people.js, app.css)
server/             optional office system
```
