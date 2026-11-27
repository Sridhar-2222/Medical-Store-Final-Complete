# Jobs Page (pharmacy and health workers)

A phone-first jobs page. Candidates make a resume, employers make a firm card and post jobs,
and nobody's phone number is shown until both sides agree.

## How it works

1. **Poster, not just a link.** *Make poster* (page) and *Job poster* (each job) make a
   1080 × 1350 image with the name, roles or job, a **QR code** and the short link
   (`/j` for the page, `/j/abc123` for a job). Share it to a WhatsApp status, group or Instagram.
   The QR still works after a screenshot or re-forward.
2. **Candidate:** *Resume* (photo, name, role, years, town, qualification, languages, filled by
   speaking one sentence or typing), *My words* (spoken or typed note) and an optional
   experience certificate (photo or PDF). Phone saved but hidden.
3. **Employer:** *Firm card* (name, type, town, optional logo, one-line about; no contact shown).
   Jobs are posted by voice or typing.
4. **Codes.** An application gets a code like **HJ-4821**. The employer sees the code, photo,
   resume details and *My words*. The candidate sees the firm card and job.
5. **Getting in touch.** Employer taps **Shortlist** → candidate gets an alert (in the app, and
   as a phone notification if they turned alerts on). Candidate taps **Share my number** → only
   then do both see each other's numbers, with Call and WhatsApp buttons.
   Notification text never carries personal details.

### Privacy defaults (the two open choices)

| Before shortlisting the employer sees… | Default | Change with |
|---|---|---|
| Candidate's **name** | No: code + photo only | `JOBS_NAME_BEFORE_SHORTLIST=yes` |
| **Experience certificate** | No: only after shortlisting | `JOBS_CERT_BEFORE_SHORTLIST=yes` |

These rules are enforced by the server, not just hidden on screen. Photos, logos and
certificates are served only through short-lived signed links given to people allowed to see them.

## Run

```bash
cd jobs-app
npm install
JOBS_ADMIN_PIN=2468 PUBLIC_URL=https://your-domain npm start   # http://localhost:8080/j
npm test
```

| Variable | Meaning |
|---|---|
| `JOBS_ADMIN_PIN` | PIN for `/admin` (page name, town, roles, counts). Required to use admin. |
| `PUBLIC_URL` | The address printed on posters and QR codes, e.g. `https://jobs.example.in`. |
| `PORT` | Default 8080. |
| `JOBS_DATA_DIR` | Where data and uploads are kept. Default `jobs-app/data`. Use a persistent disk. |
| `VAPID_SUBJECT` | Optional `mailto:` for phone notifications. Keys are generated and stored automatically. |

Phone notifications need the site on **https** (any normal host gives you that).

## Pages

- `/j`: the jobs page (public)
- `/j/<code>`: one job (public), with *Apply*
- `/j#/join`, `/j#/login`: join with phone + 4-digit PIN, as candidate or employer
- `/j#/my`: candidate (Resume · My words · My jobs)
- `/j#/firm`: employer (Firm card · Post job · Applications)
- `/j#/alerts`: alerts, phone notifications on/off, log out
- `/admin`: admin

## Storage

Data is kept in one JSON file plus an `uploads/` folder in `JOBS_DATA_DIR`, so no database
change is needed to start. Moving it into Supabase later is a separate step and needs your OK.
