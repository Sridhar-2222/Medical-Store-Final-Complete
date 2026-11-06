# BizCore Review: project handover

Repository: `Sridhar-2222/Medical-Store-Final-Complete`, branch `claude/generic-multi-industry-app-llwtau`
(not merged into `main` yet). Date of this summary: 6 Nov 2026.

## 1. Objective

Give any small business owner (hotel, restaurant, pharmacy/chemist, grocery, salon, clinic, garage,
furniture shop, building-material trader…) a **review of their business on their phone**, not
billing or hotel software. Billing / order-taking software is out of scope unless a client asks.

Two parts:

**Part 1: the owner's accounting view.** The owner (or staff) enters, per department:
- **Sales**: from their billing computer (photo of the day-end report, CSV import, or the
  `/api/entries` link) or from handwritten bills (typed)
- **Collections** by cash / UPI / card / other, and **walk-ins** (number of customers)
- **Spending** = all purchases (photo of each invoice) + all expenses (salary, gas, rent…) + miscellaneous
- **Cash in hand** counted at close, and cash deposited / taken out
- **Stock**: purchases in, stock issued to departments, stock counts, wastage

The app then evaluates, for any day to any day (by day, week or month, random days, mornings vs
evenings, any departments): sales vs spending, sales − spending, collections vs sales, walk-ins and
spend per customer, cash expected vs counted, stock used vs sales, purchased vs issued vs in hand,
and **marks** sales drops/highs, high-spending days, spending above sales, cash short/over, price
rises vs earlier bills, short deliveries, wastage, missing stock, plus key ratios with healthy ranges
for each business type.

**Part 2: Customer Vault.** Each customer/patient/guest has a vault **titled with the business's
own name** ("X Hotel", "ABC Furniture Shop"). The owner saves their records (prescriptions,
warranties, service dates, stays, memberships, occasions…), gets reminders when something is due,
and sends ready WhatsApp messages; every message is kept. It is the owner's platform for continuous
communication with customers. With the office system, each customer gets a private vault web page.

Working modes: **phone only** (default, fully offline) or **connected to an office system**
(entries sync to a computer; offline entries wait and go later).

## 2. Current state (all done, tested, pushed)

**Latest: BizCore 3.0** (Android 3.0.0). Main page with 6 headers (Accounts, Customers, Store,
Reports, Staff, Business setup) joined by the fingertip line; header → feature → entry pages;
photo + file on every entry page; four expense kinds; P&L with fixed costs spread per day;
customer discount and special offers; YouTube videos for owner and customers; OpenAI or Gemini.
See review-app/README.md and PLAN-v3.md.


| Part | Where | State |
|---|---|---|
| **BizCore Review 2.0** (current app, rebuilt from scratch) | `review-app/` | Done |
| Android app 2.0.0 (built from review-app) | `generic-app/android-app/release/BizCore.apk` | Done, signed |
| Office system (optional server) | `review-app/server/server.js` | Done, not deployed anywhere |
| Earlier versions (billing app, first review attempt) | `generic-app/` | Superseded; kept for reference |
| Original medical-store WhatsApp bot | repo root (`whatsapp-bot.js` etc.) | Untouched |

APK direct download (open in Chrome on the phone):
https://github.com/Sridhar-2222/Medical-Store-Final-Complete/raw/claude/generic-multi-industry-app-llwtau/generic-app/android-app/release/BizCore.apk

Tests (all passing): `cd review-app && npm test` (core + server), `node test/ui-smoke.js`
(every screen at phone size), `node test/phone-e2e.js` (daily numbers, bill photo and day-end
report read on device, reports, vault, stock), `node test/sync-e2e.js` (two phones + office system).
Browser tests need Playwright; run `node scripts/build.js` first.

## 3. How the app is organised

Tabs: **Home** (today, last 7 days, needs attention, key numbers) · **Add** (Today's numbers,
Photo of a bill, Day-end report, Expense, Stock count, Stock issued, Wastage, Import, Everything
entered) · **Reports** · **Customers** (vault) · **More** (Stock, Departments, Guide, Office system,
Settings, Backup & data).

