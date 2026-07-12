const express = require('express');
const router = express.Router();
const { getOrderByPakasirId, updateOrderStatus } = require('../firebase');
const { deliverOrder } = require('../../bot/handlers/order');

let botInstance = null;
function setBotInstance(bot) { botInstance = bot; }

// Pakasir sends a POST webhook when payment is confirmed
router.post('/pakasir', async (req, res) => {
  try {
    const { order_id, status, project } = req.body;

    // Verify project slug (since API key is not sent in webhook)
    if (project !== process.env.PAKASIR_SLUG) {
      return res.status(403).json({ error: 'Invalid project slug' });
    }

    if (status !== 'completed' && status !== 'paid' && status !== 'success') {
      return res.json({ message: 'Status ignored' });
    }

    // Find order
    const order = await getOrderByPakasirId(order_id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status === 'done' || order.status === 'processing') {
      return res.json({ message: 'Already processed' });
    }

    // Update status to paid
    await updateOrderStatus(order.id, 'paid');

    // Deliver the order (async, don't await so webhook responds fast)
    if (botInstance) {
      deliverOrder(botInstance, order.id).catch(console.error);
    }

    res.json({ success: true, orderId: order.id });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /webhook/telegram - Mendengarkan update dari Telegram (Webhook mode)
router.post('/telegram', async (req, res) => {
  // Kirim 200 ke Telegram segera agar tidak retry
  res.sendStatus(200);

  try {
    if (botInstance) {
      botInstance.processUpdate(req.body);

      // PENTING untuk Vercel Serverless:
      // processUpdate() memicu handler async (misalnya sendMessage ke Telegram API).
      // Jika function langsung freeze setelah res.send(), handler belum selesai
      // dan bot tidak akan membalas chat user.
      // Kita tahan function tetap hidup selama 7 detik agar proses async selesai.
      if (process.env.VERCEL === '1') {
        await new Promise(resolve => setTimeout(resolve, 7000));
      }
    }
  } catch (err) {
    console.error('Telegram Webhook Route Error:', err.message);
  }
});

module.exports = { router, setBotInstance };
