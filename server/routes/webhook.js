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

    // Deliver the order (AWAIT on Vercel so the serverless function stays alive until delivery is complete)
    if (botInstance) {
      await deliverOrder(botInstance, order.id).catch(console.error);
    }

    res.json({ success: true, orderId: order.id });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /webhook/telegram - Mendengarkan update dari Telegram (Webhook mode)
router.post('/telegram', async (req, res) => {
  try {
    if (botInstance) {
      botInstance.processUpdate(req.body);

      // PENTING untuk Vercel Serverless:
      // processUpdate() memicu handler async (misalnya sendMessage ke Telegram API).
      // Jika kita langsung mengirimkan respon, Vercel akan langsung membekukan (freeze)
      // container node sebelum bot sempat menyelesaikan pengiriman pesan.
      // Kita tahan proses ini selama 3.5 detik sebelum mengirim respon 200 ke Telegram.
      if (process.env.VERCEL === '1') {
        await new Promise(resolve => setTimeout(resolve, 3500));
      }
    }
  } catch (err) {
    console.error('Telegram Webhook Route Error:', err.message);
  }

  // Kirim status 200 di paling akhir agar Vercel tidak melakukan freeze prematur
  res.sendStatus(200);
});

module.exports = { router, setBotInstance };
