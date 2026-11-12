async function testOrder() {
  const res = await fetch('https://api.sentinelai.studio/api/order/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      packageId: 12,
      customerEmail: 'test@sentinel.api',
      customerName: 'Ahmad Web Tester'
    })
  });
  const json = await res.json();
  console.log('Order Create Response:', json);

  if (json.success && json.order) {
    const statusRes = await fetch(`https://api.sentinelai.studio/api/order/status/${json.order.orderRef}`);
    const statusJson = await statusRes.json();
    console.log('Order Status Response:', statusJson);
  }
}

testOrder().catch(console.error);
