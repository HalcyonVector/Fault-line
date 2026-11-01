import { magTone } from '../map/colors';

export function MagBadge({ mag, size = 'md' }: { mag: number; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`mag mag-${magTone(mag)} mag-${size}`} aria-label={`Magnitude ${mag.toFixed(1)}`}>
      {mag.toFixed(1)}
    </span>
  );
}
