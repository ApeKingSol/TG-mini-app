import express from 'express';
async function run() {
  const initData = "mock";
  
  // Create syndicate
  const createRes = await fetch('http://localhost:3000/api/syndicates', {
    method: 'POST',
    headers: { 'x-telegram-init-data': initData, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', name: 'PersistTest', tag: 'PRST' })
  });
  const createData = await createRes.json();
  console.log('Created:', createData.id);
}
run();
