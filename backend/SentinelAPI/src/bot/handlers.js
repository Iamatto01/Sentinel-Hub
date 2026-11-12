const { Markup } = require('telegraf');
const db = require('../lib/db');
const bandelbanget = require('../lib/bandelbanget');
const payment = require('../lib/payment');

// Sesi sementara untuk menyimpan state pengguna (cth: menunggu token topup)
const userSessions = new Map();

function registerUserHandlers(bot) {
  // Command /start & /menu
  bot.command(['start', 'menu'], async (ctx) => {
    db.saveUser(ctx.from);
    await showMainMenu(ctx);
  });

  // Action: Main Menu Callback
  bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await showMainMenu(ctx, true);
  });

  // Action: Beli Key Baharu
  bot.action('buy_key_start', async (ctx) => {
    await ctx.answerCbQuery();
    const packages = db.getAllPackages();

    if (packages.length === 0) {
      return ctx.reply('⚠️ Tiada pakej jualan yang aktif buat masa ini. Sila semak semula kemudian.');
    }

    let text = `🛒 *PILIH PAKEJ API KEY BAHARU*\n\n` +
      `Sila pilih pakej kuota Token yang anda inginkan di bawah:\n\n`;

    const buttons = [];
    packages.forEach(pkg => {
      text += `🔹 *${pkg.name}*\n` +
        `   • Kuota: \`${pkg.tokens.toLocaleString()} Tokens\`\n` +
        `   • Tempoh Sah: \`${pkg.valid_days} Hari\`\n` +
        `   • Harga: *RM ${pkg.price_myr.toFixed(2)}*\n\n`;

      buttons.push([Markup.button.callback(`🛒 Beli: ${pkg.name} (RM ${pkg.price_myr.toFixed(2)})`, `buy_pkg_${pkg.id}`)]);
    });

    buttons.push([Markup.button.callback('⬅️ Kembali ke Menu Utama', 'main_menu')]);

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  });

  // Action: Pilih Pakej Pembelian
  bot.action(/^buy_pkg_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const pkgId = parseInt(ctx.match[1]);
    const pkg = db.getPackageById(pkgId);

    if (!pkg) {
      return ctx.reply('❌ Pakej tidak dijumpai.');
    }

    // Cipta pesanan & maklumat bayaran
    const orderInfo = await payment.createPaymentOrder({
      userId: ctx.from.id,
      userName: ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Pelanggan'),
      packageItem: pkg,
      type: 'new_key'
    });

    await showPaymentInstructions(ctx, orderInfo, pkg);
  });

  // Action: Topup Key Sedia Ada
  bot.action('topup_key_start', async (ctx) => {
    await ctx.answerCbQuery();
    userSessions.set(ctx.from.id, { step: 'WAITING_TOPUP_KEY' });

    await ctx.reply(
      `🔄 *TOPUP API KEY SEDIA ADA*\n\n` +
      `Sila hantarkan *Secret Token* atau *API Key* korang yang nak ditopup di ruang chat ini.\n\n` +
      `Contoh Token:\n\`00a9a320733bcbf399592eecb19b63743358b2f1a9be4aaa5a359a52bacd6996\``,
      { parse_mode: 'Markdown' }
    );
  });

  // Action: Semak Kuota Key
  bot.action('check_quota_start', async (ctx) => {
    await ctx.answerCbQuery();
    userSessions.set(ctx.from.id, { step: 'WAITING_CHECK_KEY' });

    await ctx.reply(
      `📊 *SEMAK KUOTA & MAKLUMAT KEY*\n\n` +
      `Sila hantarkan *Secret Token* atau *API Key* anda di ruang chat ini untuk menyemak kuota terkini.\n\n` +
      `Contoh:\n\`74d6350ff51ea6f9c68bb77f00069434733c3d1d5f36c8740c57fdee04009651\``,
      { parse_mode: 'Markdown' }
    );
  });

  // Action: Sejarah Pesanan
  bot.action('history_start', async (ctx) => {
    await ctx.answerCbQuery();
    const orders = db.getUserOrders(ctx.from.id);

    let text = `📜 *SEJARAH PESANAN ANDA*\n\n`;

    if (orders.length === 0) {
      text += `_Anda belum membuat sebarang pesanan._`;
    } else {
      orders.forEach(ord => {
        const statusText = ord.status === 'approved' ? '✅ Berjaya' : ord.status === 'rejected' ? '❌ Ditolak' : '⏳ Menunggu Bayaran/Sahkan';
        text += `📌 *No. Pesanan:* \`${ord.order_ref}\`\n` +
          `   • Pakej: ${ord.package_name}\n` +
          `   • Harga: RM ${(ord.amount_paid || ord.price_myr).toFixed(2)}\n` +
          `   • Status: ${statusText}\n`;

        if (ord.generated_key) {
          text += `   • API Key: \`${ord.generated_key}\`\n`;
        }
        text += `\n`;
      });
    }

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Kembali ke Menu Utama', 'main_menu')]
      ])
    });
  });

  // Action: Cara Penggunaan API
  bot.action('help_start', async (ctx) => {
    await ctx.answerCbQuery();
    const text = `❓ *CARA PENGGUNAAN API BANDEBANGET*\n\n` +
      `API Key yang anda beli adalah **OpenAI-Compatible**, bermaksud ia menyokong semua perisian/aplikasi AI terkini!\n\n` +
      `📍 *Base URL API:* \`https://bandelbanget.xyz/v1\`\n` +
      `🔑 *API Key:* (Key yang dihantar oleh bot selepas bayaran)\n\n` +
      `📱 *Aplikasi Disyorkan:*\n` +
      `1. **NextChat / TypingMind / ChatBox** (Web & Mobile)\n` +
      `2. **Claude Desktop / Cursor IDE**\n` +
      `3. **V2Ray / Xray Client** (Sekiranya guna kuota proxy)\n\n` +
      `💡 *Model Popular Disokong:*\n` +
      `• \`gpt-5.6-luna\` / \`gpt-5.6-sol\`\n` +
      `• \`claude-opus-4.8\` / \`claude-sonnet-4.5\`\n` +
      `• \`deepseek-v4-pro\` / \`qwen3.8-max\``;

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Kembali ke Menu Utama', 'main_menu')]
      ])
    });
  });

  // HANDLER MESEJ TEKS (Input pengguna untuk check key, topup, atau arahan admin)
  bot.on('text', async (ctx, next) => {
    const text = ctx.message.text.trim();
    const userId = ctx.from.id;
    const session = userSessions.get(userId);

    // Filter command telegram
    if (text.startsWith('/')) return next();

    // Handling Arahan Admin melalui mesej teks
    const adminId = String(process.env.ADMIN_TELEGRAM_ID || '').trim();
    if (adminId && String(userId) === adminId) {
      if (text.startsWith('ADMIN_ADD_PKG|')) {
        const parts = text.split('|');
        if (parts.length === 5) {
          const name = parts[1].trim();
          const tokens = parseInt(parts[2].trim());
          const validDays = parseInt(parts[3].trim());
          const priceMyr = parseFloat(parts[4].trim());

          db.createPackage(name, tokens, validDays, priceMyr);
          return ctx.reply(`✅ Pakej baharu *${name}* telah berjaya ditambah!`, { parse_mode: 'Markdown' });
        }
      }

      if (text.startsWith('SET_BANK|')) {
        const parts = text.split('|');
        if (parts.length === 4) {
          db.setSetting('duitnow_bank_name', parts[1].trim());
          db.setSetting('duitnow_account_no', parts[2].trim());
          db.setSetting('duitnow_account_name', parts[3].trim());
          return ctx.reply(`✅ Tetapan akaun bank DuitNow telah dikemaskini!`, { parse_mode: 'Markdown' });
        }
      }
    }

    // Process Semak Kuota Key
    if (session && session.step === 'WAITING_CHECK_KEY') {
      userSessions.delete(userId);
      await ctx.reply('🔍 Menyemak maklumat key anda di server...');

      try {
        const keyInfo = await bandelbanget.getCustomerKeyDetails(text);

        const totalTokens = (keyInfo.maxTokens || 0).toLocaleString();
        const usedTokens = (keyInfo.usage?.total_tokens || 0).toLocaleString();
        const statusEmoji = keyInfo.status === 'active' ? '🟢 Active' : '🔴 Inactive';

        const replyMsg = `📊 *MAKLUMAT API KEY*\n\n` +
          `🔑 *Name/Masked:* \`${keyInfo.name || keyInfo.keyMasked || '-'}\`\n` +
          `⚡ *Status:* ${statusEmoji}\n` +
          `🔋 *Jumlah Kuota:* \`${totalTokens} Tokens\`\n` +
          `📈 *Kuota Terpakai:* \`${usedTokens} Tokens\`\n` +
          `📅 *Tempoh Sah:* \`${keyInfo.validDays || 0} Hari\`\n` +
          `🌐 *Base URL:* \`${keyInfo.baseUrl || 'https://bandelbanget.xyz/v1'}\``;

        return ctx.reply(replyMsg, { parse_mode: 'Markdown' });
      } catch (err) {
        return ctx.reply(`❌ Gagal menyemak key: ${err.message}. Sila pastikan Token/Key adalah betul.`);
      }
    }

    // Process Topup Key (Peringkat 1: Pengguna masukkan token)
    if (session && session.step === 'WAITING_TOPUP_KEY') {
      userSessions.delete(userId);
      await ctx.reply('🔍 Verifikasi Key anda...');

      try {
        const keyInfo = await bandelbanget.getCustomerKeyDetails(text);
        const packages = db.getAllPackages();

        if (packages.length === 0) {
          return ctx.reply('⚠️ Tiada pakej topup aktif.');
        }

        let replyMsg = `🔄 *TOPUP UNTUK KEY: ${keyInfo.name || keyInfo.keyMasked}*\n\n` +
          `Sila pilih pakej kuota yang ingin ditambah di bawah:\n\n`;

        const buttons = [];
        packages.forEach(pkg => {
          replyMsg += `🔹 *${pkg.name}* (+${pkg.tokens.toLocaleString()} Tokens / ${pkg.valid_days}d) - *RM ${pkg.price_myr.toFixed(2)}*\n`;
          buttons.push([Markup.button.callback(`🔄 Topup: ${pkg.name}`, `topup_pkg_${pkg.id}_${keyInfo.id}_${text}`)]);
        });

        buttons.push([Markup.button.callback('⬅️ Batal', 'main_menu')]);

        return ctx.reply(replyMsg, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        });
      } catch (err) {
        return ctx.reply(`❌ Gagal verifikasi key untuk topup: ${err.message}`);
      }
    }

    return next();
  });

  // Action: Process Topup Package Selection
  bot.action(/^topup_pkg_(\d+)_(\d+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const pkgId = parseInt(ctx.match[1]);
    const targetKeyId = parseInt(ctx.match[2]);
    const targetKeyToken = ctx.match[3];

    const pkg = db.getPackageById(pkgId);
    if (!pkg) return ctx.reply('❌ Pakej tidak dijumpai.');

    const orderInfo = await payment.createPaymentOrder({
      userId: ctx.from.id,
      userName: ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Pelanggan'),
      packageItem: pkg,
      type: 'topup',
      targetKeyId,
      targetKeyToken
    });

    await showPaymentInstructions(ctx, orderInfo, pkg);
  });

  // HANDLER FOTO / RESIT BAYARAN
  bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const orders = db.getUserOrders(userId);
    const pendingOrder = orders.find(o => o.status === 'pending');

    if (!pendingOrder) {
      return ctx.reply('⚠️ Anda tiada pesanan aktif yang menunggu bayaran resit. Sila klik /start untuk membuat pesanan baharu.');
    }

    // Ambil gambar resit saiz tertinggi
    const photos = ctx.message.photo;
    const highestResPhoto = photos[photos.length - 1];
    const fileId = highestResPhoto.file_id;

    // Kemaskini file_id resit dalam pangkalan data
    db.updateOrderStatus(pendingOrder.order_ref, 'pending', { receiptFileId: fileId });

    await ctx.reply(
      `📥 *RESIT BAYARAN DITERIMA!*\n\n` +
      `Terima kasih! Resit bayaran anda bagi Pesanan *#${pendingOrder.order_ref}* telah berjaya dihantar kepada Admin untuk pengesahan.\n\n` +
      `⚡ *API Key anda akan dihantar secara automatik dalam chat ini sebaik sahaja disahkan (biasanya dalam 1-5 minit).*`,
      { parse_mode: 'Markdown' }
    );

    // Hantar resit & notifikasi kepada Telegram Admin
    const adminId = process.env.ADMIN_TELEGRAM_ID;
    if (adminId) {
      const adminCaption = `🔔 *NOTIFIKASI BAYARAN BAHARU!*\n\n` +
        `📌 *No. Pesanan:* \`${pendingOrder.order_ref}\`\n` +
        `👤 *Pembeli:* ${pendingOrder.user_name} (\`${pendingOrder.user_id}\`)\n` +
        `📦 *Item:* ${pendingOrder.package_name}\n` +
        `💰 *Jumlah Yang Perlu Dibayar:* *RM ${(pendingOrder.amount_paid || pendingOrder.price_myr).toFixed(2)}*\n` +
        `🏷️ *Jenis:* ${pendingOrder.type === 'topup' ? 'Topup Key Sedia Ada' : 'Pembelian Key Baharu'}\n\n` +
        `Sila semak resit di atas dan tekan butang pengesahan di bawah:`;

      try {
        await bot.telegram.sendPhoto(adminId, fileId, {
          caption: adminCaption,
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Sahkan & Hantar Key', `approve_${pendingOrder.order_ref}`)],
            [Markup.button.callback('❌ Tolak Pesanan', `reject_${pendingOrder.order_ref}`)]
          ])
        });
      } catch (adminErr) {
        console.error('[Handlers Photo] Gagal hantar notifikasi resit ke Admin:', adminErr.message);
      }
    }
  });
}

