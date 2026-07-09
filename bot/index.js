require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
process.env.NTBA_FIX_350 = '1';
const TelegramBot = require('node-telegram-bot-api');
const { handleStart, handleBackToMenu } = require('./handlers/start');
const {
  handleBeli, handleSelectType, handleSelectGaransi,
  handleQtySelected, handleConfirmOrder, handleTextMessage,
  handlePayWithSaldo,
} = require('./handlers/order');
const { handleSaldo }   = require('./handlers/saldo');
const { handleBantuan } = require('./handlers/bantuan');
const { getSession }    = require('./sessions');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

console.log('🤖 PanzzStore Bot is running...');

// ─── /start ───────────────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  try { await handleStart(bot, msg); }
  catch (e) { console.error('Start error:', e.message); }
});

// ─── /admin ───────────────────────────────────────────────────────────────────
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  const adminIds = (process.env.ADMIN_TELEGRAM_ID || '').split(',').map(s => s.trim());

  if (!adminIds.includes(String(chatId))) {
    await bot.sendMessage(chatId, '❌ <b>Akses Ditolak!</b>\nAnda tidak terdaftar sebagai administrator.', { parse_mode: 'HTML' });
    return;
  }

  const storeName = process.env.STORE_NAME || 'PanzzStore';
  let baseUrl = process.env.BASE_URL || '';
  if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }
  const miniAppUrl = `${baseUrl}/miniapp`;

  const text = `👑 <b>PANEL ADMINISTRATOR</b>\n\n` +
    `Selamat datang di menu administrator bot <b>${storeName}</b>.\n\n` +
    `Silakan klik tombol di bawah untuk mengelola bot atau membuka dashboard webapp:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🖥️ Buka Mini App Admin', web_app: { url: miniAppUrl } }],
      [
        { text: '📢 Kirim Broadcast', callback_data: 'admin_init_broadcast' },
        { text: '📊 Statistik Penjualan', callback_data: 'admin_view_stats' }
      ],
      [{ text: '👤 Kelola Saldo User', callback_data: 'admin_search_user_init' }]
    ]
  };

  await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
});

// ─── TEXT MESSAGES ────────────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const chatId  = msg.chat.id;
  const text    = msg.text;
  const session = getSession(chatId);

  // Handle Admin Replies to Help Tickets
  const adminIds = (process.env.ADMIN_TELEGRAM_ID || '').split(',').map(s => s.trim());
  if (adminIds.includes(String(chatId)) && msg.reply_to_message) {
    const { getUserIdFromHelpTicket } = require('../server/firebase');
    const replyToMsgId = msg.reply_to_message.message_id;

    try {
      const targetUserId = await getUserIdFromHelpTicket(replyToMsgId);
      if (targetUserId) {
        const { escapeHTML } = require('./utils');
        const userReplyMsg = `💬 <b>Balasan dari Admin:</b>\n\n` +
          `<blockquote>${escapeHTML(text)}</blockquote>`;
        
        await bot.sendMessage(targetUserId, userReplyMsg, { parse_mode: 'HTML' });
        await bot.sendMessage(chatId, '✅ <b>Balasan berhasil terkirim ke user!</b>', {
          reply_to_message_id: msg.message_id
        });
        return;
      }
    } catch (e) {
      console.error('Error handling admin reply:', e.message);
    }
  }

  // Handle Admin Input States
  if (adminIds.includes(String(chatId))) {
    // 1. Waiting for Admin Message to User
    if (session.waitingForAdminUserMsg) {
      const targetUserId = session.waitingForAdminUserMsg;
      session.waitingForAdminUserMsg = false;
      try {
        const { escapeHTML } = require('./utils');
        const { getUser } = require('../server/firebase');
        const user = await getUser(targetUserId);
        
        await bot.sendMessage(targetUserId, `✉️ <b>Pesan dari Admin:</b>\n\n<blockquote>${escapeHTML(text)}</blockquote>`, { parse_mode: 'HTML' });
        await bot.sendMessage(chatId, `✅ <b>Pesan berhasil terkirim ke user @${user?.username || 'User'} (ID: ${targetUserId})!</b>`, { parse_mode: 'HTML' });
      } catch (err) {
        console.error('Failed to send admin message to user:', err.message);
        await bot.sendMessage(chatId, `❌ Gagal mengirim pesan ke user: ${err.message}`);
      }
      return;
    }

    // 2. Waiting for Add Saldo
    if (session.waitingForAddSaldo) {
      const targetUserId = session.waitingForAddSaldo;
      session.waitingForAddSaldo = false;
      const amt = parseInt(text.replace(/[^0-9]/g, ''));
      if (isNaN(amt) || amt <= 0) {
        await bot.sendMessage(chatId, '❌ Nominal tidak valid. Input dibatalkan.');
        return;
      }
      try {
        const { updateUserSaldo, getUser } = require('../server/firebase');
        const { formatRupiah } = require('./utils');
        
        await updateUserSaldo(targetUserId, amt);
        const user = await getUser(targetUserId);
        
        await bot.sendMessage(targetUserId, `💵 <b>Saldo Anda ditambahkan oleh Admin sebesar Rp ${formatRupiah(amt)}!</b>`, { parse_mode: 'HTML' });
        await bot.sendMessage(chatId, `✅ <b>Berhasil menambahkan saldo sebesar Rp ${formatRupiah(amt)}!</b>\nSaldo saat ini untuk @${user?.username || 'User'}: <b>Rp ${formatRupiah(user.saldo)}</b>`, { parse_mode: 'HTML' });
      } catch (err) {
        console.error('Failed to add saldo:', err.message);
        await bot.sendMessage(chatId, `❌ Gagal menambahkan saldo: ${err.message}`);
      }
      return;
    }

    // 3. Waiting for Sub Saldo
    if (session.waitingForSubSaldo) {
      const targetUserId = session.waitingForSubSaldo;
      session.waitingForSubSaldo = false;
      const amt = parseInt(text.replace(/[^0-9]/g, ''));
      if (isNaN(amt) || amt <= 0) {
        await bot.sendMessage(chatId, '❌ Nominal tidak valid. Input dibatalkan.');
        return;
      }
      try {
        const { updateUserSaldo, getUser } = require('../server/firebase');
        const { formatRupiah } = require('./utils');
        
        await updateUserSaldo(targetUserId, -amt);
        const user = await getUser(targetUserId);
        
        await bot.sendMessage(targetUserId, `💵 <b>Saldo Anda dikurangi oleh Admin sebesar Rp ${formatRupiah(amt)}!</b>`, { parse_mode: 'HTML' });
        await bot.sendMessage(chatId, `✅ <b>Berhasil mengurangi saldo sebesar Rp ${formatRupiah(amt)}!</b>\nSaldo saat ini untuk @${user?.username || 'User'}: <b>Rp ${formatRupiah(user.saldo)}</b>`, { parse_mode: 'HTML' });
      } catch (err) {
        console.error('Failed to subtract saldo:', err.message);
        await bot.sendMessage(chatId, `❌ Gagal mengurangi saldo: ${err.message}`);
      }
      return;
    }

    // 4. Waiting for Broadcast Message from Chat Command
    if (session.waitingForBroadcastMsg) {
      session.waitingForBroadcastMsg = false;
      try {
        const { getAllUsers } = require('../server/firebase');
        const users = await getAllUsers();
        
        await bot.sendMessage(chatId, `⏳ <b>Memulai pengiriman broadcast ke ${users.length} user...</b>`, { parse_mode: 'HTML' });
        
        let successCount = 0;
        let failCount = 0;
        
        const promises = users.map(async (u) => {
          try {
            const uId = String(u.telegramId || u.id);
            await bot.sendMessage(uId, text, { parse_mode: 'HTML' });
            successCount++;
          } catch (err) {
            failCount++;
          }
        });
        await Promise.all(promises);
        
        await bot.sendMessage(chatId, `✅ <b>Broadcast Selesai!</b>\n\n• Berhasil: <b>${successCount} user</b>\n• Gagal: <b>${failCount} user</b>`, { parse_mode: 'HTML' });
      } catch (err) {
        console.error('Failed to run chat broadcast:', err.message);
        await bot.sendMessage(chatId, `❌ Gagal memproses broadcast: ${err.message}`);
      }
      return;
    }

    // 5. Waiting for Search User
    if (session.waitingForSearchUser) {
      session.waitingForSearchUser = false;
      const targetUserId = text.trim();
      try {
        const { getUser } = require('../server/firebase');
        const { formatRupiah } = require('./utils');
        const user = await getUser(targetUserId);
        
        if (!user) {
          await bot.sendMessage(chatId, '❌ Pengguna tidak ditemukan di database. Pastikan Chat ID benar.');
          return;
        }
        
        const infoText = `👤 <b>Detail Pengguna</b>\n\n` +
          `• Username: @${user.username || '—'}\n` +
          `• Nama: ${user.firstName || '—'}\n` +
          `• Chat ID: <code>${targetUserId}</code>\n` +
          `• Saldo: <b>Rp ${formatRupiah(user.saldo)}</b>\n` +
          `• Total Order Selesai: <b>${user.totalOrders || 0}x</b>\n\n` +
          `<i>Silakan pilih aksi cepat di bawah ini:</i>`;
        
        await bot.sendMessage(chatId, infoText, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '➕ Tambah Saldo', callback_data: `admin_add_saldo_${targetUserId}` },
                { text: '➖ Kurangi Saldo', callback_data: `admin_sub_saldo_${targetUserId}` }
              ],
              [
                { text: '💬 Kirim Chat', callback_data: `admin_chat_user_${targetUserId}` }
              ]
            ]
          }
        });
      } catch (err) {
        console.error('Failed to search user:', err.message);
        await bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${err.message}`);
      }
      return;
    }
  }

  // State: Waiting for support message (Kirim Pesan ke Admin)
  if (session.waitingForBantuanMsg) {
    session.waitingForBantuanMsg = false;
    const adminTelegramId = adminIds[0]; // Send to the first configured admin ID
    if (!adminTelegramId) {
      await bot.sendMessage(chatId, '❌ Fitur bantuan lewat bot belum dikonfigurasi oleh admin.');
      return;
    }

    try {
      const { escapeHTML } = require('./utils');
      const { saveHelpTicket } = require('../server/firebase');

      // Send to Admin
      const adminMsg = `📩 <b>PESAN BANTUAN BARU</b>\n\n` +
        `👤 <b>Dari:</b> @${msg.from.username || '—'} (${msg.from.first_name || 'User'}) (ID: <code>${chatId}</code>)\n` +
        `💬 <b>Pesan:</b>\n<blockquote>${escapeHTML(text)}</blockquote>\n\n` +
        `<i>ℹ️ Balas (Reply) pesan ini untuk membalas ke user.</i>`;
      
      const sentMsg = await bot.sendMessage(adminTelegramId, adminMsg, { parse_mode: 'HTML' });
      
      // Save mapping in Firestore
      await saveHelpTicket(sentMsg.message_id, chatId);

      await bot.sendMessage(chatId, '✅ <b>Pesan bantuan berhasil dikirim!</b>\nAdmin akan segera membalas ke chat bot ini. Silakan tunggu.', { parse_mode: 'HTML' });
    } catch (e) {
      console.error('Failed to process help message:', e.message);
      await bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengirim pesan ke admin. Hubungi admin secara manual.');
    }
    return;
  }

  // Reply keyboard: ➤ Cek Saldo
  if (text === '➤ Cek Saldo') {
    try { await handleSaldo(bot, chatId, 'new', msg.from); }
    catch (e) { console.error('Saldo error:', e.message); }
    return;
  }

  // Reply keyboard: ➤ Pusat Bantuan
  if (text === '➤ Pusat Bantuan') {
    try { await handleBantuan(bot, chatId, 'new'); }
    catch (e) { console.error('Bantuan error:', e.message); }
    return;
  }

  // State: Waiting for custom top up amount
  if (session.waitingForTopUpAmt) {
    const amt = parseInt(text.replace(/[^0-9]/g, ''));
    if (isNaN(amt) || amt < 10000) {
      await bot.sendMessage(chatId, '❌ Masukkan nominal angka yang valid (minimal Rp 10.000).', {
        reply_to_message_id: msg.message_id
      });
      return;
    }
    // Delete user's message
    bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    const { handleProcessTopUp } = require('./handlers/saldo');
    try {
      await handleProcessTopUp(bot, chatId, session.mainMessageId, amt, msg.from);
    } catch (e) {
      console.error('Custom top up process error:', e.message);
    }
    return;
  }

  // Qty manual input
  try { await handleTextMessage(bot, msg); }
  catch (e) { console.error('Text handler error:', e.message); }
});

