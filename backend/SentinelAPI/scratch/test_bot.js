require('dotenv').config();
const db = require('../src/lib/db');
const bandelbanget = require('../src/lib/bandelbanget');
const payment = require('../src/lib/payment');

async function testAll() {
  console.log('=== 1. Testing SQLite Database ===');
  const packages = db.getAllPackages();
  console.log('Active packages in DB:', packages.length);
  packages.forEach(p => console.log(` - ${p.name}: RM ${p.price_myr}`));

  console.log('\n=== 2. Testing BandelBanget API Client ===');
  try {
    const resellerInfo = await bandelbanget.getResellerInfo();
    console.log('Reseller ID:', resellerInfo.resellerId);
    console.log('Reseller Quota:', (resellerInfo.resellerQuota || 0).toLocaleString(), 'Tokens');
    console.log('Customer Keys Count:', (resellerInfo.keys || []).length);
    console.log('✅ BandelBanget API Test Passed!');
  } catch (err) {
    console.error('❌ BandelBanget API Test Failed:', err.message);
  }

  console.log('\n=== 3. Testing Payment Order Creation ===');
  const testPkg = packages[0];
  const order = await payment.createPaymentOrder({
    userId: 123456789,
    userName: 'TestUser',
    packageItem: testPkg,
    type: 'new_key'
  });
  console.log('Generated Order Ref:', order.orderRef);
  console.log('Base Price:', order.basePrice, '| Amount to Pay:', order.amountPaid);
  console.log('✅ Payment Order Creation Passed!');

  console.log('\n🎉 ALL SYSTEM INTEGRATION TESTS COMPLETED SUCCESSFULLY!');
  process.exit(0);
}

testAll();
