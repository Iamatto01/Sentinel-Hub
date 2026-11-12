with open('src/lib/bandelbanget.js','r') as f:
    c = f.read()

# getResellerInfo
old1 = """async getResellerInfo() {
    const token = await this.getAccessToken();
    try {
      const url = `${this.baseUrl}/api/public/reseller/keys?token=${this.secretToken}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.error || error.message;
      console.error('[BandelBanget] GetResellerInfo Error:', msg);
      throw new Error(`Gagal mengambil maklumat Reseller: ${msg}`);
    }
  }"""

new1 = """async getResellerInfo() {
    const token = await this.getAccessToken();
    const self = this;
    return withRetry(async () => {
      const url = `${self.baseUrl}/api/public/reseller/keys?token=${self.secretToken}`;
      const response = await axios.get(url, {
        headers: { Authorization: 'Bearer ' + token },
        timeout: 10000
      });
      return response.data;
    }, 3, 1000).catch(error => {
      const msg = error.response?.data?.error || error.message;
      console.error('[BandelBanget] GetResellerInfo Error:', msg);
      throw new Error(`Gagal mengambil maklumat Reseller: ${msg}`);
    });
  }"""

if old1 in c:
    c = c.replace(old1, new1, 1)
    print('getResellerInfo replaced')
else:
    print('getResellerInfo NOT FOUND')

# createCustomerKey
old2 = """async createCustomerKey({ maxTokens, validDays }) {
    try {
      const url = `${this.baseUrl}/api/public/reseller/create-key`;
      const response = await axios.post(url, {
        secretToken: this.secretToken,
        maxTokens: Number(maxTokens),
        validDays: Number(validDays)
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });

      return response.data;
    } catch (error) {
      const msg = error.response?.data?.error || error.message;
      console.error('[BandelBanget] CreateKey Error:', msg);
      throw new Error(`Gagal membina Customer Key: ${msg}`);
    }
  }"""

new2 = """async createCustomerKey({ maxTokens, validDays }) {
    const self = this;
    return withRetry(async () => {
      const url = `${self.baseUrl}/api/public/reseller/create-key`;
      const response = await axios.post(url, {
        secretToken: self.secretToken,
        maxTokens: Number(maxTokens),
        validDays: Number(validDays)
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });

      return response.data;
    }, 3, 1000).catch(error => {
      const msg = error.response?.data?.error || error.message;
      console.error('[BandelBanget] CreateKey Error:', msg);
      throw new Error(`Gagal membina Customer Key: ${msg}`);
    });
  }"""

if old2 in c:
    c = c.replace(old2, new2, 1)
    print('createCustomerKey replaced')
else:
    print('createCustomerKey NOT FOUND')

# addQuotaToKey
old3 = """async addQuotaToKey({ targetKeyId, addTokens, validDays }) {
    try {
      const url = `${this.baseUrl}/api/public/reseller/add-quota`;
      const response = await axios.post(url, {
        secretToken: this.secretToken,
        targetKeyId: Number(targetKeyId),
        addTokens: Number(addTokens),
        validDays: Number(validDays)
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });

      return response.data;
    } catch (error) {
      const msg = error.response?.data?.error || error.message;
      console.error('[BandelBanget] AddQuota Error:', msg);
      throw new Error(`Gagal menambah kuota: ${msg}`);
    }
  }"""

new3 = """async addQuotaToKey({ targetKeyId, addTokens, validDays }) {
    const self = this;
    return withRetry(async () => {
      const url = `${self.baseUrl}/api/public/reseller/add-quota`;
      const response = await axios.post(url, {
        secretToken: self.secretToken,
        targetKeyId: Number(targetKeyId),
        addTokens: Number(addTokens),
        validDays: Number(validDays)
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });

      return response.data;
    }, 3, 1000).catch(error => {
      const msg = error.response?.data?.error || error.message;
      console.error('[BandelBanget] AddQuota Error:', msg);
      throw new Error(`Gagal menambah kuota: ${msg}`);
    });
  }"""

if old3 in c:
    c = c.replace(old3, new3, 1)
    print('addQuotaToKey replaced')
else:
    print('addQuotaToKey NOT FOUND')

# getCustomerKeyDetails
old4 = """async getCustomerKeyDetails(customerSecretToken) {
    try {
      const url = `${this.baseUrl}/api/public/quota/${customerSecretToken}`;
      const response = await axios.get(url, { timeout: 10000 });
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.error || error.message;
      console.error('[BandelBanget] GetCustomerKeyDetails Error:', msg);
      throw new Error(`Gagal menyemak Customer Key: ${msg}`);
    }
  }"""

new4 = """async getCustomerKeyDetails(customerSecretToken) {
    const self = this;
    return withRetry(async () => {
      const url = `${self.baseUrl}/api/public/quota/${customerSecretToken}`;
      const response = await axios.get(url, { timeout: 10000 });
      return response.data;
    }, 3, 1000).catch(error => {
      const msg = error.response?.data?.error || error.message;
      console.error('[BandelBanget] GetCustomerKeyDetails Error:', msg);
      throw new Error(`Gagal menyemak Customer Key: ${msg}`);
    });
  }"""

if old4 in c:
    c = c.replace(old4, new4, 1)
    print('getCustomerKeyDetails replaced')
else:
    print('getCustomerKeyDetails NOT FOUND')

with open('src/lib/bandelbanget.js','w') as f:
    f.write(c)
print('File written')