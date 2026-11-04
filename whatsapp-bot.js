require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ---------------------------------------------------------------------------
// Configuration (fail fast on missing secrets instead of crashing mid-request)
// ---------------------------------------------------------------------------
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_KEY', 'GOOGLE_API_KEY'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}. See .env.example`);
  process.exit(1);
}

const PORT = Number(process.env.PORT || 10000);
const HOST = process.env.HOST || '0.0.0.0'; // use 127.0.0.1 behind Nginx
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MEDICINES_TABLE = process.env.MEDICINES_TABLE || 'medicines';
const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 10);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 10);
// The unofficial WhatsApp-Web (Baileys) bot is OFF by default. The platform's
// official channel is the Meta WhatsApp Cloud API webhook (Supabase function
// `smooth-responder`). Linking a personal number via Baileys can get it banned.
const ENABLE_BAILEYS_BOT = process.env.ENABLE_BAILEYS_BOT === 'true';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// ---------------------------------------------------------------------------
// Bill reading + stock update
// ---------------------------------------------------------------------------
function parseModelJson(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : [];
}

function normaliseMedicine(m) {
  const name = String(m?.name || '').trim();
  if (!name) return null;
  const qty = Number.parseInt(m.qty, 10);
  const mrp = Number.parseFloat(m.mrp);
  const expiry = /^\d{4}-\d{2}-\d{2}$/.test(String(m.expiry || '')) ? m.expiry : null;
  return {
    name: name.slice(0, 200),
    batch: String(m.batch || '').trim().slice(0, 60),
    qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
    mrp: Number.isFinite(mrp) && mrp >= 0 ? mrp : null,
    expiry,
  };
}

async function readBillWithGemini(buffer, mime = 'image/jpeg') {
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const prompt = 'Extract medicines from this medical bill. Return ONLY a JSON array like '
      + '[{"name":"Paracetamol 500mg","qty":20,"mrp":15,"batch":"B123","expiry":"2026-12-01"}]. '
      + 'If it is not a medical bill return [].';
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: buffer.toString('base64'), mimeType: mime } },
    ]);
    return parseModelJson(result.response.text()).map(normaliseMedicine).filter(Boolean);
  } catch (e) {
    console.error('Gemini error:', e.message);
    return [];
  }
}

async function saveToStock(medicines) {
  let saved = 0;
  for (const med of medicines) {
    const { data: existing, error: selErr } = await supabase
      .from(MEDICINES_TABLE).select('id, quantity, mrp')
      .eq('name', med.name).eq('batch', med.batch).maybeSingle();
    if (selErr) throw new Error(`stock lookup failed: ${selErr.message}`);
    const now = new Date().toISOString();
    const { error } = existing
      ? await supabase.from(MEDICINES_TABLE).update({
        quantity: (existing.quantity || 0) + med.qty,
        mrp: med.mrp ?? existing.mrp,
        updated_at: now,
      }).eq('id', existing.id)
      : await supabase.from(MEDICINES_TABLE).insert({
        name: med.name, batch: med.batch, quantity: med.qty,
        mrp: med.mrp ?? 0, expiry: med.expiry, updated_at: now,
      });
    if (error) throw new Error(`stock save failed: ${error.message}`);
    saved += 1;
  }
  return saved;
}

// ---------------------------------------------------------------------------
// HTTP app
// ---------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(cors(CORS_ORIGINS.length ? { origin: CORS_ORIGINS } : undefined));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/|^application\/pdf$/.test(file.mimetype)),
});

