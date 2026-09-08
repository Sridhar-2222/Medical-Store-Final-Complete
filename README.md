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

Need help? Reply "Deploy help"
