# 🤖 Sentinel API - Telegram Auto-Payment Bot Reseller

Bot Telegram Auto Payment serba canggih untuk Reseller API di **BandelBanget AI** (`https://bandelbanget.xyz`). Bot ini membolehkan pelanggan membeli API Key baharu, menopup kuota sedia ada, menyemak baki kuota, dan membuat pembayaran secara automatik melalui DuitNow QR / Payment Gateway 24/7.

---

## 🌟 Ciri-Ciri Utama Bot

- 🚀 **Auto Key Delivery & Topup**: Menjana dan mengeluarkan API Key secara serta-merta sebaik sahaja pembayaran disahkan.
- 💳 **Pembayaran QR DuitNow & Gateway**: Menyokong bayaran DuitNow QR (Upload resit 1-klik approval oleh Admin) dan ToyyibPay / Billplz Auto Gateway.
- 📊 **Integrasi BandelBanget**: Sambungan terus ke akaun Reseller anda untuk membaca baki kuota, senarai customer key, dan API endpoint `https://bandelbanget.xyz/v1`.
- 👑 **Panel Kawalan Admin (`/admin`)**: Urus pakej jualan, luluskan resit bayaran, semak laporan jualan, dan ubah tetapan akaun bank.
- 💻 **Mini PC Ready**: Dibina khusus menggunakan **Node.js** dan pangkalan data tempatan **SQLite** yang sangat ringan serta sesuai untuk pelayan Mini PC (Windows / Ubuntu Linux).

---

## 📁 Struktur Fail Projek

```text
SentinelAPI/
├── data/                  # Pangkalan Data SQLite (sentinel.db)
├── src/
│   ├── bot/
│   │   ├── admin.js       # Pengendali Komando Admin (/admin, Lulus/Tolak Resit)
│   │   └── handlers.js    # Pengendali Aliran Pelanggan (Beli, Topup, Check Quota)
│   ├── lib/
│   │   ├── bandelbanget.js# Modul API Reseller BandelBanget
│   │   ├── db.js          # Pengendali Pangkalan Data SQLite
│   │   └── payment.js     # Enjin Pemprosesan Pembayaran QR
│   └── index.js           # Fail Utama Express Server & Telegram Bot
├── .env                   # Fail Tetapan Rahsia (BOT_TOKEN, Admin ID, Credential)
├── ecosystem.config.js    # Konfigurasi PM2 Process Manager
├── package.json           # Dependensi Node.js
└── README.md              # Panduan Penggunaan
```

---

## 🛠️ Langkah Demi Langkah Memulakan Bot Di Mini PC Anda

### Langkah 1: Sediakan Telegram Bot & Admin ID

1. Buka Telegram dan cari [@BotFather](https://t.me/BotFather).
2. Hantar arahan `/newbot` dan ikut arahan untuk mendapatkan **HTTP API BOT_TOKEN** (Contoh: `7891234567:AAFx...`).
3. Cari [@userinfobot](https://t.me/userinfobot) di Telegram untuk mendapatkan **Telegram ID** angka anda (Contoh: `123456789`).

---

### Langkah 2: Kemaskini Tetapan Dalam Fail `.env`

Buka fail `.env` menggunakan sebarang editor teks (Notepad / VS Code) dan masukkan maklumat anda:

```env
# BOT TELEGRAM ANDA
BOT_TOKEN=7891234567:AAFx...
ADMIN_TELEGRAM_ID=123456789

# AKAUAN RESELLER BANDEBANGET (SUDAH DIKONFIGURASI)
BANDELBANGET_BASE_URL=https://bandelbanget.xyz
BANDELBANGET_SECRET_TOKEN=00a9a320733bcbf399592eecb19b63743358b2f1a9be4aaa5a359a52bacd6996
BANDELBANGET_PIN=543210

# TETAPAN BANK / DUITNOW QR ANDA
DUITNOW_BANK_NAME=DuitNow QR / Touch 'n Go eWallet
DUITNOW_ACCOUNT_NO=0123456789
DUITNOW_ACCOUNT_NAME=NAMA ANDA
```

---

### Langkah 3: Jalankan Ujian Pertama (Testing Mode)

Buka Terminal / Command Prompt pada Mini PC anda di dalam folder `SentinelAPI`:

```bash
# Jalankan bot dalam mod pembangunan
npm start
```

Sekiranya berjaya, anda akan melihat paparan di terminal:
```text
🚀 [Server Web] Berjalan di port 3000
🤖 [Telegram Bot] Berjaya dijalankan!
✅ [BandelBanget API] Sambungan berjaya! Reseller ID: RSL-PP4LZ, Baki Kuota: 800,000,001 Tokens
```

Cuba buka Telegram anda dan hantar arahan `/start` kepada Bot anda!

---

### Langkah 4: Jalankan Bot 24/7 Di Latar Belakang Menggunakan PM2

Untuk memastikan bot terus berjalan 24 jam tanpa henti di Mini PC anda walaupun anda menudung terminal atau restart Mini PC:

#### Di Windows Mini PC / Linux Server:

1. Install PM2 secara global (sekiranya belum ada):
   ```bash
   npm install -g pm2
   ```

2. Lancarkan bot dengan PM2:
   ```bash
   pm2 start ecosystem.config.js
   ```

3. Simpan senarai proses PM2 supaya auto-restart jika Mini PC direboot:
   ```bash
   pm2 save
   ```

4. Semak status bot:
   ```bash
   pm2 status
   pm2 logs
   ```

---

## 👑 Arahan Pentadbir (Admin Command)

Gunakan akaun Telegram Admin yang ditetapkan dalam `ADMIN_TELEGRAM_ID`:

- `/admin` — Membuka Panel Kawalan Admin.
- **Pengurusan Pakej**: Tambah atau padam pakej kuota jualan (Contoh: 10M Token = RM 5).
- **Semakan Resit**: Apabila pelanggan memuat naik resit bayaran QR, anda akan menerima notifikasi foto resit berserta butang **[✅ Sahkan & Hantar Key]** atau **[❌ Tolak Pesanan]**.
- **Tambah Pakej Baru Secara Teks**:
  Hantar mesej format di chat bot:
  `ADMIN_ADD_PKG|Nama Pakej|TokenAmount|ValidDays|PriceMYR`
  *Contoh:* `ADMIN_ADD_PKG|Pakej VIP 200M|200000000|30|60`

---

## 🔧 Penyelesaian Masalah (Troubleshooting)

1. **Bot tidak bertindak balas kepada mesej?**
   - Pastikan `BOT_TOKEN` dalam fail `.env` adalah tepat tanpa ruang kosong berlebihan.
   - Pastikan Mini PC mempunyai sambungan internet.

2. **Gagal membuat key di BandelBanget?**
   - Bot memerlukan akaun reseller mempunyai baki kuota yang mencukupi. Baki reseller semasa anda ialah **800,000,001 Tokens**.
