import { color } from '@/lib/tokens';
import encryptionIcon from '@/assets/encryption.svg';
import noRealMoneyIcon from '@/assets/no-real-money.svg';
import liveDataIcon from '@/assets/live-data.svg';

const badges = [
  {
    icon: encryptionIcon,
    label: '256-bit Encryption',
    desc: 'Enterprise-grade SSL',
  },
  {
    icon: noRealMoneyIcon,
    label: 'No Real Money',
    desc: 'Paper trading only',
  },
  {
    icon: liveDataIcon,
    label: 'Bybit Live Data',
    desc: 'Real-time price feed',
  },
];

export function TrustBadges() {
  return (
    <div className="flex w-full items-center justify-center">
      <div
        className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl border px-6 py-4 sm:px-10 sm:py-5"
        style={{
          background: `linear-gradient(135deg, ${color.purpleDeep}20, ${color.purple}10)`,
          borderColor: `${color.glow}20`,
        }}
      >
        {badges.map((b) => (
          <div key={b.label} className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center">
              <img src={b.icon} alt="" className="h-full w-full" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">{b.label}</p>
              <p className="text-[11px]" style={{ color: color.muted }}>
                {b.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
