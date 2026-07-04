const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const {
  getAllOrders, getOrderStats, getAllStock, deleteStockCategory,
  updateOrderStatus, addAccount, getPrices, updatePrices, db
} = require('../firebase');
const { uploadFileToTelegram } = require('../telegramStorage');

// Multer for file uploads (temp storage)
const upload = multer({
  dest: path.join(__dirname, '../../storage/temp-uploads/'),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── VALIDATE TELEGRAM initData ───────────────────────────────────────────────
function validateTelegramInitData(initData) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN).digest();
    const computedHash = crypto.createHmac('sha256', secretKey)
      .update(dataCheckString).digest('hex');
    return computedHash === hash;
  } catch { return false; }
}

// ─── LOGIN (web dashboard) ───────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true, token: process.env.ADMIN_SECRET_KEY });
  } else {
    res.status(401).json({ error: 'Password salah' });
  }
});

// ─── MINIAPP AUTH (validate Telegram initData) ────────────────────────────────
router.post('/miniapp-auth', (req, res) => {
  const { initData } = req.body;
  if (!initData) return res.status(400).json({ error: 'No initData' });

  const valid = validateTelegramInitData(initData);
  if (!valid) return res.status(403).json({ error: 'Invalid initData' });

  // Check if user is admin
  const params = new URLSearchParams(initData);
  const userJson = params.get('user');
  if (!userJson) return res.status(403).json({ error: 'No user' });

  const user = JSON.parse(userJson);
  const adminIds = (process.env.ADMIN_TELEGRAM_ID || '').split(',').map(s => s.trim());
  if (!adminIds.includes(String(user.id))) {
    return res.status(403).json({ error: 'Not admin' });
  }

  res.json({ success: true, token: process.env.ADMIN_SECRET_KEY });
});

// ─── STATS ────────────────────────────────────────────────────────────────────
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [stats, stock] = await Promise.all([getOrderStats(), getAllStock()]);
    res.json({ stats, stock });
  } catch (e) {
    console.error('Stats error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── ORDERS ───────────────────────────────────────────────────────────────────
router.get('/orders', adminAuth, async (req, res) => {
  try {
    const orders = await getAllOrders(100);
    res.json({ orders });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/orders/:id/confirm', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await updateOrderStatus(id, 'paid');

    // Manual delivery trigger
    const { deliverOrder } = require('../../bot/handlers/order');
    const botModule = require('../../bot/index');
    deliverOrder(botModule.bot, id).catch(console.error);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── STOCK / ACCOUNTS ─────────────────────────────────────────────────────────
router.get('/stock', adminAuth, async (req, res) => {
  try {
    const stock = await getAllStock();
    res.json({ stock });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete all stock for a specific category
router.delete('/stock', adminAuth, async (req, res) => {
  try {
    const { type, garansi } = req.body;
    if (!type || garansi === undefined) {
      return res.status(400).json({ error: 'type and garansi required' });
    }
    const garansiBool = garansi === 'true' || garansi === true;
    await deleteStockCategory(type, garansiBool);
    res.json({ success: true });
  } catch (e) {
    console.error('Delete stock error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Upload account files ke Telegram Storage
router.post('/stock/upload', adminAuth, upload.array('files', 500), async (req, res) => {
  try {
    const { type, garansi } = req.body;
    if (!type || garansi === undefined) {
      return res.status(400).json({ error: 'type and garansi required' });
    }
    const garansiBool = garansi === 'true' || garansi === true;
    const results = [];
    const errors = [];

    for (const file of req.files) {
      let telegramFileId = null;

      try {
        // Upload file temp ke Telegram Channel
        telegramFileId = await uploadFileToTelegram(
          file.path,
          file.originalname
        );

        // Simpan ke Firestore dengan telegramFileId
        await addAccount(type, garansiBool, telegramFileId, file.originalname);

        results.push({ fileName: file.originalname, telegramFileId });
      } catch (uploadErr) {
        console.error(`Failed to upload ${file.originalname}:`, uploadErr.message);
        errors.push({ fileName: file.originalname, error: uploadErr.message });
      } finally {
        // Hapus temp file lokal setelah upload (berhasil atau tidak)
        try { fs.unlinkSync(file.path); } catch (_) {}
      }
    }

    res.json({
      success: errors.length === 0,
      uploaded: results.length,
      failed: errors.length,
      results,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PRICES ───────────────────────────────────────────────────────────────────
router.get('/prices', adminAuth, async (req, res) => {
  try {
    const prices = await getPrices();
    res.json({ prices });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/prices', adminAuth, async (req, res) => {
  try {
    const { prices } = req.body;
    await updatePrices(prices);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── REALTIME ORDERS (long-poll / snapshot for dashboard) ─────────────────────
router.get('/orders/stream', adminAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const unsubscribe = db.collection('orders')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(snapshot => {
      const orders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      res.write(`data: ${JSON.stringify(orders)}\n\n`);
    });

  req.on('close', () => unsubscribe());
});

module.exports = router;
