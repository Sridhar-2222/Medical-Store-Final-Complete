MEDICAL STORE - FINAL READY TO USE APP
=====================================

THIS IS COMPLETE APP - WEB + WHATSAPP

WHAT YOU GET:
- Web App to view stock, upload bills
- WhatsApp bot - forward bill photo -> auto stock update
- Handles 50 bills/day

DEPLOY IN 10 MINUTES:
---------------------
1. Go to github.com -> New Repo -> medical-final-complete -> Upload ALL files from ZIP
2. Go to render.com -> New Web Service -> Connect your repo
   Build Command: npm install
   Start Command: node whatsapp-bot.js
   Environment: Node
3. Add 3 Environment Variables (from .env.example):
   SUPABASE_URL
   SUPABASE_KEY
   GOOGLE_API_KEY
4. Deploy -> Wait 2 min -> Open LOGS -> QR CODE will appear
5. WhatsApp on Phone -> Settings -> Linked Devices -> Link a Device -> Scan QR

DONE! 

NOW USE:
- Web: Your render link (https://your-app.onrender.com)
- WhatsApp: Just send bill photo to yourself, bot will reply "Stock Updated"

DATABASE SETUP (One time):
- Go to supabase.com -> SQL Editor -> Paste content of supabase-schema.sql -> Run

SEVA - LIST WORKERS WITH NO SMARTPHONE:
- Open https://your-app.onrender.com/seva
- Chemist fills name, phone, work, area, ticks the worker's spoken consent -> listed
- Customers search by work/area and tap Call
- Optional env: SEVA_HELPER_PIN (PIN needed to add/remove), SEVA_STORE=supabase (after running supabase/migrations/20261123000000_seva_workers.sql)

SEVA - MISSED CALLS FROM ELDERS:
- Open https://your-app.onrender.com/seva/calls (helper PIN)
- Family registers an elder once (name, phone, area, consent)
- Elder gives a missed call -> shows in Waiting with name and area -> helper taps Call back -> Done
- No provider yet? Helpers add numbers they see on their own phone.
- With a provider: set SEVA_MISSED_CALL_TOKEN, give them https://your-app.onrender.com/api/seva/missed-calls/hook?token=YOUR_TOKEN
- Details: docs/HANDOVER.md

Need help? Reply "Deploy help"
