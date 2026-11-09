# Fingertip business apps: verticals plan

Owner: Sri Vasudeva Medical Agencies, Karimnagar. Written 9 Nov 2026.

## 1. The Fingertip pattern (same for every business)

```
Main page:  Headers (6–8 big buttons, one colour each)
              └─ Sub-headers (buttons only, no figures, no examples)
                    └─ four actions on every sub-header
                         ⬆ Upload      photo · file · Excel/CSV · type it
                         ⬇ Download    Excel (CSV) · WhatsApp summary · saved photos
                         ⇄ Combine     put this next to another sub-header, day by day
                         💡 Understand totals, days, highs, averages; optional AI explanation
Customer Vault: one per customer, titled with the business name, sent on WhatsApp
```

Rules: phone first and offline; no sample data, no marketing text, no examples;
the owner's numbers appear only after the owner uploads or types them.

## 2. Hotel (rooms + restaurant + guests): built first, as a new app

The current Fingertrip.biz AI app is a **daily review** app built from the pharmacy
model (sales, purchases, expenses per day). A hotel needs **stay-level** records
(room × nights × guest) and a restaurant that sells to both outside customers and
in-house guests. That does not fit the current app well, so the hotel is a **new,
separate app** (`hotel-app/`, Android id `biz.fingertrip.hotel`). The current app is unchanged.

### Headers and sub-headers

| Header | Sub-headers |
|---|---|
| Rooms | Bookings · Check-in / Check-out · Room status · Housekeeping · Room sales |
| Restaurant | Dine-in · Room service · Takeaway / Delivery · Banquets & parties · Kitchen stock |
| Guests | Guest vaults · Messages · Reminders |
| Money | Payments received · Other income · Expenses · Bank / UPI statement |
| Purchases | Supplier bills · Store in / out |
| Staff | Attendance · Salaries · Advances |
| Reports | Daily · Monthly · Occupancy · Profit |
| Settings | Business details · Rooms list · AI · Backup |

### How each department earns (revenue model)

| Department | Earns from | Main costs | Numbers that matter |
|---|---|---|---|
| Rooms | room nights × rate; extra bed; early check-in / late check-out | OTA commission (15–25%), housekeeping, laundry, power | occupancy %, average room rate, revenue per available room |
| Dine-in | food and beverage bills | food cost (30–35% target), kitchen staff, gas | covers per day, average bill, food cost % |
| Room service | in-room orders added to the room bill | same kitchen, delivery to room | share of guests ordering |
| Takeaway / Delivery | counter takeaway; Swiggy / Zomato | aggregator commission (18–30%), packing | net after commission |
| Banquets & parties | hall hire + per-plate packages | advance-based; staff, decoration | advance received vs balance due |
| Other income | laundry, taxi, minibar, hall hire | the service's own cost | income per service |

The **Combine** action answers the owner's real questions without extra screens:
Room sales ⇄ Payments received (money not yet collected), Dine-in ⇄ Kitchen stock
(food cost), Takeaway ⇄ Bank / UPI statement (aggregator payouts), Supplier bills ⇄
Store in / out (what was bought vs used).

### How the guest is served with the Vault

Each guest gets a vault titled with the hotel's name:
- stays (dates, room), bills and GST invoices, photos/files;
- preferences: room type, food likes, allergies, occasions (birthday, anniversary);
- reminders (anniversary offer, next visit) and every WhatsApp message sent.

The owner sends it with **Send vault** (WhatsApp text). A private vault web page needs the
office server online (not deployed yet).

ID proof: keep only with the guest's consent; store a masked copy (last 4 digits of
Aadhaar), never the full number.

## 3. Other business verticals: does the Fingertip pattern fit?

| Fit | Businesses | Why |
|---|---|---|
| Fits well | pharmacy, grocery, garments / footwear, hardware & building material, furniture, bakery, optical, mobile repair, salon / spa, garage / service centre, tailoring | daily sales + supplier bills + expenses + repeat customers; vault = warranties, service dates, measurements, prescriptions |
| Fits with its own sub-headers | clinic (consultations, follow-ups), diagnostic lab, school / tuition (fees, batches), gym / yoga (memberships, renewals), caterers / event halls (bookings, advances), PG / hostel (beds, monthly rent) | booking or membership records instead of plain daily sales, like the hotel |
| Does not fit; leave out | manufacturing with bill of materials and production planning; transport fleets needing GPS; large hospitals (hospital information systems, regulation); banks / NBFCs; online marketplaces | need real-time tracking, complex inventory or heavy regulation that a phone-first review app should not attempt |

Health records (pharmacy, clinic, lab) stay in **Rx Fingertip**'s stricter health store.

## 4. New businesses that would benefit from the Fingertip architecture

| Business | Headers it needs | Vault holds |
|---|---|---|
| CA / tax consultant | Clients · Filings · Fees · Staff | client documents, returns, due dates |
| Insurance agent | Policies · Renewals · Commission | policy copies, renewal dates, nominees |
| Tuition / coaching centre | Batches · Fees · Attendance · Tests | fee receipts, marks, parent messages |
| Gym / yoga studio | Members · Renewals · Trainers | plan, measurements, renewal date |
| PG / hostel | Beds · Rent · Mess · Complaints | agreement, rent receipts, deposit |
| Wedding hall / caterer | Bookings · Advances · Menus · Staff | booking contract, menu, payments |
| Travel agent | Bookings · Payments · Suppliers | tickets, visas, ID copies (masked) |
| Car rental / driving school | Vehicles · Trips / Lessons · Fuel | licence, trip bills, lesson record |
| Pet clinic / grooming | Visits · Medicines · Grooming | vaccination dates, reports |
| Photo studio / interior designer | Projects · Advances · Suppliers | quotes, designs, delivery dates |
| Mandi commission agent / dairy collection centre | Farmers · Lots / Milk · Payments | weigh slips, rates, payments |

## 5. Order of work

1. Hotel app (this document's section 2): first version built.
2. Owner tests on the phone; adjust headers.
3. Next vertical chosen by the owner from section 3 or 4, built the same way as its own app.
