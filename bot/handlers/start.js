require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { getUserOrCreate } = require('../../server/firebase');
const { getSession } = require('../sessions');
const { escapeHTML, editMain } = require('../utils');
const path = require('path');

const storeName = process.env.STORE_NAME || 'PanzzStore';
const BANNER_PATH = path.join(__dirname, '../../assets/banner.png');

const REPLY_KEYBOARD = {
  keyboard: [
    [{ text: '💰 Saldo' }, { text: '🆘 Pusat Bantuan' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

function buildCaption(name) {
  return `✨ <b>Halo, ${escapeHTML(name)}!</b> Selamat datang di

🏪 <b>${storeName.toUpperCase()}</b>
<i>Toko Akun TikTok Terpercaya #1</i>

<blockquote>⚡ Pengiriman Otomatis & Instan
🔒 Akun Berkualitas & Bergaransi
💎 Harga Terjangkau & Terbaik
🛡️ Transaksi Aman 100%</blockquote>

Pilih menu di bawah untuk mulai! 👇`;
}

function buildMainKeyboard(chatId) {
  const isAdmin = String(chatId) === String(process.env.ADMIN_TELEGRAM_ID);
  const miniAppUrl = `${process.env.BASE_URL}/miniapp`;
  return {
    inline_keyboard: [
      [{ text: '🛒 Beli Akun TikTok', callback_data: 'menu_beli' }],
      ...(isAdmin ? [[{ text: '⚙️ Admin Panel', web_app: { url: miniAppUrl } }]] : []),
    ],
  };
}

let cachedBannerFileId = null;

async function handleStart(bot, msg) {
  const { id: chatId, username, first_name } = msg.from;
  const session = getSession(chatId);

  try { await getUserOrCreate(chatId, username, first_name); } catch {}

  const name = first_name || username || 'Kawan';

  // 1. Kirim pesan loading awal TANPA reply_markup agar pesan bisa di-edit lancar
  let loadingMsg;
  try {
    loadingMsg = await bot.sendMessage(chatId, `⏳ <b>Loading ${storeName}...</b>\n\n<code>[░░░░░░░░░░] 20% (Menghubungkan database)</code>`, {
      parse_mode: 'HTML',
    });
  } catch (e) {
    console.error('Error sending loading message:', e.message);
  }

  // Frame 2: 60%
  await new Promise(r => setTimeout(r, 450));
  if (loadingMsg) {
    try {
      await bot.editMessageText(`⏳ <b>Loading ${storeName}...</b>\n\n<code>[██████░░░░] 60% (Sinkronisasi stok)</code>`, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'HTML',
      });
    } catch (e) {
      console.error('Frame 60% error:', e.message);
    }
  }

  // Frame 3: 100%
  await new Promise(r => setTimeout(r, 450));
  if (loadingMsg) {
    try {
      await bot.editMessageText(`⏳ <b>Loading ${storeName}...</b>\n\n<code>[██████████] 100% (Toko Siap!)</code>`, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'HTML',
      });
    } catch (e) {
      console.error('Frame 100% error:', e.message);
    }
  }

  await new Promise(r => setTimeout(r, 200));

  // Hapus pesan loading setelah selesai agar room chat bersih
  if (loadingMsg) {
    try {
      await bot.deleteMessage(chatId, loadingMsg.message_id);
    } catch (e) {
      console.error('Error deleting loading message:', e.message);
    }
  }

  const caption  = buildCaption(name);
  const inlineKeyboard = buildMainKeyboard(chatId);

  // 2. Kirim pesan penyambung & banner secara PARALEL agar super cepat, tapi tunggu barengan
  try {
    const p1 = bot.sendMessage(chatId, `<blockquote>✨ <b>Selamat datang di ${storeName}!</b></blockquote>`, {
      parse_mode: 'HTML',
      reply_markup: REPLY_KEYBOARD,
    });

    const photoSource = cachedBannerFileId ? cachedBannerFileId : BANNER_PATH;
    const p2 = bot.sendPhoto(chatId, photoSource, {
      caption,
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard,
    });

    const [msg1, photoMsg] = await Promise.all([p1, p2]);

    // Cache file_id untuk pengiriman super kilat selanjutnya
    if (!cachedBannerFileId && photoMsg.photo && photoMsg.photo.length > 0) {
      cachedBannerFileId = photoMsg.photo[photoMsg.photo.length - 1].file_id;
    }

    session.mainMessageId = photoMsg.message_id;
    session.mainIsPhoto   = true;
  } catch (e) {
    console.error('Send message/photo error:', e.message);
    // Fallback if photo fails
    const textMsg = await bot.sendMessage(chatId, caption, {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard,
    });
    session.mainMessageId = textMsg.message_id;
    session.mainIsPhoto   = false;
  }
}

async function handleBackToMenu(bot, chatId, messageId, firstName) {
  const session = getSession(chatId);
  const caption  = buildCaption(firstName || 'Kawan');
  const keyboard = buildMainKeyboard(chatId);

  // Jika main menu sebelumnya diturunkan ke teks (isPhoto === false) atau messageId hilang,
  // hapus pesan lama dan kirim ulang menu utama dengan foto banner agar branding tetap konsisten
  if (session.mainIsPhoto === false || !messageId) {
    if (messageId) bot.deleteMessage(chatId, messageId).catch(() => {});
    
    try {
      const photoSource = cachedBannerFileId ? cachedBannerFileId : BANNER_PATH;
      const photoMsg = await bot.sendPhoto(chatId, photoSource, {
        caption,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });

      if (!cachedBannerFileId && photoMsg.photo && photoMsg.photo.length > 0) {
        cachedBannerFileId = photoMsg.photo[photoMsg.photo.length - 1].file_id;
      }
      
      session.mainMessageId = photoMsg.message_id;
      session.mainIsPhoto   = true;
      return;
    } catch (e) {
      console.error('Failed to restore main menu photo banner:', e.message);
    }
  }

  await editMain(bot, chatId, caption, keyboard, messageId);
}

module.exports = { handleStart, handleBackToMenu, buildCaption, buildMainKeyboard };
