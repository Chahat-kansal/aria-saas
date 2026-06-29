interface Props {
  name:      string;
  category:  string;
  size?:     number;
  imageUrl?: string;
}

const CAT_COLORS: Record<string, [string, string]> = {
  'beer':          ['#F59E0B', '#92400E'],
  'beer & cider':  ['#F59E0B', '#92400E'],
  'wine':          ['#9333EA', '#4C1D95'],
  'spirits':       ['#3B82F6', '#1E3A5F'],
  'rtd':           ['#10B981', '#064E3B'],
  'coffee':        ['#A16207', '#451A03'],
  'food':          ['#EF4444', '#7F1D1D'],
  'soft drinks':   ['#10B981', '#064E3B'],
  'water':         ['#38BDF8', '#0C4A6E'],
  'snacks':        ['#F97316', '#7C2D12'],
  'confectionery': ['#EC4899', '#831843'],
  'default':       ['#6366F1', '#312E81'],
};

export default function ProductImage({ name, category, size = 80, imageUrl }: Props) {
  const key = category?.toLowerCase() || 'default';
  const [c1, c2] = CAT_COLORS[key] || CAT_COLORS.default;
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const pad = Math.round(size * 0.08);

  if (imageUrl) {
    return (
      <div style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: '1px solid ' + c1 + '44', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: pad, boxSizing: 'border-box' as const }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
      </div>
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: 10,
      background: 'linear-gradient(135deg, ' + c1 + '33, ' + c2 + '66)',
      border: '1px solid ' + c1 + '44',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.15, background: 'radial-gradient(circle at 30% 30%, ' + c1 + ', transparent 60%)' }} />
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: size * 0.25,
        fontWeight: 700,
        color: c1,
        letterSpacing: '-0.02em',
        position: 'relative',
      }}>
        {initials}
      </span>
    </div>
  );
}
