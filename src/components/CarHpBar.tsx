import type { CarHpStatus, CarState } from '../game/types';

const HP_BAR_COLOR: Record<CarHpStatus, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
};

interface CarHpBarProps {
  car: CarState;
  status: CarHpStatus;
}

export function CarHpBar({ car, status }: CarHpBarProps) {
  return (
    <div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${HP_BAR_COLOR[status]}`}
          style={{ width: `${(car.hp / car.maxHp) * 100}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {car.hp} / {car.maxHp} HP
      </p>
    </div>
  );
}
