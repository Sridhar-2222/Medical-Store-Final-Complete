# Fingertip Control Centre: Infrastructure Audit & Handover

- **Date:** 2026-11-04
- **Author:** Claude Code (infrastructure)
- **Next owner:** Codex (independent testing)
- **Repo / branch:** `Sridhar-2222/Medical-Store-Final-Complete` @ `ccr-b3023934-88x2pt`

Status key: **DONE** = done and verified with evidence below. **READY** = built and tested here, but not deployed because access is missing. **BLOCKED** = needs an action from the owner, written out in §10.

---

## 1. Infrastructure audit

| Component | Status | Evidence (2026-11-04 ~05:15 UTC) |
|---|---|---|
| GitHub | 5 repos in scope. Only `Medical-Store-Final-Complete` has code. `rx-fingertrip-project-docs` has one CSV (7,500 company contacts). `rx-fingertrip-project-doc`, `rxfingertrip-product-data-` and `rxfingertrip-product-data-base` are **empty** (no commits). | `git log` in each clone |
| Domain `aipharmacy.in` | Registered at **GoDaddy** (NS `ns73/ns74.domaincontrol.com`). A records `15.197.148.33` and `3.33.130.190` belong to **GoDaddy's parking/forwarder**, not a VPS. The site returns a JS redirect to `/lander` (a parked page). `www` is a CNAME to the apex. **No MX, TXT, AAAA**, and no `n8n`, `api` or `app` subdomains. | `dns.google` lookups; `curl https://aipharmacy.in/` body |
| Hostinger VPS | **Exists: Hostinger KVM 1 plan, expires 2026-11-15** (renewal emails 31 Oct and 1 Nov). Not reachable from here: no DNS record points to it, and no IP or SSH access has been provided. **Renew before 15 Nov.** | Gmail (Hostinger renewal notices) |
| Nginx / SSL on VPS | **Not inspectable** (no VPS access). Public SSL on aipharmacy.in could not be checked independently, because this sandbox's egress proxy re-signs TLS. | `openssl s_client` shows the proxy CA |
| Supabase | Project `fsftbvchnifshndssowe` (ap-southeast-1, Postgres 17) is **ACTIVE_HEALTHY**. It has 58 public tables, all with RLS enabled. Edge Functions: `smooth-responder` (WhatsApp webhook, v8), `pilot-access`, `ocr-read`, `google-places-search`. | Supabase MCP `list_projects`, `list_tables`, `list_edge_functions` |
| Application hosting | Main app = **Lovable project "Rx Fingertip"** (`f3e49536…`), published, last edited 2026-11-03, commit `7ecf4978`. Lovable also hosts "Sai Stock" (published) and 9 other projects. The preview URL returns 401 without login (expected for workspace preview). | Lovable MCP `get_project` + screenshot |
| n8n | **Does not exist** (no host, DNS or instance). | — |
| Meta WhatsApp Cloud API | Webhook is live and works. **Outbound delivery fails: error 131031 "Business account has been locked".** | §4 |
| Google Sheets | No Fingertip sheet is wired to anything yet. The 4SAI AppSheet sheet is owned by a different account (`aiintheracks@gmail.com`). | Drive search, status doc 15 Oct |
| Android Health Connect | DB schema exists (`vital_readings`, `vital_preferences`, `vital_deliveries`), but has **0 rows**. The live constraint only allows Health Connect **steps**. | §7 |
| Monitoring / backups | **None found.** | — |

