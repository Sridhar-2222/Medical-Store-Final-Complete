# Seva hand-over

Each step adds a dated line below. Ask the owner before any database change, merge or deploy.

## Log

- **2026-11-23 — Chemist registers a worker (built, not deployed).** Branch `ccr-6b283cd0-ginnk8`.
  - Page `/seva` (`seva.html`): a chemist or helper lists a person with no smartphone (name, basic phone, work, area, who listed them). A spoken-consent box with the script in English and Telugu is required. The same page has a search with 📞 Call (`tel:` link), "Mark free today" and Remove.
  - API under `/api/seva` (`seva/routes.js`): `POST /workers`, `GET /workers?area=&work=`, `POST /workers/:id/free-today`, `DELETE /workers/:id`, `GET /work-types`. Search is public and returns only name, work, area, phone and free-today. Writes need the header `x-helper-pin` when `SEVA_HELPER_PIN` is set.
  - Rules in code: 10-digit Indian mobile numbers only; one active listing per number; removal is a soft delete, so the person can be listed again; "free today" resets at Indian midnight.
  - Storage: a local JSON file (`data/seva-workers.json`, git-ignored) by default. **Not durable on Render's free plan**: the file is lost on redeploy.
  - Database: `supabase/migrations/20261123000000_seva_workers.sql` is written but **not applied**. After the owner approves and runs it, set `SEVA_STORE=supabase` and use a service-role `SUPABASE_KEY` (the table has RLS on with no policies).
  - Tests: `npm test` (5 pass: phone formats, validation, India date, full register/search/free/remove flow, helper PIN).
  - Open: set `SEVA_HELPER_PIN` before going live; decide whether search should stay public; apply the migration.
- **2026-11-23 — Missed-call list for helpers (built, not deployed).** Same branch, so it joins PR #2.
  - Page `/seva/calls` (`seva-calls.html`), helper PIN needed to see anything:
    - **Waiting list:** oldest first, with the elder's name, area and usual needs (or "Unknown caller"), how many times they rang, and 📞 Call back. Buttons: "Done – spoke to them" (asks for an optional note) and "No answer" (counts the attempt, keeps it waiting). Shows "Call family" when a family number was given.
    - Today's finished calls stay below, greyed, with who called back. The list refreshes every 30 s.
    - **Add a missed call:** a helper types a number they saw on their own phone. This is the free, day-one path.
    - **Register an elder:** name, phone, area, usual needs, who registered, optional family phone, consent box (English + Telugu).
  - API (`seva/calls-routes.js`, logic in `seva/calls.js`): `GET|POST /api/seva/missed-calls/hook?token=…` (provider webhook; reads `CallFrom`, `From`, `from` or `caller`; JSON, form or query), `POST /missed-calls`, `GET /missed-calls?area=`, `POST /missed-calls/:id/result`, `POST|GET /callers`, `DELETE /callers/:id`.
  - Rules in code: a repeat ring from a number already waiting bumps its count instead of adding a row. Once one helper marks it done, a second gets "Someone already called back". A new ring after that starts a new entry. Done calls drop off at Indian midnight.
  - Every read and write needs `SEVA_HELPER_PIN` when it is set; these are elders' numbers, so **set it before going live**. The webhook is off (503) until `SEVA_MISSED_CALL_TOKEN` is set; give the provider the URL `https://<server>/api/seva/missed-calls/hook?token=<token>`.
  - Database: `supabase/migrations/20261123010000_seva_missed_calls.sql` (tables `seva_callers`, `seva_missed_calls`) is written but **not applied**. Until then data lives in `data/` files.
  - Tests: `npm test` now runs 11 (6 new: provider number formats, consent, IST day start, list order, full webhook → repeat → no answer → done flow, PIN and token guards). Page checked in a phone-sized browser.
  - Not tested: a real provider's webhook (no account yet) and the Supabase store.

## Open decisions (owner)

- [ ] Seller pricing: ₹5 per call, or ₹99–199 a month.
- [ ] Open a missed-call or voice provider account when Phase B or the pilot starts (KYC, prepaid).