// ─── CALLBACK QUERIES ─────────────────────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const { data, message, from } = query;
  const chatId    = message.chat.id;
  const messageId = message.message_id;

  try { await bot.answerCallbackQuery(query.id); } catch {}

  // Sync session with the current message state to prevent edit errors after bot restarts
  const session = getSession(chatId);
  if (session.mainIsPhoto === undefined && message) {
    session.mainIsPhoto = !!message.photo;
  }
  if (!session.mainMessageId) {
    session.mainMessageId = messageId;
  }

  try {
    switch (true) {
      case data === 'back_menu':
        await handleBackToMenu(bot, chatId, messageId, from.first_name);
        break;
        
      case data === 'close_qris':
        bot.deleteMessage(chatId, messageId).catch(() => {});
        break;

      case data === 'menu_beli':
        await handleBeli(bot, chatId, messageId);
        break;

      case data === 'type_muda':
        await handleSelectType(bot, chatId, messageId, 'muda');
        break;
      case data === 'type_tua':
        await handleSelectType(bot, chatId, messageId, 'tua');
        break;

      case data === 'garansi_yes':
        await handleSelectGaransi(bot, chatId, messageId, true);
        break;
      case data === 'garansi_no':
        await handleSelectGaransi(bot, chatId, messageId, false);
        break;

      // Qty buttons: 10-100 by 10, dan 200
      case data.startsWith('qty_'): {
        const qty = parseInt(data.split('_')[1]);
        await handleQtySelected(bot, chatId, messageId, qty);
        break;
      }

      case data === 'confirm_order':
        await handleConfirmOrder(bot, chatId, messageId, from);
        break;

      case data === 'pay_with_saldo':
        await handlePayWithSaldo(bot, chatId, messageId, from);
        break;

      case data === 'menu_saldo':
        await handleSaldo(bot, chatId, messageId, from);
        break;

      case data === 'saldo_topup': {
        const { handleTopUpMenu } = require('./handlers/saldo');
        await handleTopUpMenu(bot, chatId, messageId);
        break;
      }

      case data === 'topup_custom': {
        const { handleTopUpCustom } = require('./handlers/saldo');
        await handleTopUpCustom(bot, chatId, messageId);
        break;
      }

      case data.startsWith('topup_amt_'): {
        const amt = parseInt(data.split('_')[2]);
        const { handleProcessTopUp } = require('./handlers/saldo');
        await handleProcessTopUp(bot, chatId, messageId, amt, from);
        break;
      }

      case data === 'kirim_pesan_admin': {
        session.waitingForBantuanMsg = true;
        await bot.sendMessage(chatId, '💬 <b>Silakan ketik pesan Anda untuk Admin:</b>\n\n<i>Pesan Anda akan otomatis diteruskan ke admin PanzzStore.</i>', {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '« Batal', callback_data: 'menu_bantuan' }]]
          }
        });
        break;
      }

      case data === 'menu_bantuan':
        await handleBantuan(bot, chatId, messageId);
        break;

      // ─── ADMIN MAIN PANEL ACTIONS ─────────────────────────────────────────────
      case data === 'admin_init_broadcast': {
        session.waitingForBantuanMsg = false;
        session.waitingForAdminUserMsg = false;
        session.waitingForSearchUser = false;
        session.waitingForBroadcastMsg = true;
        await bot.sendMessage(chatId, '📢 <b>Kirim Broadcast ke Seluruh Pengguna</b>\n\nSilakan ketik pesan broadcast Anda di sini (Mendukung HTML):', {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '« Batal', callback_data: 'admin_cancel_input' }]]
          }
        });
        break;
      }

      case data === 'admin_view_stats': {
        const { getOrderStats, getAllStock } = require('../server/firebase');
        const { formatRupiah } = require('./utils');
        try {
          const stats = await getOrderStats();
          const stock = await getAllStock();
          
          let stockText = '';
          stock.forEach(s => {
            const garansiLabel = s.garansi ? 'Garansi' : 'No Garansi';
            const typeLabel = s.type === 'muda' ? 'Muda' : 'Tua';
            stockText += `• TikTok ${typeLabel} (${garansiLabel}): <b>${s.count} akun</b>\n`;
          });

          const text = `📊 <b>Statistik Penjualan & Stok</b>\n\n` +
            `📦 <b>Hari Ini:</b>\n` +
            `• Jumlah Order: <b>${stats.todayOrders} order</b>\n` +
            `• Revenue: <b>Rp ${formatRupiah(stats.todayRevenue)}</b>\n\n` +
            `🏦 <b>Total Keseluruhan:</b>\n` +
            `• Jumlah Order: <b>${stats.totalOrders} order</b>\n` +
            `• Revenue: <b>Rp ${formatRupiah(stats.totalRevenue)}</b>\n\n` +
            `📦 <b>Ketersediaan Stok:</b>\n${stockText}`;
          
          await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
        } catch (err) {
          console.error('Admin view stats error:', err.message);
          await bot.sendMessage(chatId, '❌ Gagal memuat statistik.');
        }
        break;
      }

      case data === 'admin_search_user_init': {
        session.waitingForSearchUser = true;
        await bot.sendMessage(chatId, '🔍 <b>Kelola Saldo User</b>\n\nSilakan kirimkan <b>Chat ID Telegram</b> user yang ingin Anda cari:', {
          reply_markup: {
            inline_keyboard: [[{ text: '« Batal', callback_data: 'admin_cancel_input' }]]
          }
        });
        break;
      }

      case data === 'admin_cancel_input': {
        session.waitingForAdminUserMsg = false;
        session.waitingForAddSaldo = false;
        session.waitingForSubSaldo = false;
        session.waitingForSearchUser = false;
        session.waitingForBroadcastMsg = false;
        await bot.sendMessage(chatId, '❌ Aksi admin dibatalkan.');
        break;
      }

      // ─── ADMIN CALLBACK ACTIONS ───────────────────────────────────────────────
      case data.startsWith('admin_view_user_'): {
        const targetUserId = data.split('_')[3];
        const { getUser } = require('../server/firebase');
        const { formatRupiah } = require('./utils');
        try {
          const user = await getUser(targetUserId);
          if (!user) {
            await bot.sendMessage(chatId, '❌ Pengguna tidak ditemukan di database.');
            break;
          }
          const text = `👤 <b>Detail Pengguna</b>\n\n` +
            `• Username: @${user.username || '—'}\n` +
            `• Nama: ${user.firstName || '—'}\n` +
            `• Chat ID: <code>${targetUserId}</code>\n` +
            `• Saldo: <b>Rp ${formatRupiah(user.saldo)}</b>\n` +
            `• Total Order Selesai: <b>${user.totalOrders || 0}x</b>\n\n` +
            `<i>Silakan pilih aksi cepat di bawah ini:</i>`;
          
          await bot.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '➕ Tambah Saldo', callback_data: `admin_add_saldo_${targetUserId}` },
                  { text: '➖ Kurangi Saldo', callback_data: `admin_sub_saldo_${targetUserId}` }
                ],
                [
                  { text: '💬 Kirim Chat', callback_data: `admin_chat_user_${targetUserId}` }
                ]
              ]
            }
          });
        } catch (err) {
          console.error('Admin view user error:', err.message);
          await bot.sendMessage(chatId, '❌ Gagal mengambil data user.');
        }
        break;
      }

      case data.startsWith('admin_chat_user_'): {
        const targetUserId = data.split('_')[3];
        session.waitingForAdminUserMsg = targetUserId;
        await bot.sendMessage(chatId, `💬 <b>Kirim pesan langsung ke user (ID: ${targetUserId}):</b>\n\nTulis pesan yang ingin Anda kirimkan. Pesan akan diteruskan oleh bot ke chat user.`, {
          reply_markup: {
            inline_keyboard: [[{ text: '« Batal', callback_data: 'admin_cancel_input' }]]
          }
        });
        break;
      }

      case data.startsWith('admin_add_saldo_'): {
        const targetUserId = data.split('_')[3];
        session.waitingForAddSaldo = targetUserId;
        await bot.sendMessage(chatId, `➕ <b>Tambah Saldo User (ID: ${targetUserId}):</b>\n\nSilakan ketik jumlah saldo yang ingin <b>ditambahkan</b> (contoh: <code>10000</code> atau <code>50000</code>):`, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '« Batal', callback_data: 'admin_cancel_input' }]]
          }
        });
        break;
      }

      case data.startsWith('admin_sub_saldo_'): {
        const targetUserId = data.split('_')[3];
        session.waitingForSubSaldo = targetUserId;
        await bot.sendMessage(chatId, `➖ <b>Kurangi Saldo User (ID: ${targetUserId}):</b>\n\nSilakan ketik jumlah saldo yang ingin <b>dikurangi</b> (contoh: <code>10000</code> atau <code>50000</code>):`, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '« Batal', callback_data: 'admin_cancel_input' }]]
          }
        });
        break;
      }

      case data.startsWith('admin_view_order_'): {
        const targetOrderId = data.split('_')[3];
        const { getOrder } = require('../server/firebase');
        const { formatRupiah } = require('./utils');
        try {
          const order = await getOrder(targetOrderId);
          if (!order) {
            await bot.sendMessage(chatId, '❌ Pesanan tidak ditemukan.');
            break;
          }
          const typeName = order.type === 'muda' ? '🧒 Akun Muda' : '👴 Akun Tua';
          const garansiName = order.garansi ? '✅ Garansi' : '❌ No Garansi';
          const paymentMethod = order.paymentUrl === 'Paid with Balance' ? 'Potong Saldo' : 'Pakasir QRIS';
          const dateStr = order.createdAt ? (order.createdAt.toDate ? order.createdAt.toDate().toLocaleString('id-ID') : new Date(order.createdAt).toLocaleString('id-ID')) : '—';
          
          const text = `📦 <b>Detail Pesanan</b>\n\n` +
            `• <b>Order ID (System):</b> <code>${targetOrderId}</code>\n` +
            `• <b>Order ID (Pakasir):</b> <code>${order.pakasirOrderId || '—'}</code>\n` +
            `• <b>Pembeli:</b> @${order.username || '—'} (ID: <code>${order.userId}</code>)\n` +
            `• <b>Kategori:</b> ${typeName} ${garansiName}\n` +
            `• <b>Jumlah:</b> <b>${order.qty} akun</b>\n` +
            `• <b>Total:</b> <b>Rp ${formatRupiah(order.totalPrice)}</b>\n` +
            `• <b>Pembayaran:</b> ${paymentMethod}\n` +
            `• <b>Status:</b> <b>${order.status.toUpperCase()}</b>\n` +
            `• <b>Tanggal:</b> ${dateStr}`;
          
          await bot.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '👤 Kelola User', callback_data: `admin_view_user_${order.userId}` }
                ]
              ]
            }
          });
        } catch (err) {
          console.error('Admin view order error:', err.message);
          await bot.sendMessage(chatId, '❌ Gagal memuat detail order.');
        }
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error(`Callback error [${data}]:`, e.message);
    try { await bot.sendMessage(chatId, '❌ Terjadi kesalahan. Coba lagi ya!'); } catch {}
  }
});

bot.on('polling_error', (err) => console.error('Polling error:', err.message));

module.exports = { bot };
