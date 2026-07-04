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

// ─── TEXT MESSAGES ────────────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const chatId  = msg.chat.id;
  const text    = msg.text;
  const session = getSession(chatId);

  // Reply keyboard: 💰 Saldo
  if (text === '💰 Saldo') {
    bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    try { await handleSaldo(bot, chatId, session.mainMessageId, msg.from); }
    catch (e) { console.error('Saldo error:', e.message); }
    return;
  }

  // Reply keyboard: 🆘 Pusat Bantuan
  if (text === '🆘 Pusat Bantuan') {
    bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    try { await handleBantuan(bot, chatId, session.mainMessageId); }
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

      case data === 'menu_bantuan':
        await handleBantuan(bot, chatId, messageId);
        break;

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
