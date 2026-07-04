const { getUser, createOrder } = require('../../server/firebase');
const { getSession, clearSession } = require('../sessions');
const { escapeHTML, editMain, formatRupiah } = require('../utils');
const storeName = process.env.STORE_NAME || 'PanzzStore';
const axios = require('axios');

// ─── MAIN SALDO MENU ──────────────────────────────────────────────────────────
async function handleSaldo(bot, chatId, messageId, from) {
  const user   = await getUser(chatId).catch(() => null);
  const saldo  = user?.saldo || 0;
  const orders = user?.totalOrders || 0;
  const name   = escapeHTML(from?.first_name || from?.username || 'Pengguna');

  const text = `💰 <b>Saldo Kamu</b>

<blockquote>👤 <b>${name}</b>
💵 Saldo: <b>Rp ${formatRupiah(saldo)}</b>
📦 Total Order: <b>${orders} order</b></blockquote>

<i>Saldo dapat digunakan untuk pembelian berikutnya.</i>`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '💳 Top Up Saldo', callback_data: 'saldo_topup' }
      ],
      [{ text: '🔙 Menu Utama', callback_data: 'back_menu' }],
    ],
  };

  await editMain(bot, chatId, text, keyboard, messageId);
}

// ─── TOP UP MENU (SELECTION) ──────────────────────────────────────────────────
async function handleTopUpMenu(bot, chatId, messageId) {
  const text = `💳 <b>Top Up Saldo ${storeName}</b>

<blockquote>Silakan pilih nominal top up cepat di bawah ini atau masukkan jumlah custom sesuai keinginan Anda.
Minimal top up adalah <b>Rp 10.000</b>.</blockquote>`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: 'Rp 10.000', callback_data: 'topup_amt_10000' },
        { text: 'Rp 20.000', callback_data: 'topup_amt_20000' },
      ],
      [
        { text: 'Rp 50.000', callback_data: 'topup_amt_50000' },
        { text: 'Rp 100.000', callback_data: 'topup_amt_100000' },
      ],
      [
        { text: '✍️ Custom Jumlah', callback_data: 'topup_custom' }
      ],
      [{ text: '🔙 Kembali', callback_data: 'menu_saldo' }],
    ],
  };

  await editMain(bot, chatId, text, keyboard, messageId);
}

// ─── CUSTOM TOP UP INPUT STATE ────────────────────────────────────────────────
async function handleTopUpCustom(bot, chatId, messageId) {
  const session = getSession(chatId);
  session.waitingForTopUpAmt = true;
  session.mainMessageId = messageId;

  const text = `✍️ <b>Custom Top Up Saldo</b>

<blockquote>Silakan ketik langsung jumlah nominal saldo yang ingin kamu isi.
<i>(Contoh: ketik 15000 untuk melakukan top up Rp 15.000)</i>

<b>Catatan:</b> Minimal nominal adalah <b>Rp 10.000</b>.</blockquote>`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Kembali', callback_data: 'saldo_topup' }]
    ]
  };

  await editMain(bot, chatId, text, keyboard, messageId);
}

// ─── PROCESS TOP UP (PAYMENT LINK GENERATION) ─────────────────────────────────
async function handleProcessTopUp(bot, chatId, messageId, amount, from) {
  const session = getSession(chatId);
  session.waitingForTopUpAmt = false;

  if (amount < 10000) {
    const errText = `❌ <b>Gagal Top Up!</b>
    
<blockquote>Nominal top up minimal adalah <b>Rp 10.000</b>.
Anda memasukkan: Rp ${formatRupiah(amount)}.</blockquote>`;
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '✍️ Ketik Ulang', callback_data: 'topup_custom' }],
        [{ text: '🔙 Kembali', callback_data: 'saldo_topup' }]
      ]
    };
    await editMain(bot, chatId, errText, keyboard, messageId);
    return;
  }

  await editMain(bot, chatId, '⏳ <i>Membuat link pembayaran top up...</i>', {}, messageId);

  try {
    const shortId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const pakasirOrderId = `TOP-${shortId}`;
    const payment_url = `https://app.pakasir.com/pay/${process.env.PAKASIR_SLUG}/${amount}?order_id=${pakasirOrderId}`;

    const orderObj = await createOrder(
      chatId, from.username, 'topup', false, 1, amount, payment_url, pakasirOrderId
    );
    const orderId = orderObj.id;

    const text = `💳 <b>Scan QRIS untuk Top Up Saldo</b>

<blockquote>💰 Jumlah Top Up: <b>Rp ${formatRupiah(amount)}</b>
👤 Akun: @${escapeHTML(from.username || '')}</blockquote>

🔗 <i>Atau bayar via link:</i> <a href="${payment_url}">Klik di Sini</a>

<i>⚠️ QRIS berlaku 30 menit</i>
<i>💵 Saldo otomatis bertambah setelah pembayaran berhasil dikonfirmasi</i>`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔙 Menu Saldo', callback_data: 'menu_saldo' }],
      ],
    };

    const { generateQris } = require('../utils');
    const qrBuffer = await generateQris(amount, pakasirOrderId);

    if (qrBuffer) {
      // 1. Restore the main banner back to the Saldo Menu
      // We will just edit it back to the saldo menu text to avoid circular dependency

      const saldoText = `💰 <b>Informasi Saldo</b>\n\n👤 Akun: @${escapeHTML(from.username || '')}\n💵 Saldo Anda: <b>Rp ${formatRupiah(0)}</b>\n\n<i>(Top up sedang diproses)</i>`;
      const saldoKeyboard = {
        inline_keyboard: [
          [{ text: '➕ Top Up Saldo', callback_data: 'topup_saldo' }],
          [{ text: '🔙 Menu Utama', callback_data: 'back_menu' }],
        ],
      };
      await editMain(bot, chatId, saldoText, saldoKeyboard, session.mainMessageId || messageId);
      
      // 2. Send the QR code as a SEPARATE message that can be closed
      const qrKeyboard = {
        inline_keyboard: [
          [{ text: '❌ Tutup QRIS', callback_data: 'close_qris' }],
        ],
      };
      const qrMsg = await bot.sendPhoto(chatId, qrBuffer, {
        caption: text,
        parse_mode: 'HTML',
        reply_markup: qrKeyboard,
      });
      
      const { updateOrderStatus } = require('../../server/firebase');
      await updateOrderStatus(orderId, 'pending', { qrisMessageId: qrMsg.message_id });
    } else {
      await editMain(bot, chatId, text, keyboard, messageId);
    }

  } catch (err) {
    console.error('Pakasir Topup error:', err.response?.data || err.message);
    const adminUsername = process.env.ADMIN_USERNAME || 'panzzstore_admin';
    await editMain(bot, chatId,
      `❌ <b>Gagal membuat link pembayaran top up.</b>\nCoba beberapa saat lagi atau hubungi admin (@${adminUsername}).`, {
        inline_keyboard: [[{ text: '🔙 Menu Saldo', callback_data: 'menu_saldo' }]],
      }, messageId);
  }
}

module.exports = { handleSaldo, handleTopUpMenu, handleTopUpCustom, handleProcessTopUp };
