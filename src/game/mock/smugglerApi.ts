import { SMUGGLERS_RUN } from '../config/economy';

export async function startConvoy(fee: number): Promise<{ runId: string }> {
  return { runId: Math.random().toString(36).substring(2, 15) };
}

export async function resolveSector(sectorNumber: number, runId: string): Promise<{ success: boolean }> {
  const sectorIndex = sectorNumber - 1;
  const sector = SMUGGLERS_RUN.SECTORS[sectorIndex];
  
  if (!sector) throw new Error('Invalid sector');
  
  const success = Math.random() < sector.successChance;
  return { success };
}

export async function cashOutConvoy(currentMultiplier: number, runId: string): Promise<{ finalMultiplier: number, payout?: number }> {
  return { finalMultiplier: currentMultiplier };
}
