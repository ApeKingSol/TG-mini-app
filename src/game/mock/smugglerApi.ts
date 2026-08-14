import { WebApp, isRunningInTelegram } from '../../lib/telegram';

const ENDPOINT = '/api/smugglers-run';

async function fetchSmugglersRun(body: any) {
  if (!isRunningInTelegram()) throw new Error('Open from Telegram');
  
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, initData: WebApp.initData }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export function startConvoy(fee: number): Promise<{ runId: string }> {
  return fetchSmugglersRun({ action: 'start', fee });
}

export function resolveSector(sectorNumber: number, runId: string): Promise<{ success: boolean }> {
  return fetchSmugglersRun({ action: 'resolve-sector', sectorNumber, runId });
}

export function cashOutConvoy(currentMultiplier: number, runId: string): Promise<{ finalMultiplier: number, payout?: number }> {
  return fetchSmugglersRun({ action: 'cash-out', currentMultiplier, runId });
}
