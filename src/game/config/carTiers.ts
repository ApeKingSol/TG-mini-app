export interface CarTierInfo {
  name: string;
  image: string;
}

/**
 * One entry per trade-in tier. Tiers 9-10 don't have their own art yet (only 8 car images
 * exist in public/) so they fall back to Tier 8's image via `getCarTier` until real assets
 * arrive — the name still advances correctly either way.
 */
export const CAR_TIERS: CarTierInfo[] = [
  { name: 'Rustbucket Mk I', image: '/car-base.webp' },
  { name: 'Cyber-Lada', image: '/car-tier-2.webp' },
  { name: 'Street Hatch', image: '/car-tier-3.webp' },
  { name: 'Rusty Muscle', image: '/car-tier-4.webp' },
  { name: 'Tokyo Ghost', image: '/car-tier-5.webp' },
  { name: 'Retro Wedge', image: '/car-tier-6.webp' },
  { name: 'Neon Beetle', image: '/car-tier-7.webp' },
  { name: 'Red Baron', image: '/car-tier-8.webp' },
  { name: 'Angular Demon', image: '/car-tier-8.webp' },
  { name: 'Absolute Apex', image: '/car-tier-8.webp' },
];

export function getCarTier(tier: number): CarTierInfo {
  const index = Math.min(tier, CAR_TIERS.length) - 1;
  return CAR_TIERS[Math.max(0, index)];
}
