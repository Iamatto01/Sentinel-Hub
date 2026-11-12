const axios = require('axios');

/**
 * Retry wrapper with exponential backoff (1s, 2s, 4s for 3 retries)
 */
async function withRetry(fn, maxRetries = 3, baseDelay = 1000, label = 'API') {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Jangan retry jika error 400 atau 409 (client error)
      if (err.response && (err.response.status === 400 || err.response.status === 409 || err.response.status === 401 || err.response.status === 403)) {
        throw err;
      }
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [Retry] ${label} attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Extract user-friendly error message
 */
function extractErrorMessage(err) {
  if (err.response) {
    const data = err.response.data;
    if (typeof data === 'string') return data.substring(0, 200);
    if (data && typeof data === 'object') {
      return data.error || data.message || JSON.stringify(data).substring(0, 200);
    }
    return `HTTP ${err.response.status}`;
  }
  if (err.code === 'ECONNABORTED') return 'Request timed out - server did not respond in time';
  if (err.code === 'ENOTFOUND') return 'Cannot resolve API hostname - check your network connection';
  if (err.code === 'ECONNREFUSED') return 'Connection refused - API server may be down';
  return err.message || 'Unknown network error';
}

class BandelBangetClient {
  constructor() {
    this.resellerApiKey = process.env.BANDELBANGET_RESELLER_KEY || 'rsl_1e68c4c051c23a91dbbe5de91862424e1bb264298bf1173665aaedcf8016e013';
    this.resellerBaseUrl = (process.env.BANDELBANGET_API_BASE_URL || 'https://bandelbanget.xyz/api/reseller/v1').replace(/\/+$/, '');
    this.customerBaseUrl = 'https://bandelbanget.xyz/v1';

    // Server-side model cache (60s TTL for fast auto-updates)
    this._modelsCache = null;
    this._modelsCacheAt = 0;
    this._modelsCacheTtl = 60 * 1000; // 60 seconds
  }

  /**
   * Helper headers for Reseller API calls
   */
  getHeaders() {
    return {
      Authorization: `Bearer ${this.resellerApiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * 1. Check Reseller Quota
   * GET /api/reseller/v1/quota
   * Returns: { resellerId, quota, totalQuota, balance }
   */
  async getResellerInfo() {
    return withRetry(async () => {
      const url = `${this.resellerBaseUrl}/quota`;
      const response = await axios.get(url, {
        headers: this.getHeaders(),
        timeout: 10000
      });
      const d = response.data || {};
      return {
        resellerId: d.resellerId || 'N/A',
        resellerQuota: d.quota || 0,
        totalQuota: d.totalQuota || 0,
        balance: d.balance || 0
      };
    }, 3, 1000, 'getResellerInfo').catch(error => {
      const msg = extractErrorMessage(error);
      console.error(`[${new Date().toISOString()}] [BandelBanget] getResellerInfo Error:`, msg);
      throw new Error(`Gagal mengambil maklumat Reseller: ${msg}`);
    });
  }

  /**
   * 2. Create a Customer API Key
   * POST /api/reseller/v1/customer-keys
   * Body: { name, maxTokens, validDays }
   * Note: maxTokens minimum 5,000,000. Validity: 7, 14, 21, or 28 days.
   * Returns: { id, name, key, maxTokens, validDays, remainingQuota, dashboardUrl }
   */
  async createCustomerKey({ name = 'Customer Baru', maxTokens = 5000000, validDays = 28 }) {
    // Pastikan nilai mematuhi syarat API BandelBanget: hanya huruf, nombor, dan ruang (1-64 aksara)
    let sanitizedName = String(name || 'Customer').replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!sanitizedName || sanitizedName.length === 0) {
      sanitizedName = `Customer ${Date.now().toString().slice(-4)}`;
    }
    if (sanitizedName.length > 64) {
      sanitizedName = sanitizedName.substring(0, 64).trim();
    }

    const parsedTokens = Math.max(5000000, parseInt(maxTokens) || 5000000);
    const validDaysOptions = [7, 14, 21, 28];
    const parsedDays = validDaysOptions.includes(parseInt(validDays)) ? parseInt(validDays) : 28;

    return withRetry(async () => {
      const url = `${this.resellerBaseUrl}/customer-keys`;
      const response = await axios.post(url, {
        name: sanitizedName,
        maxTokens: parsedTokens,
        validDays: parsedDays
      }, {
        headers: this.getHeaders(),
        timeout: 15000
      });

      return response.data;
    }, 2, 1000, 'createCustomerKey').catch(error => {
      const msg = extractErrorMessage(error);
      console.error(`[${new Date().toISOString()}] [BandelBanget] createCustomerKey Error:`, msg);
      throw new Error(`Gagal membina Customer Key: ${msg}`);
    });
  }

  /**
   * 3. List Customer API Keys
   * GET /api/reseller/v1/customer-keys?limit=50&page=1
   */
  async getCustomerKeys({ limit = 50, page = 1, search = '' } = {}) {
    return withRetry(async () => {
      let url = `${this.resellerBaseUrl}/customer-keys?limit=${limit}&page=${page}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      const response = await axios.get(url, {
        headers: this.getHeaders(),
        timeout: 10000
      });
      return response.data;
    }, 3, 1000, 'getCustomerKeys').catch(error => {
      const msg = extractErrorMessage(error);
      throw new Error(`Gagal mengambil senarai Customer Keys: ${msg}`);
    });
  }

  /**
   * 4. Customer Quota Detail
   * GET /api/reseller/v1/customer-keys/:id
   */
  async getCustomerKeyDetail(customerId) {
    return withRetry(async () => {
      const url = `${this.resellerBaseUrl}/customer-keys/${customerId}`;
      const response = await axios.get(url, {
        headers: this.getHeaders(),
        timeout: 10000
      });
      return response.data;
    }, 3, 1000, 'getCustomerKeyDetail').catch(error => {
      const msg = extractErrorMessage(error);
      throw new Error(`Gagal mengambil perincian Customer Key: ${msg}`);
    });
  }

  /**
   * 5. List Customer Topup Tiers
   * GET /api/reseller/v1/customer-topup-tiers
   */
  async getTopupTiers() {
    return withRetry(async () => {
      const url = `${this.resellerBaseUrl}/customer-topup-tiers`;
      const response = await axios.get(url, {
        headers: this.getHeaders(),
        timeout: 10000
      });
      return response.data?.tiers || [];
    }, 3, 1000, 'getTopupTiers').catch(error => {
      const msg = extractErrorMessage(error);
      throw new Error(`Gagal mengambil senarai Topup Tiers: ${msg}`);
    });
  }

  /**
   * 6. Top up a Customer API Key from reseller balance
   * POST /api/reseller/v1/customer-keys/topup
   * Body: { hashtag: '#BawangMerah', tierId: '5m' }
   */
  async topupCustomerKey({ hashtag, tierId }) {
    return withRetry(async () => {
      const url = `${this.resellerBaseUrl}/customer-keys/topup`;
      const response = await axios.post(url, {
        hashtag: hashtag.startsWith('#') ? hashtag : `#${hashtag}`,
        tierId: String(tierId)
      }, {
        headers: this.getHeaders(),
        timeout: 15000
      });
      return response.data;
    }, 2, 1000, 'topupCustomerKey').catch(error => {
      const msg = extractErrorMessage(error);
      throw new Error(`Gagal menambah kuota customer: ${msg}`);
    });
  }

  /**
   * 7. List Active Models with Multiplier & Grade (Auto-cached with 60s TTL)
   * GET /api/reseller/v1/models
   */
  async getModels(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this._modelsCache && (now - this._modelsCacheAt < this._modelsCacheTtl)) {
      return this._modelsCache;
    }

    try {
      const models = await withRetry(async () => {
        const url = `${this.resellerBaseUrl}/models`;
        const response = await axios.get(url, {
          headers: this.getHeaders(),
          timeout: 10000
        });
        return response.data?.data || [];
      }, 3, 1000, 'getModels');

      if (Array.isArray(models) && models.length > 0) {
        this._modelsCache = models;
        this._modelsCacheAt = now;
      }
      return this._modelsCache || models || [];
    } catch (error) {
      const msg = extractErrorMessage(error);
      console.error(`[${new Date().toISOString()}] [BandelBanget] getModels Error:`, msg);
      // Graceful fallback: return existing cached models if upstream temporarily hiccups
      if (this._modelsCache && this._modelsCache.length > 0) {
        console.warn(`[${new Date().toISOString()}] Serving ${this._modelsCache.length} cached models during upstream hiccup.`);
        return this._modelsCache;
      }
      throw new Error(`Gagal mengambil senarai model: ${msg}`);
    }
  }

  /**
   * 8. Usage by Model (Reseller)
   * GET /api/reseller/v1/usage-by-model?period=today
   */
  async getUsageByModel(period = 'today', customerId = null) {
    return withRetry(async () => {
      let url = `${this.resellerBaseUrl}/usage-by-model?period=${period}`;
      if (customerId) url += `&customerId=${customerId}`;
      const response = await axios.get(url, {
        headers: this.getHeaders(),
        timeout: 10000
      });
      return response.data;
    }, 3, 1000, 'getUsageByModel').catch(error => {
      const msg = extractErrorMessage(error);
      throw new Error(`Gagal mengambil data penggunaan: ${msg}`);
    });
  }

  /**
   * 9. Create Reseller Invitation
   * POST /api/reseller/v1/invitations
   */
  async createResellerInvitation() {
    return withRetry(async () => {
      const url = `${this.resellerBaseUrl}/invitations`;
      const response = await axios.post(url, {}, {
        headers: this.getHeaders(),
        timeout: 10000
      });
      return response.data;
    }, 2, 1000, 'createResellerInvitation').catch(error => {
      const msg = extractErrorMessage(error);
      throw new Error(`Gagal mencipta jemputan reseller: ${msg}`);
    });
  }

  /**
   * Wrapper untuk topup sedia ada (serasi bot handlers & admin)
   */
  async addQuotaToKey({ targetKeyId, hashtag, tierId, addTokens, validDays }) {
    // Jika hashtag & tierId sudah disediakan
    if (hashtag && tierId) {
      return this.topupCustomerKey({ hashtag, tierId });
    }

    // Jika targetKeyId disediakan, cari hashtag pelanggan
    if (targetKeyId) {
      try {
        const cust = await this.getCustomerKeyDetail(targetKeyId);
        if (cust && cust.hashtag) {
          // Cari tier yang paling sesuai mengikut addTokens
          const tokenNum = Number(addTokens) || 5000000;
          let tier = '5m';
          if (tokenNum >= 100000000) tier = '100m';
          else if (tokenNum >= 50000000) tier = '50m';
          else if (tokenNum >= 20000000) tier = '20m';
          else if (tokenNum >= 10000000) tier = '10m';

          return this.topupCustomerKey({ hashtag: cust.hashtag, tierId: tier });
        }
      } catch (err) {
        console.warn('[addQuotaToKey] Fallback error:', err.message);
      }
    }

    throw new Error('Sila masukkan hashtag (#NamaCustomer) atau ID pelanggan yang sah untuk topup.');
  }
}

module.exports = new BandelBangetClient();
