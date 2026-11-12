require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Telegraf } = require('telegraf');
const db = require('./lib/db');
const bandelbanget = require('./lib/bandelbanget');
const paymentService = require('./lib/payment');
const { registerAdminHandlers } = require('./bot/admin');
const { registerUserHandlers } = require('./bot/handlers');
const { startCronJobs } = require('./lib/cron');

const app = express();
const PORT = process.env.PORT || 3000;

const path = require('path');
const axios = require('axios');

// Helper to notify Admin's Telegram whenever an order is created or paid
async function sendTelegramAdminAlert(text) {
  const botToken = process.env.BOT_TOKEN;
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!botToken || botToken.includes('YOUR_TELEGRAM_BOT_TOKEN') || !adminId || String(adminId) === '123456789') {
    console.log('[Telegram Admin Alert (Simulasi - Sila set BOT_TOKEN & ADMIN_TELEGRAM_ID di .env)]:\n', text.replace(/\*/g, ''));
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await axios.post(url, {
      chat_id: adminId,
      text: text,
      parse_mode: 'Markdown'
    }, { timeout: 8000 });
  } catch (err) {
    console.warn('[Telegram Admin Alert Warning]:', err.message);
  }
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend website & static assets
app.use(express.static(path.join(__dirname, '..')));

// BandelBanget Live Sync Endpoints
app.get('/api/bandel/quota', async (req, res) => {
  try {
    const info = await bandelbanget.getResellerInfo();
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/bandel/models', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1' || req.query.force === 'true';
    const models = await bandelbanget.getModels(forceRefresh);
    const activeModels = models.filter(m => m.available !== false && m.enabled !== false);

    // Prevent proxy/CDN/browser stale caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json({
      success: true,
      total: models.length,
      activeCount: activeModels.length,
      availableCount: activeModels.length,
      updatedAt: bandelbanget._modelsCacheAt || Date.now(),
      models: models
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/bandel/tiers', async (req, res) => {
  try {
    const tiers = await bandelbanget.getTopupTiers();
    res.json({ success: true, tiers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/bandel/customer-keys', async (req, res) => {
  try {
    const keys = await bandelbanget.getCustomerKeys({ limit: 50 });
    res.json({ success: true, data: keys });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/packages', (req, res) => {
  try {
    const packages = db.getAllPackages();
    res.json({ success: true, packages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cache Bandel customer keys count for 60 seconds
let cachedCustomerKeysCount = 1;
let lastCustomerKeysFetch = 0;

async function getLiveCustomerCount() {
  const now = Date.now();
  if (now - lastCustomerKeysFetch < 60000) {
    return cachedCustomerKeysCount;
  }
  try {
    const keys = await bandelbanget.getCustomerKeys({ limit: 50 });
    if (keys && typeof keys.total === 'number') {
      cachedCustomerKeysCount = keys.total;
    } else if (keys && Array.isArray(keys.data)) {
      cachedCustomerKeysCount = keys.data.length;
    }
    lastCustomerKeysFetch = now;
  } catch (err) {
    // Keep last cached value on error
  }
  return cachedCustomerKeysCount;
}

// Record page visit and return live community stats
app.post('/api/stats/visit', async (req, res) => {
  try {
    const clientIp = req.headers['cf-connecting-ip'] || 
                     (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) || 
                     req.socket.remoteAddress || 
                     '127.0.0.1';
    const userAgent = req.headers['user-agent'] || '';
    const pagePath = req.body && req.body.path ? req.body.path : '/';

    db.recordVisit({ ip: clientIp, userAgent, path: pagePath });

    const stats = db.getPublicStats();
    const bandelCount = await getLiveCustomerCount();
    const totalCustomers = Math.max(stats.approvedOrders, bandelCount);

    res.json({
      success: true,
      visitors: stats.uniqueVisitors,
      totalVisits: stats.totalVisits,
      customers: totalCustomers
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Public Stats endpoint (without registering a new visit)
app.get('/api/stats/public', async (req, res) => {
  try {
    const stats = db.getPublicStats();
    const bandelCount = await getLiveCustomerCount();
    const totalCustomers = Math.max(stats.approvedOrders, bandelCount);

    res.json({
      success: true,
      visitors: stats.uniqueVisitors,
      totalVisits: stats.totalVisits,
      customers: totalCustomers
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Web Automated Checkout: Create Order
app.post('/api/order/create', async (req, res) => {
  try {
    const { packageId, customerName, customerEmail } = req.body;
    let pkg = null;
    if (packageId) {
      pkg = db.getPackageById(packageId);
    }
    if (!pkg) {
      // Fallback: pick standard 100M package if not specified
      const packages = db.getAllPackages();
      pkg = packages.find(p => p.tokens === 100000000) || packages[0];
    }
    if (!pkg) {
      return res.status(404).json({ success: false, error: 'Pakej tidak dijumpai' });
    }

    const paymentData = await paymentService.createPaymentOrder({
      userId: Math.floor(100000 + Math.random() * 900000),
      userName: customerEmail || customerName || 'Pelanggan Web',
      packageItem: pkg
    });

    // Notify Owner's Telegram about the new web order
    sendTelegramAdminAlert(
      `🛒 *PESANAN BARU DI LAMAN WEB!*\n\n` +
      `📦 Pakej: *${pkg.name}*\n` +
      `💰 Jumlah: *RM ${(paymentData.amountPaid || paymentData.basePrice).toFixed(2)}*\n` +
      `👤 Pelanggan: *${customerName || 'Web Guest'}* (${customerEmail || 'tiada emel'})\n` +
      `🔖 No. Pesanan: \`${paymentData.orderRef}\`\n\n` +
      `⏳ Pelanggan sedang melihat QR DuitNow anda...`
    );

    res.json({
      success: true,
      order: {
        orderRef: paymentData.orderRef,
        amountPaid: paymentData.amountPaid,
        basePrice: paymentData.basePrice,
        packageName: pkg.name,
        tokens: pkg.tokens,
        validDays: pkg.valid_days,
        bankName: paymentData.bankName,
        accountNo: paymentData.accountNo,
        accountName: paymentData.accountName,
        qrImageUrl: paymentData.qrImageUrl,
        toyyibpayUrl: paymentData.toyyibpayUrl,
        paymentMethod: paymentData.paymentMethod
      }
    });
  } catch (err) {
    console.error('[Create Web Order Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Web Automated Checkout: Poll Order Status
app.get('/api/order/status/:orderRef', async (req, res) => {
  try {
    const order = db.getOrderByRef(req.params.orderRef);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pesanan tidak dijumpai' });
    }

    res.json({
      success: true,
      status: order.status,
      orderRef: order.order_ref,
      packageName: order.package_name,
      tokens: order.tokens,
      validDays: order.valid_days,
      generatedKey: order.generated_key || null,
      dashboardUrl: order.dashboard_url || null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Web Automated Checkout: Instant Auto-Verification & Key Generation
app.post('/api/order/verify-payment', async (req, res) => {
  try {
    const { orderRef, referenceNo } = req.body;
    const order = db.getOrderByRef(orderRef);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pesanan tidak dijumpai' });
    }

    if (order.status === 'approved') {
      return res.json({
        success: true,
        status: 'approved',
        apiKey: order.generated_key,
        dashboardUrl: order.dashboard_url,
        tokens: order.tokens,
        validDays: order.valid_days
      });
    }

    // Auto-generate customer API key via BandelBanget Reseller API
    const result = await bandelbanget.createCustomerKey({
      name: order.user_name || `Web Customer ${orderRef}`,
      maxTokens: order.tokens,
      validDays: order.valid_days
    });

    const generatedKey = result.key || result.secretToken || '';
    const dashboardUrl = result.dashboardUrl || (result.secretToken ? `https://bandelbanget.xyz/public/quota/${result.secretToken}` : '');

    db.updateOrderStatus(orderRef, 'approved', {
      generatedKey,
      dashboardUrl,
      receiptFileId: referenceNo || 'WEB_DIRECT_VERIFIED'
    });

    console.log(`[Web Auto-Order] Key issued for #${orderRef}: ${generatedKey} (${order.tokens} tokens)`);

    // Notify Owner's Telegram that money is in and key was issued!
    sendTelegramAdminAlert(
      `💰 *DUIT MASUK & KUNCI DIJANA! (RM ${order.price_myr.toFixed(2)})*\n\n` +
      `📦 Pakej: *${order.package_name}*\n` +
      `👤 Pelanggan: *${order.user_name}*\n` +
      `🧾 Rujukan: \`${referenceNo || 'Web Direct'}\`\n` +
      `🔑 Kunci API: \`${generatedKey}\`\n` +
      `⚡ Kuota: *${order.tokens.toLocaleString()} Tokens*\n` +
      `📅 Sah: *${order.valid_days} Hari*\n\n` +
      `✅ Duit RM ${order.price_myr.toFixed(2)} terus masuk ke akaun bank anda (Fee RM 0)!`
    );

    res.json({
      success: true,
      status: 'approved',
      apiKey: generatedKey,
      dashboardUrl,
      tokens: order.tokens,
      validDays: order.valid_days
    });
  } catch (err) {
    console.error('[Web Verify Payment Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Express API Health Status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    service: 'Sentinel Reseller API Gateway & Telegram Bot',
    timestamp: new Date().toISOString()
  });
});

// Detailed Health Check Endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: { status: 'unknown', detail: '' },
      bandelbanget: { status: 'unknown', detail: '' },
      orders: { status: 'unknown', detail: '' }
    }
  };

  // Check DB connection
  try {
    db.db.prepare('SELECT 1').get();
    health.services.database = { status: 'ok', detail: 'SQLite connected' };
  } catch (err) {
    health.services.database = { status: 'error', detail: err.message };
    health.status = 'degraded';
  }

  // Check BandelBanget API
  try {
    const info = await bandelbanget.getResellerInfo();
    health.services.bandelbanget = {
      status: 'ok',
      detail: `Reseller ID: ${info.resellerId || 'N/A'}, Quota: ${(info.resellerQuota || 0).toLocaleString()} tokens`
    };
  } catch (err) {
    health.services.bandelbanget = { status: 'error', detail: err.message };
    health.status = 'degraded';
  }

  // Check pending orders
  try {
    const stats = db.getStats();
    health.services.orders = {
      status: 'ok',
      detail: `${stats.pendingOrders} pending, ${stats.totalOrders} approved, ${stats.totalUsers} users`
    };
  } catch (err) {
    health.services.orders = { status: 'error', detail: err.message };
  }

  res.json(health);
});

// ToyyibPay Webhook Callback Handler with HMAC Signature Verification
app.post('/payment/toyyibpay/callback', async (req, res) => {
  try {
    // Verify HMAC signature if secret key is configured
    const secretKey = process.env.TOYYIBPAY_SECRET_KEY;
    if (secretKey) {
      const signature = req.headers['x-toyyibpay-signature'] || '';
      const rawBody = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(rawBody)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error(`[${new Date().toISOString()}] [ToyyibPay] Signature mismatch!`);
        return res.status(401).send('Invalid signature');
      }
    }

    const { refno, status, order_id } = req.body;
    console.log(`[${new Date().toISOString()}] [ToyyibPay Callback]:`, req.body);

    const orderRef = order_id || refno;
    if (String(status) === '1' && orderRef) {
      const order = db.getOrderByRef(orderRef);
      if (order && order.status === 'pending') {
        let result;
        let generatedKey = '';
        let dashboardUrl = '';

        if (order.type === 'topup' && order.target_key_id) {
          result = await bandelbanget.addQuotaToKey({
            targetKeyId: order.target_key_id,
            addTokens: order.tokens,
            validDays: order.valid_days
          });
          generatedKey = order.target_key_token || 'Key Topup';
          dashboardUrl = result.dashboardUrl || `https://bandelbanget.xyz/public/quota/${generatedKey}`;
        } else {
          result = await bandelbanget.createCustomerKey({
            name: order.user_name || 'Customer Baru',
            maxTokens: order.tokens,
            validDays: order.valid_days
          });
          generatedKey = result.key || result.secretToken || '';
          dashboardUrl = result.dashboardUrl || (result.secretToken ? `https://bandelbanget.xyz/public/quota/${result.secretToken}` : '');
        }

        db.updateOrderStatus(orderRef, 'approved', { generatedKey, dashboardUrl });

        // Send key to Telegram Customer if user_id is a valid Telegram ID
        if (bot && order.user_id && order.user_id > 1000000) {
          try {
          const customerText = `🎉 *PEMBAYARAN AUTO DISAHKAN! (PESANAN #${orderRef})*\n\n` +
            `Terima kasih! Bayaran anda telah disahkan secara automatik.\n\n` +
            `🔑 *API Key Anda:* \`${generatedKey}\`\n` +
            `🌐 *Base URL:* \`https://bandelbanget.xyz/v1\`\n` +
            `⚡ *Kuota:* \`${order.tokens.toLocaleString()} Tokens\`\n` +
            `📅 *Tempoh Sah:* \`${order.valid_days} Hari\`\n\n` +
            `📊 *Pautan Dashboard Quota Anda:*\n[Buka Dashboard Quota](${dashboardUrl})`;

          await bot.telegram.sendMessage(order.user_id, customerText, { parse_mode: 'Markdown' });
        } catch (tgErr) {
          console.warn('[Telegram Notify Webhook Warning]:', tgErr.message);
        }
      }
    }
  }
  res.send('OK');
} catch (err) {
    console.error(`[${new Date().toISOString()}] [ToyyibPay Webhook Error]:`, err.message);
    res.status(500).send('Error processing callback');
  }
});

// Setup Telegram Bot
const botToken = process.env.BOT_TOKEN;

if (!botToken || botToken.includes('YOUR_TELEGRAM_BOT_TOKEN')) {
  console.warn('⚠️ BOT_TOKEN belum ditetapkan dalam .env! Sila masukkan BOT_TOKEN daripada @BotFather.');
}

const bot = new Telegraf(botToken || '7890000000:DUMMY_TOKEN_PLEASE_SET_IN_ENV');

// Error Handling global untuk Telegram Bot
bot.catch((err, ctx) => {
  console.error(`[Telegraf Bot Error] untuk ${ctx.updateType}:`, err);
});

// Daftar Pengendali Bot
registerAdminHandlers(bot);
registerUserHandlers(bot);

// Mulakan Webserver & Telegram Bot
app.listen(PORT, async () => {
  console.log(`🚀 [Server Web] Berjalan di port ${PORT} (Akses laman web: http://localhost:${PORT})`);

  // Semak sambungan Reseller API Key & Kuota
  try {
    const info = await bandelbanget.getResellerInfo();
    const models = await bandelbanget.getModels();
    console.log(`✅ [BandelBanget Reseller API] Berjaya Diselaraskan!`);
    console.log(`   🆔 Reseller ID: ${info.resellerId}`);
    console.log(`   ⚡ Baki Kuota Reseller: ${info.resellerQuota.toLocaleString()} / ${info.totalQuota.toLocaleString()} Tokens`);
    console.log(`   🤖 Model Aktif: ${models.length} Model (Tersedia untuk pelanggan)`);
  } catch (bbErr) {
    console.warn(`⚠️ [BandelBanget Reseller API]:`, bbErr.message);
  }

  // Lancarkan Telegram Bot jika token sudah diset
  if (botToken && !botToken.includes('YOUR_TELEGRAM_BOT_TOKEN')) {
    try {
      await bot.launch();
      console.log('🤖 [Telegram Bot] Berjaya dijalankan!');
    } catch (err) {
      console.error('❌ [Telegram Bot] Gagal melancarkan bot:', err.message);
    }
  } else {
    console.log('💡 Tip: Kemaskini BOT_TOKEN dalam .env jika ingin mengaktifkan Telegram Bot.');
  }
});

// Graceful Shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