app.post('/api/upload-bill', upload.single('bill'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'Attach an image or PDF in field "bill"' });
  try {
    const medicines = await readBillWithGemini(req.file.buffer, req.file.mimetype);
    const count = medicines.length ? await saveToStock(medicines) : 0;
    res.json({ success: true, count, medicines });
  } catch (e) {
    console.error('upload-bill:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/medicines', async (req, res) => {
  const { data, error } = await supabase.from(MEDICINES_TABLE).select('*').order('updated_at', { ascending: false });
  if (error) return res.status(502).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/low-stock', async (req, res) => {
  const { data, error } = await supabase.from(MEDICINES_TABLE).select('*').lt('quantity', LOW_STOCK_THRESHOLD);
  if (error) return res.status(502).json({ error: error.message });
  res.json(data || []);
});

// Liveness: process is up. Used by Nginx/uptime monitors.
app.get('/health', (req, res) => res.json({ status: 'ok', uptime_s: Math.round(process.uptime()) }));

// Readiness: dependencies reachable. Used by deploy.sh before switching traffic.
app.get('/health/ready', async (req, res) => {
  const started = Date.now();
  const { error } = await Promise.race([
    supabase.from(MEDICINES_TABLE).select('id', { head: true, count: 'exact' }).limit(1),
    new Promise((r) => setTimeout(() => r({ error: { message: 'supabase timeout' } }), 5000)),
  ]);
  const body = {
    status: error ? 'degraded' : 'ok',
    supabase: error ? `error: ${error.message}` : 'ok',
    whatsapp_bot: ENABLE_BAILEYS_BOT ? botState : 'disabled',
    latency_ms: Date.now() - started,
    host: os.hostname(),
  };
  res.status(error ? 503 : 200).json(body);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(413).json({ success: false, error: err.message });
  console.error(err);
  res.status(500).json({ success: false, error: 'internal error' });
});

// ---------------------------------------------------------------------------
// Optional legacy WhatsApp-Web bot (Baileys) — disabled unless explicitly enabled
// ---------------------------------------------------------------------------
let botState = 'not_started';

async function startBot() {
  const {
    default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage,
  } = require('@whiskeysockets/baileys');
  const authDir = process.env.BAILEYS_AUTH_DIR || path.join(__dirname, 'auth_info_final');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const sock = makeWASocket({ auth: state, browser: ['Medical Store', 'Chrome', '1.0'] });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      botState = 'awaiting_qr';
      require('qrcode-terminal').generate(qr, { small: true });
      console.log('Scan this QR: WhatsApp > Linked Devices > Link a Device');
    }
    if (connection === 'close') {
      botState = 'disconnected';
      const loggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
      if (!loggedOut) setTimeout(startBot, 5000);
    } else if (connection === 'open') {
      botState = 'connected';
      console.log('WhatsApp-Web bot connected');
    }
  });
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg?.message || msg.key.fromMe) return;
    const type = Object.keys(msg.message)[0];
    if (type !== 'imageMessage' && type !== 'documentMessage') return;
    const from = msg.key.remoteJid;
    const mime = msg.message[type]?.mimetype || 'image/jpeg';
    try {
      await sock.sendMessage(from, { text: 'Reading bill...' });
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      const medicines = await readBillWithGemini(buffer, mime);
      if (!medicines.length) {
        await sock.sendMessage(from, { text: 'Could not read. Send a clear photo of the medical bill.' });
        return;
      }
      await saveToStock(medicines);
      let reply = `*STOCK UPDATED - ${medicines.length} items*\n\n`;
      medicines.slice(0, 10).forEach((x) => { reply += `• ${x.name} - ${x.qty}\n`; });
      if (medicines.length > 10) reply += `+${medicines.length - 10} more...\n`;
      await sock.sendMessage(from, { text: reply });
    } catch (err) {
      console.error('bot message error:', err.message);
      await sock.sendMessage(from, { text: 'Error. Try again with a clear image.' }).catch(() => {});
    }
  });
}

if (require.main === module) {
  const server = app.listen(PORT, HOST, () => console.log(`Web app listening on http://${HOST}:${PORT}`));
  if (ENABLE_BAILEYS_BOT) {
    console.warn('ENABLE_BAILEYS_BOT=true: starting unofficial WhatsApp-Web bot.');
    startBot().catch((e) => { botState = `error: ${e.message}`; console.error(e); });
  }
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { app, parseModelJson, normaliseMedicine };
