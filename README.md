# Medical Store app (Fingertip / aipharmacy.in)

Small Node/Express app: upload a medical bill photo or PDF, have Gemini read it, and add the lines to stock in Supabase.

> The main Rx Fingertip platform is the Lovable app plus the Supabase project `fsftbvchnifshndssowe`.
> This repo holds this standalone stock app, the VPS deployment kit, the n8n workflow and the Health Connect adapter.
> Full status, blockers and next steps: **[docs/HANDOVER.md](docs/HANDOVER.md)**.

## Run locally

```bash
cp .env.example .env     # fill SUPABASE_URL, SUPABASE_KEY, GOOGLE_API_KEY
npm install
npm test
npm start                # http://localhost:10000
```

| Route | Purpose |
|---|---|
| `GET /` | Web UI (`public/index.html`) |
| `POST /api/upload-bill` | multipart field `bill` (image or PDF, max 10 MB) |
| `GET /api/medicines`, `GET /api/low-stock` | Stock list |
| `GET /health` | Liveness check |
| `GET /health/ready` | Readiness check (Supabase reachable) |

## WhatsApp

The official channel is the **Meta WhatsApp Cloud API**. Its webhook is the Supabase Edge Function `smooth-responder`.
The old Baileys (WhatsApp-Web QR) bot in this app is **disabled by default**. Linking a personal number through an unofficial client can get the number banned. Turn it on only deliberately, with `ENABLE_BAILEYS_BOT=true`.

## Deploy to a VPS (Hostinger)

See `deploy/` and the runbook in `docs/HANDOVER.md` §7. It covers Nginx with TLS for `aipharmacy.in` and `n8n.aipharmacy.in`, a systemd service, n8n in Docker, `deploy.sh` (automatic rollback if the health check fails), `rollback.sh`, `healthcheck.sh` (cron monitoring) and `backup.sh` (nightly).
