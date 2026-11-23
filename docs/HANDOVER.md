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

## Open decisions (owner)

- [ ] Seller pricing: ₹5 per call, or ₹99–199 a month.
- [ ] Open a missed-call or voice provider account when Phase B or the pilot starts (KYC, prepaid).
