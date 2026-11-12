/**
 * Cron jobs for SentinelAPI bot
 * - Auto-sync models from BandelBanget
 * - Expire old pending orders
 * - Warn about expiring subscriptions
 * - Warn about expiring payment orders
 */
const cron = require('node-cron');
const db = require('./db');
const payment = require('./payment');
const bandelbanget = require('./bandelbanget');

function startCronJobs() {
  console.log('[Cron] Starting scheduled jobs...');

  // Auto-sync AI models from BandelBanget every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    try {
      const models = await bandelbanget.getModels(true);
      const activeCount = models.filter(m => m.available !== false && m.enabled !== false).length;
      console.log(`[Cron] Auto-synced ${models.length} models (${activeCount} active) from BandelBanget`);
    } catch (err) {
      console.warn('[Cron] Auto-sync models warning:', err.message);
    }
  });

  // Expire old pending orders every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const expired = db.expireOldOrders();
      if (expired > 0) {
        console.log(`[Cron] Expired ${expired} old pending order(s)`);
      }
    } catch (err) {
      console.error('[Cron] Error expiring orders:', err.message);
    }
  });

  // Check for expiring subscriptions every hour (warn 3 days before)
  cron.schedule('0 * * * *', async () => {
    try {
      const expiring = db.getExpiringSubscriptions(3);
      if (expiring.length > 0) {
        console.log(`[Cron] ${expiring.length} subscription(s) expiring within 3 days`);
        // TODO: Send renewal reminder Telegram messages
      }
    } catch (err) {
      console.error('[Cron] Error checking expiring subscriptions:', err.message);
    }
  });

  // Check for expiring payment orders every 30 minutes (warn 15 min before)
  cron.schedule('*/30 * * * *', async () => {
    try {
      const expiring = db.getExpiringOrders(1); // 1 hour ahead
      if (expiring.length > 0) {
        console.log(`[Cron] ${expiring.length} payment order(s) expiring within 1 hour`);
        // TODO: Send expiry warning to users
      }
    } catch (err) {
      console.error('[Cron] Error checking expiring orders:', err.message);
    }
  });

  console.log('[Cron] All scheduled jobs registered successfully');
}

module.exports = { startCronJobs };
