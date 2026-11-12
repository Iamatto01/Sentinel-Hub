const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbFile = fs.existsSync(path.join(dbDir, 'sentinel_api.db')) ? 'sentinel_api.db' : 'sentinel_api.db';
const dbPath = path.join(dbDir, dbFile);
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Bina jadual pangkalan data jika belum wujud
db.exec(`
  CREATE TABLE IF NOT EXISTS site_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_hash TEXT NOT NULL,
    user_agent TEXT,
    path TEXT DEFAULT '/',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_site_visits_ip ON site_visits(ip_hash);
  CREATE INDEX IF NOT EXISTS idx_site_visits_created ON site_visits(created_at);

  CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tokens INTEGER NOT NULL,
    valid_days INTEGER NOT NULL,
    price_myr REAL NOT NULL,
    type TEXT NOT NULL DEFAULT 'all',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_ref TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT,
    package_id INTEGER,
    package_name TEXT,
    tokens INTEGER NOT NULL,
    valid_days INTEGER NOT NULL,
    price_myr REAL NOT NULL,
    amount_paid REAL,
    type TEXT NOT NULL DEFAULT 'new_key',
    target_key_id INTEGER,
    target_key_token TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_method TEXT DEFAULT 'static_qr',
    payment_ref TEXT,
    receipt_file_id TEXT,
    generated_key TEXT,
    dashboard_url TEXT,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS bot_users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rate_limits (
    user_id INTEGER PRIMARY KEY,
    request_count INTEGER NOT NULL DEFAULT 1,
    window_start DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    package_id INTEGER,
    package_name TEXT,
    api_key TEXT NOT NULL,
    tokens INTEGER NOT NULL,
    valid_days INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    auto_renew INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add expires_at column to existing orders table if not present (migration)
const orderColumns = db.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
if (!orderColumns.includes('expires_at')) {
  db.exec('ALTER TABLE orders ADD COLUMN expires_at DATETIME');
}

// Seed pakej asas atau kemaskini kepada kadar rasmi baru mengikut kuota BandelBanget (Gambar 5: 10M=14d, 50M=14d, 100M=21d, 200M=21d, 500M=28d)
const pkgCountCheck = db.prepare('SELECT COUNT(*) as count FROM packages').get();
if (!pkgCountCheck || pkgCountCheck.count === 0) {
  const insertPackage = db.prepare(`
    INSERT INTO packages (name, tokens, valid_days, price_myr, type, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  insertPackage.run('Starter 10M (14 Hari)', 10000000, 14, 2.00, 'all');
  insertPackage.run('Standard 50M (14 Hari)', 50000000, 14, 4.00, 'all');
  insertPackage.run('Pakej 100M (21 Hari)', 100000000, 21, 6.00, 'all');
  insertPackage.run('Pro Developer 200M (21 Hari)', 200000000, 21, 11.00, 'all');
  insertPackage.run('Agency Master 500M (28 Hari)', 500000000, 28, 25.00, 'all');
}

// Kemas kini pakej sedia ada mengikut piawaian sah BandelBanget tanpa memadam data sedia ada
db.prepare("UPDATE packages SET name = 'Starter 10M (14 Hari)', valid_days = 14 WHERE tokens = 10000000").run();
db.prepare("UPDATE packages SET name = 'Standard 50M (14 Hari)', valid_days = 14 WHERE tokens = 50000000").run();
db.prepare("UPDATE packages SET name = 'Pakej 100M (21 Hari)', valid_days = 21 WHERE tokens = 100000000").run();
db.prepare("UPDATE packages SET name = 'Pro Developer 200M (21 Hari)', valid_days = 21 WHERE tokens = 200000000").run();
db.prepare("UPDATE packages SET name = 'Agency Master 500M (28 Hari)', valid_days = 28 WHERE tokens = 500000000").run();

// Seed tetapan lalulintas jika belum ada
function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

// Initialize default settings from env if missing
if (!getSetting('duitnow_account_no')) {
  setSetting('duitnow_account_no', process.env.DUITNOW_ACCOUNT_NO || 'No Akaun Belum Ditetapkan');
}
if (!getSetting('duitnow_account_name')) {
  setSetting('duitnow_account_name', process.env.DUITNOW_ACCOUNT_NAME || 'Akaun Reseller');
}
if (!getSetting('duitnow_bank_name')) {
  setSetting('duitnow_bank_name', process.env.DUITNOW_BANK_NAME || 'DuitNow QR / TNG eWallet');
}
if (!getSetting('payment_method')) {
  setSetting('payment_method', process.env.PAYMENT_GATEWAY_TYPE || 'static_qr');
}
if (!getSetting('visitor_base_offset') || getSetting('visitor_base_offset') !== '0') {
  setSetting('visitor_base_offset', '0');
}
if (!getSetting('customer_base_offset') || getSetting('customer_base_offset') !== '0') {
  setSetting('customer_base_offset', '0');
}

module.exports = {
  db,
  getSetting,
  setSetting,

  // User helper
  saveUser: (user) => {
    db.prepare(`
      INSERT INTO bot_users (user_id, username, first_name, last_seen)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        last_seen = CURRENT_TIMESTAMP
    `).run(user.id, user.username || '', user.first_name || '');
  },

  // Package helpers
  getAllPackages: () => db.prepare('SELECT * FROM packages WHERE is_active = 1 ORDER BY price_myr ASC').all(),
  getPackageById: (id) => db.prepare('SELECT * FROM packages WHERE id = ?').get(id),
  createPackage: (name, tokens, validDays, priceMyr) => {
    return db.prepare('INSERT INTO packages (name, tokens, valid_days, price_myr) VALUES (?, ?, ?, ?)').run(name, tokens, validDays, priceMyr);
  },
  deletePackage: (id) => db.prepare('UPDATE packages SET is_active = 0 WHERE id = ?').run(id),

  // Order helpers
  createOrder: (orderData) => {
    const stmt = db.prepare(`
      INSERT INTO orders (
        order_ref, user_id, user_name, package_id, package_name, tokens, valid_days, price_myr, amount_paid, type, target_key_id, target_key_token, payment_method, status
      ) VALUES (
        @orderRef, @userId, @userName, @packageId, @packageName, @tokens, @validDays, @priceMyr, @amountPaid, @type, @targetKeyId, @targetKeyToken, @paymentMethod, 'pending'
      )
    `);
    return stmt.run(orderData);
  },
  getOrderByRef: (orderRef) => db.prepare('SELECT * FROM orders WHERE order_ref = ?').get(orderRef),
  getOrderById: (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id),
  getUserOrders: (userId) => db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(userId),
  getAllOrders: (limit = 50) => db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT ?').all(limit),
  updateOrderStatus: (orderRef, status, extraData = {}) => {
    const fields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [status];

    if (extraData.receiptFileId) {
      fields.push('receipt_file_id = ?');
      params.push(extraData.receiptFileId);
    }
    if (extraData.generatedKey) {
      fields.push('generated_key = ?');
      params.push(extraData.generatedKey);
    }
    if (extraData.dashboardUrl) {
      fields.push('dashboard_url = ?');
      params.push(extraData.dashboardUrl);
    }

    params.push(orderRef);
    const sql = `UPDATE orders SET ${fields.join(', ')} WHERE order_ref = ?`;
    return db.prepare(sql).run(...params);
  },

  // Stats helper
  getStats: () => {
    const totalOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'approved'").get().count;
    const totalRevenue = db.prepare("SELECT SUM(price_myr) as total FROM orders WHERE status = 'approved'").get().total || 0;
    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM bot_users").get().count;
    const pendingOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'").get().count;
    return { totalOrders, totalRevenue, totalUsers, pendingOrders };
  },

  // Visitor Tracking & Public Stats Helpers
  recordVisit: ({ ip, userAgent, path = '/' }) => {
    try {
      const ipHash = crypto.createHash('sha256').update(ip || 'unknown-visitor').digest('hex').substring(0, 16);
      // Throttle: 1 visit per IP per 10 minutes to prevent refresh inflating
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const recent = db.prepare('SELECT id FROM site_visits WHERE ip_hash = ? AND created_at > ? LIMIT 1').get(ipHash, tenMinutesAgo);
      if (!recent) {
        db.prepare('INSERT INTO site_visits (ip_hash, user_agent, path) VALUES (?, ?, ?)').run(
          ipHash,
          (userAgent || '').substring(0, 250),
          (path || '/').substring(0, 100)
        );
      }
      return true;
    } catch (e) {
      console.warn('[recordVisit Warning]:', e.message);
      return false;
    }
  },

  getPublicStats: () => {
    const counts = db.prepare(`
      SELECT 
        COUNT(*) as total_visits,
        COUNT(DISTINCT ip_hash) as unique_visitors
      FROM site_visits
    `).get() || { total_visits: 0, unique_visitors: 0 };

    const approvedRow = db.prepare("SELECT COUNT(DISTINCT user_name) as count FROM orders WHERE status = 'approved'").get();
    const approvedOrders = approvedRow ? approvedRow.count : 0;

    return {
      totalVisits: counts.total_visits || 0,
      uniqueVisitors: counts.unique_visitors || 0,
      approvedOrders: approvedOrders
    };
  },

  // Order expiry helpers
  expireOldOrders: () => {
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE orders SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < ?
    `).run(now);
    return result.changes;
  },
  setOrderExpiry: (orderRef, expiresInMs) => {
    const expiresAt = new Date(Date.now() + expiresInMs).toISOString();
    db.prepare('UPDATE orders SET expires_at = ? WHERE order_ref = ?').run(expiresAt, orderRef);
  },
  getExpiringOrders: (hoursAhead = 24) => {
    const threshold = new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();
    return db.prepare(`
      SELECT * FROM orders WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < ?
    `).all(threshold);
  },

  // Rate limiting helpers
  checkRateLimit: (userId, windowMs = 60000, maxRequests = 10) => {
    const now = Date.now();
    const row = db.prepare('SELECT * FROM rate_limits WHERE user_id = ?').get(userId);
    if (!row) {
      db.prepare('INSERT INTO rate_limits (user_id, request_count, window_start) VALUES (?, 1, ?)').run(userId, now);
      return { allowed: true, remaining: maxRequests - 1 };
    }
    if (now - row.window_start > windowMs) {
      db.prepare('UPDATE rate_limits SET request_count = 1, window_start = ? WHERE user_id = ?').run(now, userId);
      return { allowed: true, remaining: maxRequests - 1 };
    }
    if (row.request_count >= maxRequests) {
      return { allowed: false, remaining: 0, retryAfter: windowMs - (now - row.window_start) };
    }
    db.prepare('UPDATE rate_limits SET request_count = request_count + 1 WHERE user_id = ?').run(userId);
    return { allowed: true, remaining: maxRequests - row.request_count - 1 };
  },

  // Subscription helpers
  createSubscription: (subData) => {
    const stmt = db.prepare(`
      INSERT INTO subscriptions (
        user_id, package_id, package_name, api_key, tokens, valid_days, expires_at, auto_renew, status
      ) VALUES (
        @userId, @packageId, @packageName, @apiKey, @tokens, @validDays, @expiresAt, @autoRenew, 'active'
      )
    `);
    return stmt.run(subData);
  },
  getActiveSubscriptions: () => db.prepare('SELECT * FROM subscriptions WHERE status = "active" ORDER BY expires_at ASC').all(),
  getUserSubscriptions: (userId) => db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC').all(userId),
  getExpiringSubscriptions: (daysAhead = 3) => {
    const threshold = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
    return db.prepare(`
      SELECT * FROM subscriptions WHERE status = 'active' AND expires_at < ?
    `).all(threshold);
  },
  updateSubscriptionStatus: (id, status) => {
    db.prepare('UPDATE subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
  }
};
