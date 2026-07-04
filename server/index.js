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

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 PanzzStore Server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`🔗 Webhook URL: http://localhost:${PORT}/webhook/pakasir`);
});

module.exports = app;