### Supabase security advisories (Codex-owned, reported only, not changed)
- **WARN:** 3 `SECURITY DEFINER` functions can be run by `anon`: `am_directory_editor`, `preview_join_code`, `request_pilot_access`. The last two look intentional (pre-login flows). Confirm each one.
- **WARN:** 71 `SECURITY DEFINER` RPCs can be run by `authenticated`. Each must check membership internally. Codex should test cross-tenant access (user A calling with business B's id).
- **WARN:** Leaked-password protection is off. Turn it on in Dashboard → Auth → Settings.
- **INFO:** 19 tables have RLS on but no policies, so they can be reached only through the service role or definer functions. That is fine if intended (for example `wa_*`, `whatsapp_*`, `pilot_*`).

### 1a. Recent Lovable changes in the live Rx Fingertip app (verified 2026-11-04)
These were made **by a separate Claude session on 3 Nov**, not by this one. They reached Lovable through GitHub `main`.
| Commit | Change | Live check on https://rx-fingertip.lovable.app |
|---|---|---|
| `1f1ec97`, `87842a6` | Android Share-menu receiving: files from Drive, Photos or WhatsApp go to the patient vault and chemist capture, and `/share-receive` returns after sign-in | `manifest.webmanifest` has `share_target` → `/share-target` (POST multipart). `sw.js` references `share-receive`. **Live.** |
| `8c35489` | Service-worker install fix (`/offline` 404 broke the install and disabled share receiving) | `sw.js` falls back to `offline.html`, which returns 200. **Live.** |
| `7ecf497` | Product-photo OCR: tolerates more batch/expiry layouts and reads files that have no type | This is the latest Lovable commit and the app is published. The live JS bundle was not inspected, so this one is **not independently confirmed**. |

Codex: include share-to-app on a real Android phone (Chrome → install PWA → share a photo from WhatsApp) and product-photo OCR in the test plan.

### 1b. Product-photo reading fails on the live app (owner test, 4 Nov ~11:50 IST)
- **Symptom:** Fenalin SP pack photo. Every field shows "not read clearly", and the cloud option says "Gemma is not available now, type details".
- **Path:** cloud reading is the app's own server route `POST /api/gemma-read` (TanStack, `src/lib/gemma.server.ts`), **not** the Supabase `ocr-read` function. `ocr-read` had no calls in the last 24 h.
- **Live check:** `/api/gemma-read` now returns `401 unauthorized` to unsigned calls, so it is deployed (it returned 404 on 1 Nov).
- **Probable cause:** `gemmaKey()` finds neither `GEMMA_API_KEY` nor `GEMINI_API_KEY` in the **Lovable app's** environment, or Google refuses the key (401/403). Both cases raise `not_configured`. The app's own handover (`docs/handover/PHOTO-READER-CONNECTION.md`, 1 Nov) recorded both secrets as absent. A key saved in Supabase Edge secrets does **not** reach the Lovable runtime.
- **Owner fix:** go to Lovable → Rx Fingertip → Project Settings → Secrets (https://lovable.dev/projects/f3e49536-7326-4203-921e-1eb222f08bb1/settings) and add `GEMINI_API_KEY` = the Google AI Studio key. Never paste it in chat. Then retest with cloud consent ticked.
- **On-device reading:** the test photo shows the pack small, tilted and far from the camera, so the label text is only a few pixels high. Retake it close up, flat, filling the frame, one photo for the front and one for the batch/expiry/MRP side.

### 1c. Existing Lovable assets this audit initially missed
- The Lovable repo already has `native/vital-check/android/VitalSteps.kt` (a native steps reader) and `integrations/n8n/vital-daily-scheduler.json`.
- Codex should reconcile `health-connect/adapter.js` here with `VitalSteps.kt`, keeping one Health Connect path, and run the n8n vital scheduler on the same n8n instance as the WhatsApp→Sheets workflow.

### 1d. Live app walkthrough — https://rx-fingertip.lovable.app (4 Nov, Pixel 7 emulation, signed out)
- **60 pages visited**: all return 200, with **0 console errors and 0 failed requests**. Public pages tested: home, the 5 role pages, the 5 demo pages, 7 dashboards, directory (hospitals, labs, emergency), doctors, learn, stock status/checklist, about, contact, privacy, terms, delete-account.
- Every signed-in page (pharmacy, shop-stock, stock-records, stock-moves, stock-review, stock-import, orders, shortages, purchase-invoice, sales-bill, rx-reading, patient-orders, my-health, my-shops, directory-admin) redirects to `/auth` and its pilot-code screen, as designed. **Signed-in flows were not exercised.** That needs a pilot test account, and the owner has not authorised creating one in production.
- **Real usage in the live DB:**

| Item | Count |
|---|---|
| distributor–chemist links | 0 |
| orders | 0 |
| bills | 0 |
| receipts | 0 |
| distributor inventory rows | 0 |
| prescriptions | 0 |
| vital readings | 0 |
| shop stock entries | 2 |
| stock movements | 0 |
| capture drafts | 18 (2 in the last 24 h, i.e. the owner's test) |
| vault records | 1 |
| businesses | 10 |
| pilot access requests | 0 |

  The core trade flow (link → order → bill → receipt) has **never run end to end**.
- **Unfinished work the app lists on its own pages** (the "things to fix" cards, source review 2 Nov):
  - **Feature not built:** sending the original handwritten order photo/PDF to the distributor; prescription handwriting reading (auto-reading is off); hospital departments (lab, pharmacy, OP, IP, radiology, admin) with controlled sharing; hospital finance and operations reports; per-hospital info pages and voice answers; AI answers to hospital questions (search currently opens Google); patient inquiries and feedback; doctor–patient linkage with consultation records and reminders; the business patient-file vault and notes; OTP customer onboarding for every business type; delivery requests and status (location is a one-time pin only).
  - **Needs account setup:** the photo reader key (§1b); pilot codes are short and guessable, so real sign-in is needed before going past the first 50 users; the owner hands out pilot codes manually.
  - **Needs a manual test:** order → short supply → invoice → receipt with matching balances on both sides; order/invoice downloads on phone and desktop with one account; distributor file mapping and re-uploads; combined purchase + sale + shelf counts with save, refresh and reopen; private vault on a second device; video playback per role on Android.
  - **Code ready, release test needed:** product and date-range reports; medicine-search and video shortcuts on role and demo pages.

### 1e. Signed-in end-to-end test on the live app (4 Nov, ~06:50–07:05 UTC, owner-approved)
The test used the app's own "No code → Another shop (own test space)" path. It created two isolated TEST accounts: **Pilot Chemist 290D5B (TEST)** and **Pilot Distributor C5B872 (TEST)**. Only synthetic data was entered (all names start with "TEST"). The real shops 33 and Mega were not touched.

| # | Step | Result |
|---|---|---|
| 1 | All 16 signed-in pages, as chemist and as distributor | **PASS.** All load with 0 console errors. The distributor correctly sees "not a member of a chemist shop" on the chemist-only pages. |
| 2 | Distributor makes an invite code (`XXXX-XXXX`, 14-day validity); chemist enters it | **PASS.** Both sides show "Linked". |
| 3 | Chemist sends an order (Paracetamol ×10, Cetirizine ×5, with a note) | **PASS.** The distributor sees "Distributor action required". |
| 4 | Distributor supplies 6 of 10 | **PASS.** Status "Short supply"; the chemist sees "10 → 6". |
| 5 | Price and bill: rates ₹20/₹30, 12% GST, batches, expiries, bill TEST-001, PDF attached | **PASS.** Subtotal ₹280.00, GST ₹33.60, total ₹313.60, all correct. |
| 6 | Chemist downloads the invoice | **PASS.** Same 626-byte PDF that was uploaded. |
| 7 | Chemist marks received | **PASS.** Stock rows created: Cetirizine 5 (TESTB1, exp 2027-12-31) and Paracetamol 6 (TESTB2, exp 2028-06-30). Confirmed in the DB. |
| 8 | Distributor records a ₹100 UPI payment | **PASS.** Both ledgers show billed ₹313.60, paid ₹100, due ₹213.60. |
| 9 | Chemist records a sale of 3 Paracetamol | **PASS.** "Saved. New quantity: 3"; history survives a reload; DB quantity is 3. |
| 10 | Product photo capture, phone reader, with a clear synthetic label | **PASS.** Name "TESTOCIN 500 500 mg" (slight repeat), pack, batch TST24A01, expiry 2027-12-31 and MRP 45.5 all filled. |
| 11 | Cloud (Gemma) reading with consent ticked | **FAIL.** `POST /api/gemma-read` returned **502**, shown as "Gemma is not reachable now". |

**Gemma 502 diagnosis:** 502 means `provider_error`, `bad_response` or `truncated`. It is **not** `not_configured` (503), so a key **is** present. Google answers an invalid or revoked key with **HTTP 400 `API_KEY_INVALID`** (reproduced with a dummy key), and `callGemma` maps every 400 to `provider_error`, i.e. 502. Most likely cause: **the saved `GEMINI_API_KEY` is not a valid key for the Gemini API**. Other possible causes are Google rejecting the request settings for `gemma-4-31b-it` (`thinkingConfig`) or an unparseable answer; Lovable server logs will show which.
- **Owner:** in Google AI Studio → API keys, check the key is active, then re-enter it in Lovable → Project Settings → Secrets as `GEMINI_API_KEY`.
- **Code fix (Lovable/Codex):** in `gemma.server.ts`, treat a 400 whose body says `API_KEY_INVALID` as `not_configured`, and log the provider error body, so the screen says "key invalid" rather than "not reachable".

**Owner's Fenalin SP photo:** the phone reader works on a sharp, close-up label (row 10), so that failure was photo quality: small, tilted, far away.

**Second round (4 Nov, ~07:28–07:45 UTC), same TEST accounts plus a new test patient, "Pilot Patient 477308":**

| # | Step | Result |
|---|---|---|
| 12 | Distributor downloads the stock template, uploads a 3-row CSV, columns auto-matched | **PASS.** 3 rows ready, 0 problems, published |
| 13 | Share with the chemist as "Exact" | **PASS.** Chemist sees "Reported available: 120". Supplier rate and batch are **not** shown, as promised. |
| 14 | Re-upload with quantity 100 | **PASS.** The chemist sees 100, and both imports appear in history. |
| 15 | Sharing set to "Availability only", then "Hidden" | **PASS.** Shows only "Available", then the item disappears. Restored to Exact afterwards. |
| 16 | Chemist returns 1 Cetirizine (near expiry); distributor accepts with ₹22.40 credit | **PASS.** Chemist stock 5→4 on sending. Both ledgers show due ₹191.20 (313.60 − 100 − 22.40). |
| 17 | Patient opens the shop join link `/join/WFXRYK9N` | **PASS.** "Join shop" stays disabled until the consent box is ticked; then joined. |
| 18 | Patient sends a pre-order; chemist marks it "Ready for pickup" with a message | **PASS.** The patient sees the status and "Shop says: …". |
| 19 | Patient uploads a synthetic lab report to the private vault | **PASS.** Saved, survives a reload, and View opens a Supabase signed URL. |
| 20 | Patient shares it with the chemist for 1 day (choices 1, 3 or 7 days; consent required) | **PASS.** The chemist sees it with "ends in 24 h" and opens it; the patient then sees "opened 1 times". |
| 21 | Patient taps "Stop sharing" | **PASS.** The chemist sees "Nothing shared right now". |
| 22 | Date-range report 1–4 Nov | **PASS.** Invoices ₹313.60 (1); movements purchases ₹280 and sales ₹105; per-item in/out/adjust/balance all correct (Cetirizine 5/0/−1/4, Paracetamol 6/3/0/3). |

**Gemma follow-up (4 Nov, 08:35–09:10 UTC):**
- The owner re-saved `GEMINI_API_KEY` and republished. The live site still returned 502.
- Lovable's agent then ran real text-only calls. **The key, the model `gemma-4-31b-it` and `thinkingLevel: minimal` are all valid.** The cause is Google's free tier: intermittent **500 INTERNAL** errors and 8–54 s latency, against the old 45 s timeout.
- Owner-approved fix, Lovable commits `8a46955` and `d55c206`, **not published**:
  - Google's error status, message and reasons are now logged (never the key).
  - A 400 with `API_KEY_INVALID` now maps to `not_configured`.
  - Each attempt may take 90 s.
  - **One** retry, after a 2 s pause, and only on 500/503 or a first-attempt timeout. There is no retry on 400/401/403/429.
  - The whole request has a 98 s budget, to stay under the ~100 s edge limit, so a retry happens only if at least 15 s remain.
- Results: 40 tests pass, 0 fail, and the build is OK. Two real calls: the first got a 500, was retried and returned OK in 35.2 s total; the second returned OK in 21.1 s.
- **Owner must publish** for the fix to go live. Then rerun row 11.

**Small defects found:**
- (a) The patient vault says "opened 1 times"; it should say "1 time".
- (b) Cloud reading shows "not reachable" for an invalid key (see the Gemma diagnosis above).

**Not exercised:**
- purchase-invoice and sales-bill photo capture (they depend on the same Gemma fix)
- prescription reading (disabled by design)
- Vital Check (native Android)
- Telugu voice search
- real Android share-to-app
- the signed-URL lifetime for vault files
- cross-tenant RLS probing (Codex security test)

**Decision on test data:** kept as a labelled demo pair (Pilot Chemist 290D5B, Pilot Distributor C5B872, Pilot Patient 477308; all records marked TEST or synthetic), because deleting across linked ledgers in production carries more risk than keeping it. Delete only on the owner's instruction.

**Test data left in production (round 1):** the two TEST businesses and accounts above, 1 order, bill TEST-001, a ₹100 payment, 2 stock rows, 3 stock movements and 2 capture drafts. Every name contains "TEST"/"synthetic". Delete it, or keep it as a demo pair, on the owner's instruction.

## 2. Application repair report (`Medical-Store-Final-Complete`)

Defects reproduced before fixing:

| # | Defect | Evidence | Fix |
|---|---|---|---|
| 1 | `GET /` → **404**. The UI was at the repo root, but the server served `public/index.html`. | `ENOENT … public/index.html` | Moved the UI to `public/index.html` |
| 2 | `/api/medicines` **hangs or crashes** when the DB is unreachable (no error handling). | curl got no response | Returns 502 with the error. The same applies to low-stock and saves. |
| 3 | `/health` always said OK and checked nothing. | Static string | `/health` (liveness) plus `/health/ready` (Supabase check, returns 503 when degraded) |
| 4 | Model `gemini-1.5-flash` is retired. | Hard-coded | `GEMINI_MODEL` env var, default `gemini-2.5-flash` |
| 5 | The app crashed at boot or at runtime when env vars were missing. `.env.example` was referenced but did not exist. | README | Checks env vars at start and fails fast. Added `.env.example`. |
| 6 | **Stored XSS**: OCR text was put into `innerHTML` without escaping. | `index.html` | All cells are escaped |
| 7 | Upload temp files leaked on error, there was no size or type limit, and a missing file crashed the handler. | Code | In-memory upload, 10 MB limit, image/PDF only, 400 when missing |
| 8 | An **unofficial WhatsApp-Web (Baileys) bot** auto-started, and `printQRInTerminal` is deprecated, so no QR was shown. This channel conflicts with the official Meta Cloud API and puts the number at risk of a ban. | Run log | Off by default (`ENABLE_BAILEYS_BOT`). QR rendering fixed for opt-in use. |
| 9 | No `.gitignore`, so the WhatsApp session keys (`auth_info_final/`) and `node_modules` could be committed. | — | Added `.gitignore` |
| 10 | `supabase-schema.sql` disables RLS and creates a public bucket. Running it on production would be harmful. | File | Added a prominent warning (not run anywhere) |

Tests: `npm test` runs **7/7 passing** (route smoke tests, parser and adapter units).

## 3. Hostinger, DNS, Nginx and SSL status

- **DNS:** BLOCKED. The domain points at GoDaddy parking. Records needed: §10-B.
- **Hostinger VPS:** BLOCKED. I have no access and no host is known.
- **Nginx:** READY. See `deploy/nginx/aipharmacy.in.conf`: HTTP→HTTPS, www→apex, app on `127.0.0.1:10000`, n8n on `n8n.aipharmacy.in` with websockets, HSTS and security headers, API rate limit, and a 12 MB upload limit. Shell scripts passed `bash -n`. `nginx -t` **could not be run here** (no nginx binary or Docker daemon in this sandbox), so run it on the VPS.
- **SSL:** READY. Use Let's Encrypt via certbot (runbook §7). `healthcheck.sh --full` alerts when fewer than 14 days remain.

## 4. WhatsApp connection and test results

**Configuration found** (from the 15 Oct status doc, confirmed by DB rows):
- App "Birds eye view" `1594826518800459`, WABA `1098694666453130`, Phone Number ID `1242742535598163` (Meta **test number** +1 555 145 5973), and test recipient ending `…9808`.
- Webhook: `https://fsftbvchnifshndssowe.supabase.co/functions/v1/smooth-responder`.

**Live checks run today:**
| Check | Result |
|---|---|
| GET with a wrong verify token | `403 Forbidden`. Verification is deployed and guarded. |
| POST without a Meta signature | `401 Invalid signature`. `WHATSAPP_APP_SECRET` is set and HMAC is enforced. |
| `…/functions/v1/whatsapp-webhook` | `404`. That function does not exist, so the Meta callback must point to `smooth-responder`. |

**Message history (`whatsapp_inbox` / `whatsapp_status`):**
| UTC | Event |
|---|---|
| 09-28 11:56 | Meta dashboard sample payload received (phone id `123456123`) |
| 10-16 02:42, 03:34; 10-17 09:26, 10:59 | **Real inbound messages from …9808 received and stored.** The webhook works. |
| Same timestamps + ~1 s | Reply `api_accepted` by the Graph API |
| Same + ~2 s, and 5× on 10-22 | **`failed`: error 131031 "Business account has been locked"** |

**Conclusion:** the 15 Oct blocker ("messages not reaching the function") is **resolved**. The blocker now is on Meta's side: **the WhatsApp Business Account is locked**, so nothing can be delivered. Fix: §10-A.

**Test message:** **BLOCKED.** I did not send one. Any send would fail with 131031 while the account is locked, and I hold no access token (it is stored only as a Supabase secret, as it should be).

Payload mapping (already in `smooth-responder`):
`entry[].changes[].value.metadata.phone_number_id` → `phone_number_id`; `messages[]` → `whatsapp_inbox` (`id, from, contacts[].profile.name, type, text.body | caption | button.text | interactive.*.title, <media>.id, timestamp`); `statuses[]` → `whatsapp_status` (`id, recipient_id, status, errors[0].{code,title,message,error_data.details}, timestamp`). Inbound messages are de-duplicated on `wa_message_id`. Delivery tracking (sent, delivered, read, failed) is therefore **already implemented**.

Notes for Codex/owner: the bot's reply is hard-coded to `"Hello"`. `GRAPH_VERSION` is `v26.0`, so check it is still supported when you go live. `wa_outbound`, `wa_events`, `wa_contacts` and `whatsapp_webhook_queue` exist but are unused (0 rows).

### 4a. Meta account changes since 2 Nov (from Gmail, sridharrenukunta91@gmail.com)
- **2 Nov 07:12 UTC:** a business portfolio named "Health care notifications" (**Business ID 1440996944155221**) asked to confirm sridharrenukunta91@gmail.com as its email.
- **2 Nov 08:14 UTC:** Facebook says +91 78424 49808 (also the WhatsApp test recipient …9808) was **verified by another Facebook account**. The owner reports this is a new account created for **Pritham Renukunta**.
- **2 Nov 10:38 UTC:** Sridhar's Facebook password was changed.
- **2 Nov 11:44 UTC:** Meta **restricted business 1440996944155221** for "automation that doesn't follow our rules" (account integrity). It cannot run ads or use audiences, and a review can be requested.
- Work has since moved to a Meta setup under Pritham Renukunta's account. No Meta connector exists in this session, so none of this could be inspected directly.

**If the WhatsApp app or WABA moves to Pritham's portfolio**, the Supabase webhook keeps working only if these Edge Function secrets are updated to match the new app (Dashboard → Edge Functions → Secrets):
- `WHATSAPP_APP_SECRET` = the new app's App Secret. If this is wrong, every Meta POST is rejected with 401.
- `WHATSAPP_ACCESS_TOKEN` = a System User token from the new portfolio.
- `WHATSAPP_VERIFY_TOKEN` = the same string typed into the new app's webhook settings.

Then set the callback URL to `…/functions/v1/smooth-responder` and subscribe the **messages** field. The function reads `phone_number_id` from each payload, so new IDs need no code change.

## 5. n8n workflow status

**READY, not deployed** (no VPS).
- `deploy/n8n/docker-compose.yml`: pinned image `n8nio/n8n:1.111.0`, bound to `127.0.0.1`, persistent volume, health check, IST timezone, execution pruning.
- `n8n/workflows/whatsapp-to-google-sheets.json`: Supabase **Database Webhook** → n8n Webhook (header-auth secret) → Switch on table → Sheets **Inbox** / **Delivery** tabs.
  - Design choice: Supabase stays the single Meta webhook receiver, which is already verified. n8n reacts to DB inserts, so Meta config doesn't change and nothing is lost if n8n is down. The rows stay in Postgres.
  - The JSON is valid, but it has **not been imported into a running n8n** here. Codex must import it and run it (§11).

## 6. Google Sheets integration status

**Sheet created and back-filled; live sync waits on n8n (2026-11-04).**
- The spreadsheet **"Fingertip WhatsApp Log"** is in the owner's Drive (sridharrenukunta91@gmail.com): https://docs.google.com/spreadsheets/d/1YiMLL6RcsgUs1Y4YFxqKvDgVYPisHd5DD-JwdhKCTc0/edit. It uses the IST timezone and frozen bold headers.
- **Inbox** tab: all 5 rows from `whatsapp_inbox`. The 2026-09-28 row is Meta's dashboard sample payload.
- **Delivery** tab: all 10 rows from `whatsapp_status`. These are 3 `api_accepted` and 7 `failed` with code 131031.
- The back-fill was a one-time copy taken through the Supabase and Sheets connectors. **New** messages are copied only once the n8n workflow runs (§5). Its spreadsheet ID is already set in `n8n/workflows/whatsapp-to-google-sheets.json`.
- Still needed from the owner: an n8n Google Sheets OAuth credential signed in as sridharrenukunta91@gmail.com.

## 7. Health Connect findings

- Health Connect is an **Android on-device API**. A web app (the Lovable PWA) **cannot read it**. It needs a native Android shell: Capacitor plus a Health Connect plugin, or a small Kotlin companion app. That shell must use minSdk 26, the Health Connect app or SDK (built into Android 14+), the `android.permission.health.READ_*` permissions, and a privacy-policy activity (`ACTION_SHOW_PERMISSIONS_RATIONALE`). Google Play also requires a **Health apps declaration** before release.
- **Steps:** `StepsRecord`. Supported sources include Google Fit / Fitbit, Samsung Health, and most wearables that sync to HC. The phone's own step counter feeds it via Fit or Samsung Health.
- **Heart rate:** `HeartRateRecord`. This needs a wearable (Galaxy Watch, Fitbit, Pixel Watch, Mi Band via Zepp/Mi Fitness sync, etc.). A phone alone does not produce it.
- **Temperature:** `BodyTemperatureRecord` exists, but **few sources write it** (manual entry in some apps, a few smart thermometers). `SkinTemperatureRecord` (Android 15+, some wearables) stores **deltas from baseline**, so it must **never** be stored as body temperature. The adapter skips it.
- **Implemented:** `health-connect/adapter.js` (tested). It maps HC records to live `vital_readings` columns (`source=health_connect, method=measured, origin=device, channel=native_import`, `external_id` for idempotent upsert on the existing unique index `(user_id, source, external_id)`). It **refuses to import** without current `vital_preferences` consent (`enabled`, `consent_version='vital-v1'`, not withdrawn).
- **Schema gap (for Codex):** the live CHECK constraint accepts `health_connect` only for `steps`. `health-connect/proposals/0001_health_connect_vitals.sql` adds pulse and temperature. **It has not been applied** because the database belongs to Codex. Until it is applied, the adapter holds back pulse and temperature and reports why.

## 8. GitHub files and commits changed

Branch `ccr-b3023934-88x2pt`. See `git log main..ccr-b3023934-88x2pt` for the commit hash.

```
M  whatsapp-bot.js                    server repairs (§2)
R  index.html -> public/index.html    route fix + XSS fix
M  package.json                       test script, engines
M  README.md                          rewritten
M  supabase-schema.sql                production warning header
A  .env.example  .gitignore  package-lock.json
A  deploy/nginx/aipharmacy.in.conf
A  deploy/systemd/fingertip-app.service
A  deploy/n8n/docker-compose.yml  deploy/n8n/n8n.env.example
A  deploy/scripts/{deploy,rollback,healthcheck,backup}.sh
A  n8n/workflows/whatsapp-to-google-sheets.json
A  health-connect/adapter.js
A  health-connect/proposals/0001_health_connect_vitals.sql   (proposal, not applied)
A  test/server.test.js  test/health-connect.test.js
A  docs/HANDOVER.md
```
No Supabase schema, Edge Functions, Lovable UI files or secrets were changed.

## 9. Deployment evidence

**No production deployment was performed.** Nothing to deploy to: there is no VPS access and the DNS is parked. Verified locally:
- `npm test` passes 7/7.
- `bash -n` passes on all 4 scripts.
- The n8n workflow JSON parses.

### Runbook (once §10-B/C are done)
```bash
# on the VPS, Ubuntu 22.04/24.04, as a sudoer
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx git curl docker.io docker-compose-v2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo useradd -r -m -d /opt/fingertip fingertip && sudo mkdir -p /etc/fingertip /opt/fingertip/state && sudo chown -R fingertip /opt/fingertip
sudo install -m 600 /dev/null /etc/fingertip/app.env && sudoedit /etc/fingertip/app.env   # values from .env.example
# TLS first, with a temporary port-80-only server (nginx -t fails until the cert files exist)
sudo systemctl stop nginx
sudo certbot certonly --standalone -d aipharmacy.in -d www.aipharmacy.in -d n8n.aipharmacy.in
sudo cp deploy/nginx/aipharmacy.in.conf /etc/nginx/sites-available/ && sudo ln -s ../sites-available/aipharmacy.in.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl start nginx
sudo cp deploy/systemd/fingertip-app.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable fingertip-app
git clone https://github.com/Sridhar-2222/Medical-Store-Final-Complete.git /tmp/fp && sudo /tmp/fp/deploy/scripts/deploy.sh ccr-b3023934-88x2pt
# n8n
sudo mkdir -p /opt/n8n && sudo cp deploy/n8n/docker-compose.yml /opt/n8n/ && sudo cp deploy/n8n/n8n.env.example /opt/n8n/.env && sudoedit /opt/n8n/.env
cd /opt/n8n && sudo docker compose up -d
# monitoring + backups (crontab -e as root)
#  */5 * * * * /opt/fingertip/current/deploy/scripts/healthcheck.sh --full >> /var/log/fingertip-health.log 2>&1
#  15 2 * * *  /opt/fingertip/current/deploy/scripts/backup.sh >> /var/log/fingertip-backup.log 2>&1
```
Certbot renews automatically via its systemd timer. Add `--deploy-hook "systemctl reload nginx"` when you issue the certificate.

Lovable alternative: if aipharmacy.in should serve the **Lovable Rx Fingertip app** instead of this Node app, use Lovable → Project → Settings → Domains → Connect domain. Then follow the A/TXT records Lovable shows, and keep `n8n.aipharmacy.in` pointed at the VPS.

## 10. Blocked tasks and exact user actions

**A. Meta WhatsApp Business Account locked (error 131031): highest priority**
1. Sign in at business.facebook.com as an admin of the "Rx Fingertip" portfolio.
2. Open **Account Quality** (business.facebook.com/accountquality) and choose the WhatsApp account `1098694666453130`. Read the stated reason. Common reasons: an unverified business sending templates, a policy flag, or a payment-method problem.
3. If **Request review** is offered, submit it with an accurate business description. Meta needs a working website: aipharmacy.in is currently a parked page, so publish the Lovable app there first (§9, Lovable alternative).
4. Complete **Business verification**: Security Center → Start verification. Upload GST certificate and bank statement, use the legal name exactly as on GST, add a website on the same domain, and give a phone or email on that domain for the code.
5. In WhatsApp Manager → **Payment methods**, add a card. Unpaid or failed billing is a common cause of locks.
6. If there is no review option, contact Meta Business Support (business.facebook.com/business/help → Get started → WhatsApp → Account restricted).
7. After the unlock, send "hi" from …9808 to the business number. Then check that `whatsapp_status` shows `sent` → `delivered`.

**B. DNS (GoDaddy)**: needed for VPS hosting. In GoDaddy → My Products → aipharmacy.in → DNS:
- Remove the parked **A** records `15.197.148.33` and `3.33.130.190`, and turn off **Forwarding** if it is set.
- Add `A @ <VPS_IP>` (TTL 600), keep `CNAME www → @`, and add `A n8n <VPS_IP>`.
- Alternatively, move NS to Hostinger, but then re-create every record there.
- Add `TXT @` records when Meta (domain verification) or Google asks for them.

**C. Hostinger VPS access**
- hPanel → VPS: write down the IPv4 and OS (Ubuntu 22.04/24.04 recommended), and turn on **snapshots/backups** before any change.
- Run the deployment yourself using §9. Or, for an agent, create a non-root sudo user with an **SSH key** (not a password), allow it in hPanel → VPS → Firewall (22/80/443), and share access through Claude's Remote Control or an approved channel. **Never paste passwords into chat.**

**D. Google Sheets**: the sheet is created (§6). Once n8n runs, go to n8n → Credentials → Google Sheets OAuth2 and sign in as sridharrenukunta91@gmail.com.

**E. Supabase Database Webhooks (after n8n is up)**
- Dashboard → Database → Webhooks → Create:
  - `whatsapp_inbox` INSERT → `POST https://n8n.aipharmacy.in/webhook/fingertip-whatsapp`, header `x-fingertip-secret: <FINGERTIP_WEBHOOK_SECRET>`.
  - Repeat for `whatsapp_status` INSERT.

**F. Permanent WhatsApp token (after the unlock)**
- Business Settings → Users → **System users** → Add (Admin).
- Assign assets: the app "Birds eye view" (Full control) and WABA `1098694666453130`.
- Generate token, choose the app, Expiration **Never**, scopes `whatsapp_business_messaging` and `whatsapp_business_management`.
- Store it **only** as the Supabase secret: Dashboard → Edge Functions → Secrets → `WHATSAPP_ACCESS_TOKEN`. No redeploy is needed.

**G. Real business number and templates**
- WhatsApp Manager → Phone numbers → Add. Use a new SIM that is not registered on the WhatsApp app, verify it by SMS or call, then set a 2-step PIN.
- Register the number via `POST /<PHONE_NUMBER_ID>/register {messaging_product:'whatsapp', pin}`.
- Submit **Utility** templates, for example `order_status_update` and `stock_low_alert`, with `{{1}}` variables. Approval usually takes minutes to 24 h.
- Subscribe the app to the WABA: `POST /1098694666453130/subscribed_apps` with the system-user token, or in App Dashboard → WhatsApp → Configuration → Webhook fields → **messages** ✓.

**H. Health Connect**
- Decide on the Android shell (Capacitor wrapper of the Lovable app is recommended).
- Codex applies `0001_health_connect_vitals.sql`.
- Play Console: Health apps declaration plus a privacy-policy URL on aipharmacy.in.
- Hardware: a wearable is needed for heart rate. No common phone-only source exists for body temperature, so keep the existing OCR and manual thermometer flows.

**I. Payments**: none were found in scope. If Razorpay or Stripe is intended, the owner must complete KYC and add keys as Supabase secrets.

## 11. Handover to Codex: test plan

1. `git checkout ccr-b3023934-88x2pt && npm ci && npm test`: expect 7/7.
2. Run the app against a **separate** test Supabase project, with `supabase-schema.sql` applied there (never on production). Then:
   - Upload a real bill image: expect `success:true` and rows in `medicines`.
   - Point `SUPABASE_URL` at a dead host: expect `/api/medicines` → 502 and `/health/ready` → 503 within 15 s.
   - XSS: insert a medicine named `<img src=x onerror=alert(1)>`. The UI must show it as text.
3. Review `health-connect/proposals/0001_health_connect_vitals.sql` against the live constraint. Apply it in a **branch DB**. Insert the adapter output with the `pulse`/`temperature` schemaSupports option, then confirm that re-inserting the same `external_id` conflicts (dedupe works).
4. After deployment: run `healthcheck.sh --full` and check every line is `OK`. Then stop the app and confirm `deploy.sh` rolls back on a failing health check.
5. n8n: import the workflow, set credentials, then trigger a fake insert into `whatsapp_status` on a **branch DB** or a test row. A row must appear in the `Delivery` tab. Check that a request without the header gets 403.
6. Security: test cross-tenant access on the 71 definer RPCs (§1). Confirm the 3 anon-callable functions are intended.
7. WhatsApp (after §10-A): send an inbound "hi". Expect an `inbox` row, an `api_accepted` row, then `sent`/`delivered` status rows with no `131031`.
