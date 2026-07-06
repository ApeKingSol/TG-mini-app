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

/**
 * How many perk installs the current car needs before it's "MASTERED" and ready to trade
 * in. Grows every two tiers (Tier 1-2 need 3, Tier 3-4 need 4, Tier 5-6 need 5, ...) so
 * later cars take meaningfully longer without the requirement exploding. Since there are
 * only 3 distinct perks, meeting a requirement above 3 means installing a repeat.
 */
export function getUpgradeRequirement(carTier: number): number {
  return 3 + Math.floor((carTier - 1) / 2);
}

export interface CarSkin {
  id: string;
  name: string;
  cost: number;
}

const SKIN_VARIANT_LABELS = ['Chrome Finish', 'Neon Wrap', 'Battle Damage'];

/** 3 skins per car, purely cosmetic and not purchasable yet — the Garage Shop shows these
 * as "In Development" placeholders until real skin-swap art and a purchase flow exist. */
export function getCarSkins(carTier: number): CarSkin[] {
  const { name } = getCarTier(carTier);
  return SKIN_VARIANT_LABELS.map((label, index) => ({
    id: `tier-${carTier}-skin-${index + 1}`,
    name: `${name} — ${label}`,
    cost: 300 + index * 150,
  }));
}
