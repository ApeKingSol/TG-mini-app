import express from 'express';
async function run() {
  const initData = "mock"; // This triggers dev mode in verifyInitData (user.id = '123456789')
  
  // 1. Create syndicate
  console.log("Creating syndicate...");
  const createRes = await fetch('http://localhost:3000/api/syndicates', {
    method: 'POST',
    headers: { 'x-telegram-init-data': initData, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', name: 'Test', tag: 'TEST' })
  });
  const createData = await createRes.json();
  console.log(createData);
  const syndicateId = createData.id;

  // 2. Fetch night siege status
  console.log("Fetching night siege status...");
  const siegeRes = await fetch(`http://localhost:3000/api/night-siege?syndicateId=${syndicateId}`, {
    method: 'GET',
    headers: { 'x-telegram-init-data': initData }
  });
  const siegeData = await siegeRes.text();
  console.log(siegeRes.status, siegeData);
}
run();
