const { escapeHTML, editMain } = require('../utils');
const storeName = process.env.STORE_NAME || 'PanzzStore';

async function handleBantuan(bot, chatId, messageId) {
  const adminUsername = process.env.ADMIN_USERNAME || 'panzzstore_admin';

  const text = `🆘 <b>Pusat Bantuan & FAQ</b>

Sebelum menghubungi admin, berikut info cepat yang sering ditanyakan:
• <b>Kapan dikirim?</b> Akun dikirim otomatis 1-3 detik setelah bayar.
• <b>Apakah ada garansi?</b> Ya, tersedia opsi Garansi untuk klaim jika bermasalah.

Jika butuh bantuan manual atau laporan transaksi, hubungi admin kami:
📞 Admin: @${escapeHTML(adminUsername)}`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '📞 Hubungi Admin', url: `https://t.me/${adminUsername}` }],
      [{ text: '« Menu Utama',   callback_data: 'back_menu' }],
    ],
  };

  await editMain(bot, chatId, text, keyboard, messageId);
}

module.exports = { handleBantuan };
