const { getSession } = require('./sessions');

/** Escape special HTML characters */
function escapeHTML(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Format number to Rupiah string for HTML */
function formatRupiah(num) {
  return Number(num).toLocaleString('id-ID');
}

/**
 * Edit the main persistent message (photo caption or text) using HTML parse mode.
 */
async function editMain(bot, chatId, text, keyboard, msgId = null) {
  const session = getSession(chatId);

  // Jika dipaksa untuk mengirim pesan baru (misal via Reply Keyboard)
  if (msgId === 'new') {
    const m = await bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    session.mainMessageId = m.message_id;
    session.mainIsPhoto = false;

    // Simpan ke Firestore untuk pemulihan nanti jika bot restart
    try {
      const { db } = require('../server/firebase');
      await db.collection('users').doc(String(chatId)).update({
        mainMessageId: m.message_id,
        mainIsPhoto: false
      }).catch(() => {});
    } catch {}
    return;
  }

  let targetId = msgId || session.mainMessageId;
  let isPhoto  = session.mainIsPhoto;

  // Recovery: jika targetId tidak ada di session, coba ambil dari Firestore
  if (!targetId) {
    try {
      const { getUser } = require('../server/firebase');
      const user = await getUser(chatId);
      if (user && user.mainMessageId) {
        targetId = user.mainMessageId;
        isPhoto = user.mainIsPhoto !== false;
        // Simpan kembali ke memory session agar request berikutnya cepat
        session.mainMessageId = targetId;
        session.mainIsPhoto = isPhoto;
        console.log(`🔄 [Self-Healing] Recovered mainMessageId (${targetId}) from Firestore for user ${chatId}`);
      }
    } catch (dbErr) {
      console.error('Failed to recover mainMessageId from Firestore:', dbErr.message);
    }
  }

  if (!targetId) {
    const m = await bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    session.mainMessageId = m.message_id;
    session.mainIsPhoto = false;

    // Simpan ke Firestore untuk pemulihan nanti jika bot restart
    try {
      const { db } = require('../server/firebase');
      await db.collection('users').doc(String(chatId)).update({
        mainMessageId: m.message_id,
        mainIsPhoto: false
      }).catch(() => {});
    } catch {}
    return;
  }

  // Jika isPhoto belum terdefinisi (misal setelah recover tetapi field di DB tidak ada), asumsikan true
  const finalIsPhoto = isPhoto !== false;

  try {
    if (finalIsPhoto) {
      await bot.editMessageCaption(text, {
        chat_id: chatId,
        message_id: targetId,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: targetId,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    }
  } catch (e) {
    console.error('editMain HTML error:', e.message);
    try {
      const m = await bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      session.mainMessageId = m.message_id;
      session.mainIsPhoto = false;

      // Simpan ke Firestore
      const { db } = require('../server/firebase');
      await db.collection('users').doc(String(chatId)).update({
        mainMessageId: m.message_id,
        mainIsPhoto: false
      }).catch(() => {});
    } catch {}
  }
}

const axios = require('axios');
const qrcode = require('qrcode');

/**
 * Generate a QRIS image buffer using Pakasir API
 */
async function generateQris(amount, orderId) {
  try {
    const res = await axios.post('https://app.pakasir.com/api/transactioncreate/qris', {
      project: process.env.PAKASIR_SLUG,
      order_id: orderId,
      amount: amount,
      api_key: process.env.PAKASIR_API_KEY
    });
    
    // Extract the QR string from the response
    const qrString = res.data?.payment?.payment_number;
    
    if (!qrString) {
      console.error('No QR String in response:', res.data);
      throw new Error('QR string not found in Pakasir response');
    }
    
    // Generate an image buffer from the QR string
    const qrBuffer = await qrcode.toBuffer(qrString, { 
      errorCorrectionLevel: 'H',
      margin: 4,
      width: 500,
      color: { dark: '#A855F7', light: '#ffffff' } // Custom purple styling
    });
    
    return qrBuffer;
  } catch (err) {
    console.error('Failed to generate QRIS:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { escapeHTML, formatRupiah, editMain, generateQris };
