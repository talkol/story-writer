/**
 * Phosphor icon font, regular weight — the closest self-hostable match to SF Symbols
 * now that Ionicons ships SVG only. Names are constrained to the set the app actually
 * uses so a typo is a type error rather than an invisible blank glyph.
 */
export type IconName =
  | 'gear'
  | 'trophy'
  | 'book-open'
  | 'books'
  | 'caret-left'
  | 'caret-right'
  | 'plus'
  | 'dots-three'
  | 'x'
  | 'export'
  | 'trash'
  | 'check';

interface Props {
  name: IconName;
  /** Matches the surrounding text size by default; set for standalone icons. */
  size?: number;
  weight?: 'regular' | 'bold' | 'fill';
  className?: string;
}

export default function Icon({ name, size, weight = 'regular', className }: Props) {
  const family = weight === 'regular' ? 'ph' : `ph-${weight}`;
  return (
    <i
      className={`${family} ph-${name}${className ? ` ${className}` : ''}`}
      style={size ? { fontSize: `${size}px` } : undefined}
      aria-hidden="true"
    />
  );
}
