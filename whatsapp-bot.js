require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 10000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function readBillWithGemini(imagePath, mime = "image/jpeg") {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const imageData = fs.readFileSync(imagePath, { encoding: "base64" });
    const prompt = `Extract medicines from this medical bill. Return ONLY JSON array: [{"name":"Paracetamol 500mg","qty":20,"mrp":15,"batch":"B123","expiry":"2026-12-01"}] If not medical bill return [].`;
    const result = await model.generateContent([prompt, { inlineData: { data: imageData, mimeType: mime } }]);
    let text = result.response.text().replace(/\`\`\`json|\`\`\`/g, "").trim();
    return JSON.parse(text);
  } catch (e) {
    console.error("Gemini Error", e.message);
    return [];
  }
}

async function saveToStock(medicines) {
  for (let med of medicines) {
    const { data: existing } = await supabase.from('medicines').select('*').eq('name', med.name).eq('batch', med.batch || '').maybeSingle();
    if (existing) {
      await supabase.from('medicines').update({ quantity: existing.quantity + (parseInt(med.qty) || 0), mrp: med.mrp || existing.mrp, updated_at: new Date() }).eq('id', existing.id);
    } else {
      await supabase.from('medicines').insert({ name: med.name, batch: med.batch || '', quantity: parseInt(med.qty) || 0, mrp: med.mrp || 0, expiry: med.expiry || null, updated_at: new Date() });
    }
  }
}

// Web Upload API
const multer = require('multer');
const upload = multer({ dest: '/tmp/' });
app.post('/api/upload-bill', upload.single('bill'), async (req, res) => {
  try {
    const medicines = await readBillWithGemini(req.file.path, req.file.mimetype);
    if (medicines.length) await saveToStock(medicines);
    fs.unlinkSync(req.file.path);
    res.json({ success: true, count: medicines.length, medicines });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/medicines', async (req, res) => {
  const { data } = await supabase.from('medicines').select('*').order('updated_at', { ascending: false });
  res.json(data || []);
});

app.get('/api/low-stock', async (req, res) => {
  const { data } = await supabase.from('medicines').select('*').lt('quantity', 10);
  res.json(data || []);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/health', (req, res) => res.send('Medical Bot Running ✅'));

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_final');
  const sock = makeWASocket({ auth: state, printQRInTerminal: true, browser: ["Medical Store", "Chrome", "1.0"] });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) console.log("\n\n🔳 SCAN THIS QR: WhatsApp > Linked Devices > Link Device\n\n");
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log("✅ WHATSAPP CONNECTED - READY FOR 50 BILLS/DAY");
    }
  });
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;
    const type = Object.keys(msg.message)[0];
    if (type === 'imageMessage' || type === 'documentMessage') {
      const from = msg.key.remoteJid;
      await sock.sendMessage(from, { text: "📄 Reading bill... 10 sec..." });
      try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: console });
        const tempPath = `/tmp/${Date.now()}.jpg`;
        fs.writeFileSync(tempPath, buffer);
        const medicines = await readBillWithGemini(tempPath);
        if (medicines.length === 0) {
          await sock.sendMessage(from, { text: "❌ Could not read. Send clear photo of medical bill." });
        } else {
          await saveToStock(medicines);
          let reply = `✅ *STOCK UPDATED - ${medicines.length} items*\n\n`;
          medicines.slice(0, 10).forEach(m => reply += `• ${m.name} - ${m.qty}\n`);
          if (medicines.length > 10) reply += `+${medicines.length - 10} more...\n`;
          reply += "\nCheck web app: medicines updated.";
          await sock.sendMessage(from, { text: reply });
        }
        fs.unlinkSync(tempPath);
      } catch (err) {
        await sock.sendMessage(from, { text: "⚠️ Error. Try again with clear image." });
      }
    }
  });
}

app.listen(PORT, () => { console.log(`Web App: http://localhost:${PORT}`); });
startBot();
