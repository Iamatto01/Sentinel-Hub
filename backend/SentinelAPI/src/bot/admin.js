const { Markup } = require('telegraf');
const db = require('../lib/db');
const bandelbanget = require('../lib/bandelbanget');

// Semak sama ada pengirim adalah Admin
function isAdmin(ctx) {
  const adminId = String(process.env.ADMIN_TELEGRAM_ID || '').trim();
  const userId = String(ctx.from?.id || '').trim();
  return adminId && userId === adminId;
}

function registerAdminHandlers(bot) {
  // Command /admin
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply('⚠️ Akses Ditolak. Anda bukan admin sistem ini.');
    }
    await showAdminPanel(ctx);
  });

  // Action: Callback admin_menu
  bot.action('admin_menu', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Akses ditolak.');
    await ctx.answerCbQuery();
    await showAdminPanel(ctx, true);
  });

  // Action: Callback admin_reseller_info
  bot.action('admin_reseller_info', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Akses ditolak.');
    await ctx.answerCbQuery('Mengambil data reseller...');

    try {
      const info = await bandelbanget.getResellerInfo();
      const quotaFormatted = (info.resellerQuota || 0).toLocaleString();
      const totalQuotaFormatted = (info.totalQuota || 0).toLocaleString();
      let totalKeys = 0;
      try {
        const keysData = await bandelbanget.getCustomerKeys({ limit: 1 });
        totalKeys = keysData.total || 0;
      } catch (e) {}

      const text = `📊 *MAKLUMAT RESELLER BANDELBANGET*\n\n` +
        `🆔 *Reseller ID:* \`${info.resellerId || '-'}\`\n` +
        `⚡ *Baki Kuota:* \`${quotaFormatted} / ${totalQuotaFormatted} Tokens\`\n` +
        `🔑 *Jumlah Customer Keys:* \`${totalKeys}\`\n` +
        `💰 *Baki Komisen (Balance):* \`RM ${info.balance || 0}\`\n\n` +
        `Status pautan API ke BandelBanget: ✅ *AKTIF*`;

      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Refresh', 'admin_reseller_info')],
          [Markup.button.callback('⬅️ Kembali ke Admin', 'admin_menu')]
        ])
      });
    } catch (err) {
      await ctx.reply(`❌ Ralat mengambil data reseller: ${err.message}`);
    }
  });

  // Action: Callback admin_packages
  bot.action('admin_packages', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Akses ditolak.');
    await ctx.answerCbQuery();

    const packages = db.getAllPackages();
    let text = `📦 *SENARAI PAKEJ JUALLAN TERKINI*\n\n`;

    if (packages.length === 0) {
      text += `_Tiada pakej aktif._`;
    } else {
      packages.forEach((pkg, index) => {
        text += `${index + 1}. *${pkg.name}*\n` +
          `   • Kuota: \`${pkg.tokens.toLocaleString()} Tokens\`\n` +
          `   • Sah: \`${pkg.valid_days} Hari\`\n` +
          `   • Harga: *RM ${pkg.price_myr.toFixed(2)}*\n\n`;
      });
    }

    const buttons = packages.map(pkg => [
      Markup.button.callback(`🗑️ Padam: ${pkg.name}`, `del_pkg_${pkg.id}`)
    ]);
    buttons.push([Markup.button.callback('➕ Tambah Pakej Baharu', 'add_pkg_start')]);
    buttons.push([Markup.button.callback('⬅️ Kembali ke Admin', 'admin_menu')]);

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  });

  // Action: Padam Pakej
  bot.action(/^del_pkg_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Akses ditolak.');
    const pkgId = ctx.match[1];
    db.deletePackage(pkgId);
    await ctx.answerCbQuery('Pakej telah dipadam!');
    await ctx.editMessageText('✅ Pakej telah dipadamkan.', Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Kembali ke Pakej', 'admin_packages')]
    ]));
  });

  // Action: Tambah Pakej
  bot.action('add_pkg_start', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Akses ditolak.');
    await ctx.answerCbQuery();
    await ctx.reply(
      `📝 *TAMBAH PAKEJ BAHARU*\n\n` +
      `Format hantar mesej:\n` +
      `\`ADMIN_ADD_PKG|Nama Pakej|TokenAmount|ValidDays|PriceMYR\`\n\n` +
      `Contoh:\n` +
      `\`ADMIN_ADD_PKG|Pakej VIP 200M|200000000|30|60\``,
      { parse_mode: 'Markdown' }
    );
  });

  // Action: Callback admin_stats
  bot.action('admin_stats', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Akses ditolak.');
    await ctx.answerCbQuery();

    const stats = db.getStats();
    const text = `📈 *LAPORAN JUALAN & STATISTIK*\n\n` +
      `👥 *Jumlah Pengguna Bot:* \`${stats.totalUsers}\`\n` +
      `✅ *Jumlah Pesanan Berjaya:* \`${stats.totalOrders}\`\n` +
      `⏳ *Pesanan Menunggu Pengesahan:* \`${stats.pendingOrders}\`\n` +
      `💰 *Jumlah Hasil Jualan:* *RM ${stats.totalRevenue.toFixed(2)}*`;

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Senarai Pesanan Terkini', 'admin_orders_list')],
        [Markup.button.callback('⬅️ Kembali ke Admin', 'admin_menu')]
      ])
    });
  });

  // Action: Callback admin_orders_list
  bot.action('admin_orders_list', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Akses ditolak.');
    await ctx.answerCbQuery();

    const orders = db.getAllOrders(10);
    let text = `📋 *10 PESANAN TERKINI*\n\n`;

    if (orders.length === 0) {
      text += `_Tiada pesanan lagi._`;
    } else {
      orders.forEach(ord => {
        const statusEmoji = ord.status === 'approved' ? '✅' : ord.status === 'rejected' ? '❌' : '⏳';
        text += `${statusEmoji} *\`${ord.order_ref}\`*\n` +
          `   • Pembeli: ${ord.user_name} (\`${ord.user_id}\`)\n` +
          `   • Item: ${ord.package_name}\n` +
          `   • Jumlah: RM ${ord.amount_paid ? ord.amount_paid.toFixed(2) : ord.price_myr.toFixed(2)}\n` +
          `   • Tarikh: ${new Date(ord.created_at).toLocaleString('ms-MY')}\n\n`;
      });
    }

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Kembali ke Admin', 'admin_menu')]
      ])
    });
  });

  // Action: Callback admin_settings
  bot.action('admin_settings', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Akses ditolak.');
    await ctx.answerCbQuery();

    const bankName = db.getSetting('duitnow_bank_name', '-');
    const accNo = db.getSetting('duitnow_account_no', '-');
    const accName = db.getSetting('duitnow_account_name', '-');

    const text = `⚙️ *TETAPAN PEMBAYARAN DUITNOW QR*\n\n` +
      `🏦 *Nama Bank / E-Wallet:* \`${bankName}\`\n` +
      `🔢 *No. Akaun / No. Telefon:* \`${accNo}\`\n` +
      `👤 *Nama Pemegang Akaun:* \`${accName}\`\n\n` +
      `Untuk menukar tetapan, hantar mesej format:\n` +
      `\`SET_BANK|Nama Bank|No Akaun|Nama Pemegang\``;

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Kembali ke Admin', 'admin_menu')]
      ])
    });
  });

  // Action: APPROVE ORDER BY ADMIN (Button click)
  bot.action(/^approve_(ORD-[A-Za-z0-9\-]+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Akses ditolak.');
    const orderRef = ctx.match[1];
    await ctx.answerCbQuery('Memproses kelulusan pesanan...');

    const order = db.getOrderByRef(orderRef);
    if (!order) return ctx.reply('❌ Pesanan tidak dijumpai dalam pangkalan data.');

    if (order.status === 'approved') {
      return ctx.reply('⚠️ Pesanan ini telah pun diluluskan sebelum ini.');
    }

    try {
      let result;
      let generatedKey = '';
      let dashboardUrl = '';

      if (order.type === 'topup' && order.target_key_id) {
        // Topup key sedia ada
        result = await bandelbanget.addQuotaToKey({
          targetKeyId: order.target_key_id,
          addTokens: order.tokens,
          validDays: order.valid_days
        });
        generatedKey = order.target_key_token || 'Key Topup';
        dashboardUrl = result.dashboardUrl || `https://bandelbanget.xyz/public/quota/${generatedKey}`;
      } else {
        // Cipta Key Baharu
        result = await bandelbanget.createCustomerKey({
          name: order.user_name || 'Customer Baru',
          maxTokens: order.tokens,
          validDays: order.valid_days
        });
        generatedKey = result.key || result.secretToken || '';
        dashboardUrl = result.dashboardUrl || (result.secretToken ? `https://bandelbanget.xyz/public/quota/${result.secretToken}` : '');
      }

      // Kemaskini status pesanan dalam SQLite DB
      db.updateOrderStatus(orderRef, 'approved', {
        generatedKey,
        dashboardUrl
      });

      // Hantar notifikasi & API Key kepada pelanggan dalam Telegram
      const customerText = `🎉 *PEMBAYARAN DISAHKAN! (PESANAN #${orderRef})*\n\n` +
        `Terima kasih! Pesanan API Key anda telah diluluskan.\n\n` +
        `🔑 *API Key Anda:* \`${generatedKey}\`\n` +
        `🌐 *Base URL:* \`https://bandelbanget.xyz/v1\`\n` +
        `⚡ *Kuota:* \`${order.tokens.toLocaleString()} Tokens\`\n` +
        `📅 *Tempoh Sah:* \`${order.valid_days} Hari\`\n\n` +
        `📊 *Pautan Dashboard Quota Anda:*\n[Buka Dashboard Quota](${dashboardUrl})\n\n` +
        `💡 *Cara Guna:* Masukkan Base URL dan API Key di atas dalam aplikasi OpenAI-compatible (NextChat, TypingMind, ChatBox, V2Ray, dll).`;

      try {
        await bot.telegram.sendMessage(order.user_id, customerText, {
          parse_mode: 'Markdown',
          disable_web_page_preview: false
        });
      } catch (custErr) {
        console.error(`[Admin Approve] Gagal hantar Mesej ke Customer (${order.user_id}):`, custErr.message);
      }

      // Kemaskini mesej di chat Admin
      await ctx.editMessageCaption(
        `✅ *PESANAN #${orderRef} DILULUSKAN*\n\n` +
        `👤 *Pembeli:* ${order.user_name} (\`${order.user_id}\`)\n` +
        `📦 *Item:* ${order.package_name}\n` +
        `💰 *Bayaran:* RM ${(order.amount_paid || order.price_myr).toFixed(2)}\n` +
        `🔑 *Key:* \`${generatedKey}\`\n` +
        `⚡ *Baki Kuota Reseller Terkini:* \`${(result.remainingQuota || 0).toLocaleString()} Tokens\``,
        { parse_mode: 'Markdown' }
      );

    } catch (err) {
      console.error('[Admin Approve Error]:', err);
      await ctx.reply(`❌ Ralat semasa memproses di BandelBanget API: ${err.message}`);
    }
  });

  // Action: REJECT ORDER BY ADMIN (Button click)
  bot.action(/^reject_(ORD-[A-Za-z0-9\-]+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Akses ditolak.');
    const orderRef = ctx.match[1];
    await ctx.answerCbQuery('Pesanan ditolak.');

    const order = db.getOrderByRef(orderRef);
    if (!order) return ctx.reply('❌ Pesanan tidak dijumpai.');

    db.updateOrderStatus(orderRef, 'rejected');

    // Mesej kepada pelanggan
    try {
      await bot.telegram.sendMessage(
        order.user_id,
        `❌ *PESANAN #${orderRef} DITOLAK*\n\nMaaf, resit bayaran anda tidak dapat disahkan atau jumlah tidak mencukupi. Sila hubungi admin jika terdapat sebarang masalah.`,
        { parse_mode: 'Markdown' }
      );
    } catch (custErr) {
      console.error(`[Admin Reject] Gagal hantar ke customer:`, custErr.message);
    }

    await ctx.editMessageCaption(
      `❌ *PESANAN #${orderRef} TELAH DITOLAK*\n\n` +
      `👤 *Pembeli:* ${order.user_name} (\`${order.user_id}\`)\n` +
      `📦 *Item:* ${order.package_name}\n` +
      `💰 *Bayaran:* RM ${(order.amount_paid || order.price_myr).toFixed(2)}`,
      { parse_mode: 'Markdown' }
    );
  });
}

// Tunjuk Menu Panel Admin
async function showAdminPanel(ctx, isEdit = false) {
  const text = `👑 *PANEL KAWALAN ADMIN*\n\n` +
    `Selamat datang ke Pusat Kawalan Bot Reseller API.\n` +
    `Sila pilih tindakan di bawah:`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📊 Maklumat Kuota Reseller', 'admin_reseller_info')],
    [Markup.button.callback('📦 Urus Pakej Jualan', 'admin_packages'), Markup.button.callback('📈 Laporan Jualan', 'admin_stats')],
    [Markup.button.callback('⚙️ Tetapan Bank / QR', 'admin_settings')],
  ]);

  if (isEdit) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  }
}

module.exports = { registerAdminHandlers, isAdmin };
