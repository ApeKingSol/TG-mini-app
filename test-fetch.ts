import express from 'express';
async function run() {
  const initData = "mock";
  const res = await fetch('http://localhost:3000/api/syndicates?mine=1', {
    method: 'GET',
    headers: { 'x-telegram-init-data': initData }
  });
  const data = await res.json();
  console.log('Fetched syndicate tag:', data.syndicate?.tag);
}
run();
