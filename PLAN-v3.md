# BizCore 3.0: plan for review (nothing built yet)

**Principle:** Main page → **Header** → **Feature** → **Entry / details**.
Three levels only. Every place where data is entered has **📷 Photo (read automatically)** and
**📎 Attach file**. Big, clean tiles that still fit when the phone's text size is large.

---

## Level 1: Main page (6 headers, fingertip line around them)

```
  Saffron Restaurant                  ⚙
  Today: Sales ₹29,465 · Profit ₹6,120

  ╭────────────╮   ╭────────────╮
  │ ACCOUNTS   │───│ CUSTOMERS  │
  │ ₹6,120 ▲   │   │ 3 due      │
  ╰─────┬──────╯   ╰─────┬──────╯
  ╭─────┴──────╮   ╭─────┴──────╮
  │ STORE      │   │ REPORTS    │
  │ 4 bills    │   │ 2 alerts   │
  ╰─────┬──────╯   ╰─────┬──────╯
  ╭─────┴──────╮   ╭─────┴──────╮
  │ STAFF      │───│ BUSINESS   │
  │ 12 people  │   │ SETUP      │
  ╰────────────╯   ╰────────────╯
```
- The **fingertip line** runs around all six headers once when the page opens (Fingertip brand).
- Each header shows one live figure. No tab bar; the main page is the menu. A **back arrow**
  on every inner page; tapping the logo returns to the main page.

---

## Level 2 and 3: what each header opens

### 1. ACCOUNTS
| Feature (Level 2) | Entry page (Level 3) |
|---|---|
| **Sales** | Per sales department (A, B, C… named by owner, e.g. Dine-in, Catering, Door delivery): date, morning/evening, amount, cash/UPI/card. 📷 photo of day-end printout or handwritten bill book page. 📎 file. |
| **Purchases** | Store category, supplier, bill no, date, total, paid by. 📷 bill photo read automatically, 📎 PDF/file. (Same bills as Store; one place to enter, visible in both) |
| **Salaries** | Month, staff (from Staff), amount, paid date. 📷 salary sheet / 📎 file. Counted as a fixed cost, spread per day. |
| **Fixed costs** | Rent, electricity, internet, EMI…: monthly amount. 📷 bill photo / 📎 file. Spread per day. |
| **Maintenance** | Repairs, AMC, servicing: date, what, amount, vendor. 📷 / 📎 |
| **Variable expenses** | Packing, fuel, commission, daily wages: date, amount. 📷 / 📎 |
| **Sudden / miscellaneous** | Emergency, fine, breakage, one-off cash: date, amount, reason (must). 📷 / 📎. Always marked for review. |
| **Cash in hand** | Counted at close, cash deposited. App checks against expected. |
| **Profit & Loss** | Any period: Sales − Purchases = Gross profit; − variable − maintenance − sudden − (monthly fixed ÷ days in month × days) = Net profit. 4-week average purchase % to smooth heavy/light buying weeks. |

Each feature page: **"＋ Add"** button, then the list of recent entries; tap an entry for details,
its photo/file, edit or delete.

### 2. CUSTOMERS
| Feature | Entry / details |
|---|---|
| **Customer list** | Search; tap a customer to open their **vault**. ＋ Add customer (name, WhatsApp, 📷 visiting card / ID read automatically). |
| **Customer vault** (per customer, titled with the business name) | Records (prescriptions, warranties, stays, orders…), **📷 photos and 📎 files** (prescription, report, invoice, warranty card) with text read automatically, reminders, messages, discounts. |
| **Customer discount** | Standing discount % per customer (e.g. regular 5%). Shown in the vault and on messages. |
| **Special discount** | One-off offer: customer(s), %, or amount, valid till date, reason (birthday, festival…). Send by WhatsApp in one tap; kept in the vault. |
| **Reminders due** | Refills, services, renewals, occasions due this week; one-tap WhatsApp. |
| **Messages** | Everything sent, by customer. |

### 3. STORE
- **Store categories** (owner-named: Vegetables, Meat, Dairy, Groceries, Gas…) → each opens its **purchase bills**.
- Per bill: **📷 photo read automatically** (supplier, date, bill no, total) **or 📎 PDF/file**. **No item-level entry.**
- Category page shows this week vs last week and the 4-week average.

### 4. REPORTS
| Feature | Shows |
|---|---|
| **Profit & Loss** | Day / week / month / any dates; gross and net with fixed costs spread per day |
| **Sales** | By department, day-on-day change, morning vs evening, walk-ins (optional) |
| **Spending** | Purchases, fixed, variable, maintenance, sudden; changes vs previous period |
| **Alerts** | Sales drop/high, spending above sales, sudden expenses, purchases above 4-week average, cash short, collections short |
| **Spot check** | Random days / chosen days / morning or evening |
| **Share** | Summary on WhatsApp |

### 5. STAFF
- Staff list (name, role, phone, monthly salary, 📷 ID / 📎 documents).
- Salary paid per month (feeds Accounts → Salaries).
- Advance / loan to staff (optional).

### 6. BUSINESS SETUP
- Business name, **vault title**, phone, address, business type.
- **Sales departments** (A, B, C… rename/add/remove), **Store categories**.
- **Fixed monthly costs** (default amounts so each day's profit is right even before bills arrive).
- Office system (sync), Backup / restore, Excel export, AI reading key.

---

## Photos and files everywhere
- **📷 Photo**: read on the phone (offline). Bills → supplier, date, bill no, total. Day-end
  report → sales, cash, UPI, card. Visiting card → name, phone. Prescriptions/reports → saved
  with the text read, searchable.
- **📎 File**: PDF or image from phone storage / WhatsApp / Drive.
- Photos are shrunk (about 150 KB each) and kept in the phone's file store (not the small
  settings store), included in backups, and sent to the office system when connected.
  Vault files appear on the customer's private vault page.

## What goes away (simpler)
Item-level stock (counts, issues), per-item price alerts, the bottom tab bar, and the separate
Guide / Everything-entered screens (each feature page lists its own entries).

## Questions
1. Main headers OK: **Accounts, Customers, Store, Reports, Staff, Business setup**?
2. **Walk-ins**: keep as an optional field in Sales?
3. **Discounts**: only recorded and messaged (no billing). Correct?
4. Purchases appear under both **Accounts → Purchases** and **Store** (same bills). OK?
5. Fingertip line: draw once on opening, or keep moving gently?