// Paparkan Menu Utama
async function showMainMenu(ctx, isEdit = false) {
  const name = ctx.from?.first_name || 'Pelanggan';
  const text = `👋 *Selamat Datang, ${name}!*\n\n` +
    `🤖 **Sentinel Reseller API Bot**\n` +
    `Kami menyediakan perkhidmatan API Key model AI (DeepSeek v4, GLM, Kimi) serasi standard OpenAI.\n\n` +
    `Sila pilih menu di bawah untuk memulakan:`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🛒 Beli Key Baharu', 'buy_key_start'), Markup.button.callback('🔄 Topup Key', 'topup_key_start')],
    [Markup.button.callback('📊 Semak Kuota Key', 'check_quota_start'), Markup.button.callback('📜 Sejarah Pesanan', 'history_start')],
    [Markup.button.callback('❓ Panduan & Cara Guna API', 'help_start')]
  ]);

  if (isEdit) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  }
}

// Arahan Pembayaran QR / DuitNow
async function showPaymentInstructions(ctx, orderInfo, pkg) {
  const text = `💳 *ARAHAN PEMBAYARAN QR*\n\n` +
    `📌 *No. Pesanan:* \`${orderInfo.orderRef}\`\n` +
    `📦 *Pakej:* ${pkg.name}\n` +
    `⚡ *Kuota:* \`${pkg.tokens.toLocaleString()} Tokens\` (${pkg.valid_days} Hari)\n\n` +
    `💵 *JUMLAH PERLU DIBAYAR:* *RM ${orderInfo.amountPaid.toFixed(2)}*\n` +
    `_(Sila bayar jumlah tepat *RM ${orderInfo.amountPaid.toFixed(2)}* termasuk sen untuk pengesahan automatik)_\n\n` +
    `🏦 *Maklumat Bank / QR DuitNow:*\n` +
    `• Bank: *${orderInfo.bankName}*\n` +
    `• No. Akaun / Tel: \`${orderInfo.accountNo}\`\n` +
    `• Nama Akaun: *${orderInfo.accountName}*\n\n` +
    `📸 *LANGKAH SETERUSNYA:*\n` +
    `1. Buat pemindahan atau scan QR DuitNow dengan jumlah *RM ${orderInfo.amountPaid.toFixed(2)}*.\n` +
    `2. Ambil tangkapan skrin (screenshot) atau foto **RESIT BAYARAN**.\n` +
    `3. **HANTARKAN GAMBAR RESIT** tersebut di ruang sembang ini.\n\n` +
    `⚡ API Key akan dihantar secara automatik sebaik sahaja resit disahkan!`;

  await ctx.reply(text, { parse_mode: 'Markdown' });
}

module.exports = { registerUserHandlers };