```
review-app/core/industries.js  14 business types: departments, cost categories (fixed/variable),
                               key ratios + healthy ranges, guide, vault records + message templates
review-app/core/review.js      entries, insights & marks, stock, vault, import (pure logic, shared)
review-app/core/base.js        storage, settings, customers, backup, offline-change replay
review-app/core/ocr-parse.js   photo text -> bill lines / day-end report figures
review-app/core/ai.js          optional Google Gemini reading
review-app/web/                app UI: ui.js (shell, sync), screens-add.js, screens-review.js, app.css
review-app/web/vendor/ocr/     Tesseract (offline photo reading, ~9 MB, bundled)
review-app/server/             office system (no npm packages; Node 18+)
review-app/scripts/build.js    -> build/www (app) and build/bizcore-review.html (single file)
generic-app/android-app/       Capacitor Android project; prepare-web.js builds from review-app
```

Key decisions:
- No npm dependencies in the app or server, to avoid install/connectivity problems.
- Data on the phone in browser storage (`bizreview-v2`); backups via the Android share sheet.
- Offline photo reading on the device (Tesseract); AI (Gemini) only if a key is entered.
- Every change is all-or-nothing; offline changes carry ids and are applied once on the server.
- Departments and example data use predictable ids so phone and office build identical data.
- OCR language file is shipped unzipped (Android packaging silently unzips `.gz`).

## 4. Business types (14)
General, Pharmacy (chemist), Grocery, Restaurant/Café, Hotel, Salon/Spa, Clinic, Clothing,
Electronics, Hardware/building material, Bakery, Auto service, Gym, Home/professional services.

## 5. Not done yet / open items
1. **Not yet run on a real phone or with real bills.** Only browser tests at phone size on the
   APK's own files. Expect OCR corrections on handwritten / crumpled bills (a test read "9081" as "9681").
2. **Office system not deployed.** Run `cd review-app && APP_PIN=1234 node scripts/build.js && node server/server.js`
   on a computer, or host it (e.g. Render: root `review-app`, start `node scripts/build.js && node server/server.js`).
   On free hosting, data needs the Supabase copy (`SUPABASE_URL`, `SUPABASE_KEY` = anon key,
   `SUPABASE_SECRET`) and the table from `generic-app/supabase-schema.sql` (not yet created; the
   Supabase approval prompts timed out).
3. **AI reading** needs a Google Gemini key (More → Settings). Optional.
4. **Android signing key** is NOT in the repo (repo is public). It was sent as
   `BizCore-signing-key.zip`; keep it private. Every update must be signed with it, or phones refuse
   the update. Put both files in `generic-app/android-app/keystore/` to rebuild.
5. Play Store publishing not done (needs a Play Console account).
6. `generic-app/` holds older versions and can be deleted once 2.0 is confirmed on phones.
7. A Render API key was saved on the previous Claude environment; it was rejected (401) and is not
   used. Delete it from that environment's settings.

## 6. Rebuild the Android app
Needs Node 18+, JDK 21, Android SDK (platform 36, build-tools 36.1.0) and the signing key.
```bash
cd generic-app/android-app
npm install
node prepare-web.js && npx cap sync android
cd android && ./gradlew assembleRelease
# then sign with v1+v2+v3 (see the commit "rebuild APK 1.0.1 signed with v1+v2+v3"):
apksigner sign --ks ../keystore/bizcore-release.jks --ks-key-alias bizcore \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out ../release/BizCore.apk app/build/outputs/apk/release/app-release.apk
```
Bump `versionCode` / `versionName` in `android/app/build.gradle` for each release.

## 7. Install on a phone
Open the APK link in **Chrome** → when downloaded tap **Open** (or Chrome ⋮ → Downloads) →
**Install**. Do not open it from a "Files" app that browses inside it. Allow "install from this
source" and "Install anyway" if asked.

## 8. Prompt to continue in a new Claude Code session
> Continue the BizCore Review project in Sridhar-2222/Medical-Store-Final-Complete, branch
> claude/generic-multi-industry-app-llwtau. Read HANDOVER.md first. The current app is review-app/
> (phone-first business review: sales vs spending, cash in hand, walk-ins, stock, Customer Vault
> titled with the business name; optional office server). The Android project is
> generic-app/android-app (builds from review-app). Run the tests listed in HANDOVER.md before and
> after changes. Next: [describe what you want].
