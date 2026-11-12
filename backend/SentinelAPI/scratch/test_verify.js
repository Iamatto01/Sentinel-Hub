async function testVerify() {
  const res = await fetch('https://api.sentinelai.studio/api/order/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      packageId: 12,
      customerEmail: 'tester@sentinel.api',
      customerName: 'Ahmad Auto Web'
    })
  });
  const json = await res.json();
  const orderRef = json.order.orderRef;
  console.log('Created order:', orderRef);

  // Now verify payment
  const verifyRes = await fetch('https://api.sentinelai.studio/api/order/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderRef,
      referenceNo: 'TNG-REF-889922'
    })
  });
  const verifyJson = await verifyRes.json();
  console.log('Verify Result:', verifyJson);
}

testVerify().catch(console.error);
