# PanzzStore — Bot Auto Order Akun TikTok

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Telegram-2CA5E0?style=flat-square&logo=telegram&logoColor=white)
![Storage](https://img.shields.io/badge/Storage-Google%20Drive-4285F4?style=flat-square&logo=googledrive&logoColor=white)
![Database](https://img.shields.io/badge/Database-Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black)
![Payment](https://img.shields.io/badge/Payment-Pakasir%20QRIS-00C853?style=flat-square)

Bot Telegram untuk jualan akun TikTok **otomatis, 24/7, tanpa campur tangan manual**. Dari order → bayar QRIS → akun terkirim, semua terjadi dalam hitungan detik. Fitur admin 100% terintegrasi di **Telegram Mini App** — tidak perlu web dashboard tambahan.

---

## 🚀 Fitur Unggulan

| Fitur | Keterangan |
|---|---|
| 🤖 **Telegram Bot** | Pembeli order, top up saldo, dan pantau riwayat langsung dari Telegram |
| 👨‍💻 **Mini App Admin** | Kelola stok, harga & order dari *webview* khusus Admin di dalam Telegram |
| ⚡ **Auto Kirim ZIP** | Akun terkirim otomatis detik itu juga setelah pembayaran terkonfirmasi |
| 📦 **Dynamic ZIP Splitter** | Otomatis memecah ZIP besar agar tidak melewati limit 50MB Telegram Bot API |
| 🗜️ **Smart Master ZIP** | Upload 1 "Master ZIP" berisi ratusan folder akun → sistem pecah jadi ratusan stok otomatis |
| ☁️ **Google Drive Storage** | File akun disimpan di Google Drive — **aman meski VPS suspend**, tidak ada data hilang |
| 💳 **Payment Pakasir QRIS** | Pembayaran QRIS / e-Wallet otomatis dengan konfirmasi via Webhook |
| 🔥 **Firebase Firestore** | Database real-time untuk order, stok, saldo, dan pengaturan harga |

---

## 🔄 Alur Kerja Bot

```
Pembeli mulai chat bot
        │
        ▼
  Pilih tipe akun
  (Muda/Tua + Garansi)
        │
        ▼
   Pilih jumlah akun
        │
        ▼
  Bot tampilkan QRIS
  + link pembayaran
        │
        ▼
  Pembeli bayar QRIS
        │
        ▼
  Pakasir kirim Webhook
  ke server kamu
        │
        ▼
  Server download file
  dari Google Drive
        │
        ▼
  Bot kirim ZIP akun
  ke chat pembeli ✅
```

---

## 🛠️ Prasyarat

Pastikan sudah terinstall sebelum mulai:

- **Node.js** v18 atau lebih baru → [nodejs.org](https://nodejs.org)
- **npm** (sudah termasuk bersama Node.js)
- **ngrok** (untuk testing lokal) → [ngrok.com](https://ngrok.com)
- Akun **Firebase** → [firebase.google.com](https://firebase.google.com)
- Akun **Google Cloud** → [console.cloud.google.com](https://console.cloud.google.com)
- Akun **Pakasir** (payment gateway) → [pakasir.com](https://pakasir.com)

---

## 📦 Setup & Instalasi

### 1. Install Dependensi

```bash
cd "SC AUTOORDER TIKTOK"
npm install
```

### 2. Setup Firebase

1. Buka [Firebase Console](https://console.firebase.google.com).
2. Buat project baru → aktifkan **Firestore Database** (mode production).
3. Buka **Project Settings → Service Accounts**.
4. Klik **Generate new private key** → file JSON terdownload.
5. Rename file menjadi **`serviceAccountKey.json`** → letakkan di **folder utama** project.

### 3. Setup Google Drive Storage ☁️

File akun TikTok disimpan di Google Drive agar aman jika VPS suspend/mati.

1. Buka [Google Cloud Console](https://console.cloud.google.com) → buat/pilih project.
2. **APIs & Services → Library** → cari dan aktifkan **Google Drive API**.
3. **APIs & Services → Credentials → Create Credentials → Service Account** → isi nama → selesaikan.
4. Klik Service Account yang baru dibuat → tab **Keys → Add Key → Create new key → JSON**.
5. Rename file JSON menjadi **`googleServiceAccount.json`** → letakkan di **folder utama** project.
6. Buka **Google Drive** → buat folder baru (misal: `SC Store Accounts`).
7. Klik kanan folder → **Share** → masukkan email Service Account (format: `xxx@xxx.iam.gserviceaccount.com`) → akses **Editor**.
8. Buka folder di Drive → copy **Folder ID** dari URL:
   ```
   https://drive.google.com/drive/folders/[ FOLDER_ID_INI ]
   ```
9. Tambahkan ke `.env`:
   ```env
   GOOGLE_DRIVE_FOLDER_ID=folder_id_kamu_disini
   ```

### 4. Konfigurasi `.env`

```bash
copy .env.example .env   # Windows
cp .env.example .env     # Linux / Mac
```

Isi file `.env` dengan data kamu:

| Variable | Wajib | Keterangan |
|---|:---:|---|
| `STORE_NAME` | ✅ | Nama toko (mengganti semua teks "PanzzStore" secara dinamis) |
| `BOT_TOKEN` | ✅ | Token bot dari [@BotFather](https://t.me/BotFather) |
| `ADMIN_TELEGRAM_ID` | ✅ | Telegram ID admin (cek via [@userinfobot](https://t.me/userinfobot)) |
| `ADMIN_USERNAME` | ✅ | Username Telegram admin untuk tombol Bantuan (tanpa @) |
| `PAKASIR_API_KEY` | ✅ | API Key dari dashboard Pakasir |
| `PAKASIR_SLUG` | ✅ | Slug/username akun Pakasir kamu |
| `BASE_URL` | ✅ | URL server kamu (HTTPS) — ngrok / domain VPS |
| `ADMIN_SECRET_KEY` | ✅ | Password rahasia untuk otentikasi Admin Mini App |
| `GOOGLE_DRIVE_FOLDER_ID` | ✅ | Folder ID Google Drive tempat file akun disimpan |
| `GOOGLE_SERVICE_ACCOUNT_PATH` | ➖ | Path ke file JSON Service Account (default: `googleServiceAccount.json`) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | ➖ | Alternatif: isi JSON Service Account langsung dalam 1 baris |

### 5. Setup Domain & Webhook Pakasir

Bot **wajib berjalan di HTTPS** agar Webhook Pakasir dan Mini App Telegram berfungsi.

**Testing lokal dengan ngrok:**
```bash
ngrok http 3000
```
Copy URL ngrok (`https://xxxx.ngrok-free.app`) → masukkan ke `BASE_URL` di `.env`.

**VPS (Ubuntu/Linux):**
1. Pointing domain ke IP VPS → setup **Nginx reverse proxy** ke port `3000`.
2. Install SSL: `sudo certbot --nginx -d toko.domainkamu.com`

**cPanel (Shared Hosting):**
1. Gunakan **Setup Node.js App** → arahkan ke domain kamu (HTTPS otomatis).

**Set Webhook Pakasir:**
Di dashboard Pakasir → menu Integrasi → set Webhook URL:
```
https://toko.domainkamu.com/webhook/pakasir
```

### 6. Menjalankan Bot & Server

**Testing lokal:**
```bash
npm start
```

**Produksi di VPS (pakai PM2 agar tidak mati):**
```bash
# Install PM2
npm install -g pm2

# Jalankan
pm2 start server/index.js --name "panzzstore-bot"

# Auto-start saat VPS reboot
pm2 startup && pm2 save
```

| Perintah PM2 | Fungsi |
|---|---|
| `pm2 status` | Lihat status bot |
| `pm2 logs panzzstore-bot` | Lihat log & error real-time |
| `pm2 restart panzzstore-bot` | Restart bot |
| `pm2 stop panzzstore-bot` | Matikan bot |

---

## 📁 Struktur Folder

```
SC AUTOORDER TIKTOK/
├── bot/
│   ├── handlers/          # Handler command & callback bot
│   │   ├── order.js       # Alur order & pengiriman akun
│   │   ├── saldo.js       # Top up & cek saldo
│   │   ├── start.js       # Menu utama & navigasi
│   │   └── bantuan.js     # Halaman bantuan
│   ├── index.js           # Inisialisasi bot Telegram
│   ├── sessions.js        # Manajemen sesi user
│   └── utils.js           # Helper & utilities
├── server/
│   ├── routes/
│   │   ├── admin.js       # API endpoint untuk Mini App Admin
│   │   └── webhook.js     # Endpoint webhook Pakasir
│   ├── firebase.js        # Koneksi & fungsi Firestore
│   ├── googleDrive.js     # Upload/download file ke Google Drive
│   ├── zipHelper.js       # Pembuatan & ekstraksi ZIP
│   └── index.js           # Entry point server Express
├── dashboard/             # Source code Telegram Mini App Admin
├── storage/
│   └── temp-uploads/      # File temp saat proses upload
├── serviceAccountKey.json      # 🔑 Firebase Service Account (jangan di-commit!)
├── googleServiceAccount.json   # 🔑 Google Drive Service Account (jangan di-commit!)
├── .env                        # 🔑 Environment variables (jangan di-commit!)
└── package.json
```

---

## 👨‍💻 Fitur Panel Admin (Mini App)

Buka dari Telegram → tombol **"👨‍💻 Panel Admin"** di menu utama bot.

| Fitur | Keterangan |
|---|---|
| 📊 **Dashboard** | Ringkasan pendapatan hari ini, total order, dan stok tersisa |
| 📦 **Kelola Stok** | Upload akun baru, lihat jumlah stok per kategori, hapus stok |
| 📋 **Riwayat Order** | Lihat semua order masuk beserta status dan detail pembeli |
| ✅ **Konfirmasi Manual** | Konfirmasi pembayaran manual jika webhook gagal |
| 💰 **Update Harga** | Ubah harga per kategori akun secara real-time |

---

## 📁 Panduan Upload Akun

Ada dua cara upload stok akun di Panel Admin:

**1. Upload Satuan** — 1 file `.zip` berisi 1 folder akun. Langsung tersimpan ke Google Drive.

**2. Upload Master ZIP** *(Disarankan untuk stok banyak)*
- Kumpulkan semua folder akun (misal 100 folder)
- Blok semua → klik kanan → **Compress to ZIP** / **Send to ZIP**
- Upload 1 file Master ZIP tersebut
- Sistem otomatis membongkar dan memecah menjadi 100 stok akun tersendiri di Google Drive!

> **⚠️ Catatan migrasi:** Akun yang diupload sebelum fitur Google Drive diaktifkan masih bisa dideliver (fallback ke local storage). Untuk keamanan maksimal, disarankan hapus stok lama dan upload ulang agar tersimpan di Drive.

---

## 🔧 Troubleshooting

<details>
<summary><b>❌ Bot tidak merespons sama sekali</b></summary>

- Cek apakah `BOT_TOKEN` di `.env` benar
- Pastikan tidak ada bot lain yang jalan dengan token yang sama (konflik polling)
- Cek log: `pm2 logs panzzstore-bot`

</details>

<details>
<summary><b>❌ Webhook Pakasir tidak masuk / order tidak terkonfirmasi otomatis</b></summary>

- Pastikan `BASE_URL` di `.env` menggunakan HTTPS (bukan HTTP)
- Pastikan URL Webhook di dashboard Pakasir sudah benar: `https://domain.com/webhook/pakasir`
- Cek apakah server bisa diakses dari internet (bukan hanya localhost)
- Coba tes webhook manual dari dashboard Pakasir

</details>

<details>
<summary><b>❌ Google Drive upload gagal</b></summary>

- Pastikan file `googleServiceAccount.json` ada di folder utama project
- Pastikan `GOOGLE_DRIVE_FOLDER_ID` sudah diisi di `.env`
- Pastikan folder Google Drive sudah di-share ke email Service Account dengan akses **Editor**
- Pastikan **Google Drive API** sudah diaktifkan di Google Cloud Console

</details>

<details>
<summary><b>❌ QRIS tidak muncul saat checkout</b></summary>

- Cek `PAKASIR_API_KEY` dan `PAKASIR_SLUG` di `.env` sudah benar
- Pastikan akun Pakasir sudah aktif dan terverifikasi
- Cek log bot untuk melihat error dari API Pakasir

</details>

<details>
<summary><b>❌ Akun tidak terkirim setelah bayar</b></summary>

- Pastikan stok akun tersedia di kategori yang dipesan
- Cek log server untuk error pengiriman
- Coba konfirmasi order manual melalui Panel Admin Mini App

</details>

---

## 📞 Support & Bantuan

Untuk bantuan dan perbaikan *source code*, silakan hubungi pengembang sistem.
