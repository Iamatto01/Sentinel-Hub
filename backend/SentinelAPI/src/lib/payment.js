const axios = require('axios');
const path = require('path');
const fs = require('fs');
const db = require('./db');

class PaymentService {
  /**
   * Cipta pesanan baharu dan maklumat pembayaran
   */
  async createPaymentOrder({ userId, userName, packageItem, type = 'new_key', targetKeyId = null, targetKeyToken = null }) {
    const randomCents = Math.floor(Math.random() * 90) + 10; // 10 - 99 sen untuk pengesahan unik
    const basePrice = packageItem.price_myr;
    const amountPaid = parseFloat((basePrice + (randomCents / 100)).toFixed(2));
    const orderRef = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const paymentMethod = db.getSetting('payment_method', 'static_qr');

    const orderData = {
      orderRef,
      userId,
      userName: userName || 'Pelanggan Telegram',
      packageId: packageItem.id,
      packageName: packageItem.name,
      tokens: packageItem.tokens,
      validDays: packageItem.valid_days,
      priceMyr: basePrice,
      amountPaid,
      type,
      targetKeyId,
      targetKeyToken,
      paymentMethod
    };

    db.createOrder(orderData);

    // Set order expiry (1 hour for static QR, 15 min for ToyyibPay)
    const orderExpiryMs = paymentMethod === 'toyyibpay' ? 15 * 60 * 1000 : 60 * 60 * 1000;
    db.setOrderExpiry(orderRef, orderExpiryMs);

    let toyyibpayUrl = null;

    // Jika menggunakan ToyyibPay Auto Gateway
    if (paymentMethod === 'toyyibpay' && process.env.TOYYIBPAY_SECRET_KEY) {
      try {
        const formData = new URLSearchParams({
          userSecretKey: process.env.TOYYIBPAY_SECRET_KEY,
          categoryCode: process.env.TOYYIBPAY_CATEGORY_CODE,
          billName: `API Quota ${packageItem.name}`,
          billDescription: `Pesanan #${orderRef} bagi ${packageItem.tokens.toLocaleString()} Token`,
          billPriceSetting: '1',
          billPayorRequired: '0',
          billAmount: Math.round(amountPaid * 100), // convert to cents
          billReturnUrl: `${process.env.SERVER_URL || 'http://localhost:3000'}/payment/toyyibpay/return`,
          billCallbackUrl: `${process.env.SERVER_URL || 'http://localhost:3000'}/payment/toyyibpay/callback`,
          billExternalReferenceNo: orderRef,
          billTo: userName || 'Pelanggan API',
          billEmail: 'customer@sentinel.api',
          billPhone: '0123456789'
        });

        const res = await axios.post('https://toyyibpay.com/index.php/api/createBill', formData.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (Array.isArray(res.data) && res.data[0] && res.data[0].BillCode) {
          toyyibpayUrl = `https://toyyibpay.com/${res.data[0].BillCode}`;
        }
      } catch (err) {
        console.error('[Payment] ToyyibPay CreateBill Error:', err.message);
      }
    }

    let qrImageUrl = db.getSetting('duitnow_qr_image_url', process.env.DUITNOW_QR_IMAGE_URL || '');
    if (!qrImageUrl) {
      if (fs.existsSync(path.join(__dirname, '../../duitnow_qr.png'))) {
        qrImageUrl = '/duitnow_qr.png';
      } else if (fs.existsSync(path.join(__dirname, '../../duitnow_qr.jpg'))) {
        qrImageUrl = '/duitnow_qr.jpg';
      } else if (fs.existsSync(path.join(__dirname, '../../duitnow_qr.jpeg'))) {
        qrImageUrl = '/duitnow_qr.jpeg';
      }
    }

    return {
      orderRef,
      amountPaid,
      basePrice,
      paymentMethod,
      toyyibpayUrl,
      bankName: db.getSetting('duitnow_bank_name', 'DuitNow QR / TNG eWallet'),
      accountNo: db.getSetting('duitnow_account_no', '-'),
      accountName: db.getSetting('duitnow_account_name', '-'),
      qrImageUrl
    };
  }

  /**
   * Dapatkan maklumat pesanan
   */
  getOrder(orderRef) {
    return db.getOrderByRef(orderRef);
  }
}

module.exports = new PaymentService();
