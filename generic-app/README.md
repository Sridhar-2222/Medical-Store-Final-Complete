# BizCore — one business app for many industries

BizCore is a generic version of the Medical Store app. The same code runs a pharmacy,
grocery store, restaurant, salon, clinic, clothing shop, electronics/mobile shop,
hardware store, bakery, garage, gym or a service business. You pick the business
type on first start and the app changes its words, fields, tax rate and screens.

It has **no npm dependencies** and **does not need Supabase, GitHub or any internet
service to work**. Those are optional extras that the app falls back from when they
are down.

---

## What every business gets (the shared core)

| Area | Features |
|---|---|
| Billing / POS | Search or barcode-scan, quantity & price edit, bill discount, tax (inclusive or exclusive), cash/UPI/card/credit, part payments, change due, printable receipt, WhatsApp share, cancel bill (stock restored) |
| Items / catalogue | Products and services, categories, units, cost & selling price, per-item tax, barcode/SKU, reorder level, batch & expiry (where relevant), industry-specific extra fields, stock history, stock adjustment, CSV import/export |
| Purchases | Supplier bills add stock, create new items automatically, free qty, batch/expiry, partial payment, **read a bill photo with AI** (Gemini, optional) |
| Customers & suppliers | Contact details, balance (dues), payments auto-settle the oldest bills, full ledger, WhatsApp payment reminder, loyalty points |
| Appointments / bookings | For salons, clinics, garages, gyms, restaurants (table reservations), services: book, remind on WhatsApp, "done & bill" in one click |
| Expenses | Categories per industry, monthly totals |
| Staff | Roles, salary, commission %, "served by" on bills, commission report |
| Dashboard | Today / month sales & profit, collections, money to collect / pay, stock value, low stock, expiring, upcoming bookings, 14-day chart |
| Reports | Any date range: sales, gross & net profit, tax summary by rate, top items, categories, payment methods, staff, expenses |
| Data | Full backup & restore (JSON), CSV export of everything, sample data, erase |
| Security | Optional PIN for the shared server |

### What changes per industry

| Industry | Words used | Extra item fields | Turned on |
|---|---|---|---|
| Pharmacy | Medicine, Patient, Bill | manufacturer, composition, HSN, rack, Rx required | batch, expiry |
| Grocery | Product, Customer, Bill | brand, MRP, shelf | expiry |
| Restaurant / café | Menu item, Guest, Order | veg/non-veg, kitchen section, spicy | table reservations, services |
| Salon / spa | Service, Client | for (gender) | appointments |
| Clinic / dental / lab | Service, Patient | department | appointments, batch, expiry |
| Clothing / footwear | Product | size, colour, brand, material | — |
| Electronics / mobile | Product | brand, model, serial/IMEI, warranty | repair bookings |
| Hardware | Item | brand, size/spec | — |
| Bakery / sweets | Product | eggless | batch, expiry |
| Auto service / garage | Part / Service, Job invoice | part no., fits vehicle | service bookings |
| Gym / fitness | Plan, Member, Receipt | validity days | sessions |
| Professional / home services | Service, Client | — | bookings (no purchases/suppliers) |
| General | Item | — | everything |

Add a new industry by adding one block to `core/industries.js`. No other code changes.

---

## Three ways to run it (pick any)

### 1. Single file, no server (works offline)
Open `dist/bizcore-standalone.html` in any browser (double-click it, copy it to a
USB stick, or put it on GitHub Pages / Netlify / any static host). Data is saved in
that browser. Use **Backup & data → Download full backup** to move it.

### 2. Shared server (all phones and computers see the same data)
Needs Node 18 or newer. Nothing to install:

```bash
cd generic-app
node server/server.js        # open http://localhost:8080
```

Data is saved in `generic-app/data/bizcore-db.json` with a daily backup copy kept for
14 days in `data/backups/`.

**Render.com:** New → Blueprint → pick this repo (uses `generic-app/render.yaml`), or a
Web Service with root dir `generic-app` and start command `node server/server.js`.
**Docker:** `docker build -t bizcore generic-app && docker run -p 8080:8080 -v bizcore:/data bizcore`.

### 3. Shared server + Supabase copy (optional)
1. In Supabase → SQL Editor run `supabase-schema.sql`.
2. Set `SUPABASE_URL` and `SUPABASE_KEY` (service role key, server only).

Every change is saved to the local file first, then copied to Supabase in the background.
If Supabase is unreachable the changes wait in a queue on disk and are retried
automatically, so billing never stops. If the server starts with an empty disk (common
on free hosts), it restores itself from Supabase.

