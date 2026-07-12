require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
process.env.NTBA_FIX_350 = '1';
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── ROUTES ───────────────────────────────────────────────────────────────────
const adminRoutes = require('./routes/admin');
const { router: webhookRouter, setBotInstance } = require('./routes/webhook');

app.use('/api/admin', adminRoutes);
app.use('/webhook', webhookRouter);

// ─── SERVE DASHBOARD ──────────────────────────────────────────────────────────
function serveHtmlWithStoreName(filePath, extraReplace = null) {
  return (req, res) => {
    let html = require('fs').readFileSync(filePath, 'utf8');
    const storeName = process.env.STORE_NAME || 'PanzzStore';
    html = html.replace(/PanzzStore/g, storeName);
    if (extraReplace) {
      html = extraReplace(html);
    }
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  };
}

app.use('/dashboard', express.static(path.join(__dirname, '../dashboard'), { index: false }));

// Expose public static downloads folder with auto-cleanup task (hanya dijalankan jika bukan di Vercel)
const fs = require('fs');
if (process.env.VERCEL !== '1') {
  const downloadsDir = path.join(__dirname, '../storage/downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }
  app.use('/downloads', express.static(downloadsDir));

  setInterval(() => {
    try {
      const files = fs.readdirSync(downloadsDir);
      const now = Date.now();
      const expiryTime = 24 * 60 * 60 * 1000; // 24 hours

      files.forEach(file => {
        const filePath = path.join(downloadsDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > expiryTime) {
          fs.unlinkSync(filePath);
          console.log(`🧹 Auto-cleaned old download file: ${file}`);
        }
      });
    } catch (err) {
      console.error('Auto-cleanup error:', err.message);
    }
  }, 60 * 60 * 1000); // Check every hour
}

app.get('/', (req, res) => res.redirect('/miniapp'));

// Serve Mini App (inject ADMIN_IDS so frontend can do local check)
app.get('/miniapp', serveHtmlWithStoreName(path.join(__dirname, '../dashboard/miniapp.html'), (html) => {
  return html.replace(
    'window.__ADMIN_IDS__ || \'\'',
    `'${process.env.ADMIN_TELEGRAM_ID || ''}'`
  );
}));

// ─── START BOT ────────────────────────────────────────────────────────────────
const { bot } = require('../bot/index');
setBotInstance(bot);

// Setup Telegram Webhook — JANGAN dipanggil saat cold start (memperlambat inisialisasi Vercel).
// Gunakan endpoint GET /webhook/setup untuk mendaftarkan webhook 1x setelah deploy.
app.get('/webhook/setup', async (req, res) => {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    return res.status(400).json({ error: 'BASE_URL belum diset di environment variables.' });
  }
  let formattedBaseUrl = baseUrl.trim();
  if (!formattedBaseUrl.startsWith('http://') && !formattedBaseUrl.startsWith('https://')) {
    formattedBaseUrl = `https://${formattedBaseUrl}`;
  }
  const webhookUrl = `${formattedBaseUrl}/webhook/telegram`;
  try {
    await bot.setWebHook(webhookUrl);
    res.json({ success: true, message: `✅ Webhook Telegram berhasil diset ke: ${webhookUrl}` });
  } catch (err) {
    res.status(500).json({ error: `❌ Gagal set webhook: ${err.message}` });
  }
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 PanzzStore Server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`🔗 Webhook URL: http://localhost:${PORT}/webhook/pakasir`);
});

module.exports = app;