### Optional settings (environment variables or a `.env` file)
| Variable | Purpose |
|---|---|
| `PORT` | default 8080 |
| `DATA_DIR` | where data lives (default `./data`) |
| `APP_PIN` | ask for a PIN before showing any data |
| `SUPABASE_URL`, `SUPABASE_KEY` | Supabase copy (see above) |
| `GOOGLE_API_KEY` | AI bill reading on the Purchases screen |
| `GEMINI_MODEL` | default `gemini-2.5-flash` |

In single-file mode the Gemini key can be entered in **Settings → AI bill reading**;
it is kept on that device only and is not included in backups.

---

## Works offline

**Shared server mode.** Each phone or computer keeps a full copy of the shop data and the
app itself. If the internet drops, the app keeps working: billing, stock, customers,
payments and bookings all carry on. The badge at the bottom of the menu shows
`Offline · N to sync`. When the connection returns, the waiting changes upload
automatically, in order and exactly once (each change has its own id, so a retry never
creates a duplicate bill). Then the device downloads the latest copy.

Notes:
- While offline, a phone only sees its own new changes. Changes made at the same time on
  other phones appear once both are back online.
- A bill made offline gets its final number from the server when it syncs, so the number
  on the server can differ from the number shown offline.
- If an offline change can no longer be applied (for example, the same bill was
  cancelled on another phone), it is listed under **Backup & data → Shop server & sync**.
- Reading a bill photo with AI needs internet.

**Single-file mode** (`dist/`) works offline too: it is self-contained, and on an https
host the included `sw.js` lets it reopen offline.

---

## Android app (APK)

A ready-to-install APK is at `android-app/release/BizCore.apk`.

**Install on a phone:** copy the APK to the phone (WhatsApp it to yourself, Google Drive,
or a USB cable), tap it, and allow "Install unknown apps" when Android asks.

The app works on its own (data saved on the phone, fully offline). To share data with
other phones and computers, tap **Connect to shop server** on the first screen, or go to
**Backup & data → Shop server & sync**, and enter your server address and PIN. It then
works offline as described above. Backups open Android's share sheet (save to Drive,
send on WhatsApp, and so on). Receipts are shared via WhatsApp; Android's WebView cannot
print directly.

**Signing key:** the APK is signed with a private key that is **not** stored in this
public repository. Keep `bizcore-release.jks` and `keystore.properties` safe (put them
in `android-app/keystore/`). Every future version must be signed with the same key, or
phones refuse to install the update.

**Rebuild after changing the app** (needs Node 18+, JDK 21 and the Android SDK):
```bash
cd generic-app/android-app
npm install
npm run apk       # -> android/app/build/outputs/apk/release/app-release.apk
```
Or, with no setup at all, use GitHub: **Actions → BizCore Android APK → Run workflow**,
then download the APK from the run. To have GitHub sign with your key, add repository
secrets `BIZCORE_KEYSTORE_B64` (base64 of the .jks file) and `BIZCORE_KEYSTORE_PASSWORD`.

**Google Play Store:** create a Play Console developer account, build an app bundle
(`./gradlew bundleRelease` in `android-app/android`) and upload it. Play App Signing
manages the store key for you. The app id is `com.bizcore.app`; change `appId` in
`android-app/capacitor.config.json` before the first upload if you want your own.

---

## How it is built

```
core/industries.js   industry presets (words, fields, modules, samples)
core/engine.js       all business rules: billing, stock, dues, purchases, reports, CSV, backup
core/ai.js           optional Gemini bill reader (plain fetch, no SDK)
server/server.js     zero-dependency HTTP server: static files + /api/rpc + CSV/backup + AI
server/storage.js    JSON file store (atomic writes, daily backups) + Supabase mirror with retry queue
public/              the web app (vanilla JS, works on phones, light & dark mode, offline sync)
public/sw.js         keeps the app on the device so it opens without internet
android-app/         Capacitor project that packages the web app as an Android APK
scripts/             builds the single-file version into dist/
test/                unit, server and browser tests
```

The same `engine.js` runs in the browser (single-file mode) and on the server
(shared mode), so both behave identically. Every action is all-or-nothing: if a bill
fails (for example, not enough stock) nothing is half-saved.

## Tests

```bash
npm test            # engine + server (incl. Supabase outage & recovery)
npm run test:e2e    # browser test with Playwright, if installed
node test/offline-e2e.js   # go offline, keep billing, reconnect, check sync
node test/native-sim.js    # Android app logic: phone-only mode, server connect, offline, share sheet
npm run build       # rebuild dist/ after changing public/ or core/
```

## Keyboard
`F2` opens a new bill from anywhere. On the bill screen, scan a barcode or type a
name and press Enter to add it.
