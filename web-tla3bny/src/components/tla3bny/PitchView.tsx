'use client';
import { mediaUrl } from '@/lib/tla3bnyApi';
import { formationRowLabels, slotBase } from '@/lib/tla3bnyFormations';

export interface SlotView {
  playerId: number | null;
  playerName?: string | null;
  jerseyNumber?: number | null;
  photoPath?: string | null;
}

/** Green football pitch with formation circles. Circles are tappable when
 *  `onTapSlot` is given (builder mode); otherwise it is a read-only display. */
export default function PitchView({
  formation, filled, onTapSlot,
}: {
  formation: string | null;
  filled: Record<string, SlotView>;
  onTapSlot?: (slotLabel: string) => void;
}) {
  const rows = formationRowLabels(formation);
  if (rows.length === 0) {
    return (
      <div className="grid place-items-center h-28 rounded-2xl bg-cardBg2 border border-bdr text-hint text-sm">
        —
      </div>
    );
  }

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden select-none"
      style={{ aspectRatio: '0.66', background: 'linear-gradient(180deg,#1B7A43,#14964F)' }}
    >
      {/* pitch markings */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 152" preserveAspectRatio="none">
        <g stroke="rgba(255,255,255,0.28)" strokeWidth="0.5" fill="none">
          <line x1="0" y1="76" x2="100" y2="76" />
          <circle cx="50" cy="76" r="12" />
          <rect x="25" y="0" width="50" height="16" />
          <rect x="25" y="136" width="50" height="16" />
        </g>
      </svg>

      {/* rows: reversed so forwards sit at the top, GK at the bottom */}
      <div className="absolute inset-0 flex flex-col py-3 px-1.5">
        {[...rows].reverse().map((labels, ri) => (
          <div key={ri} className="flex-1 flex items-center justify-evenly">
            {labels.map(label => {
              const d = filled[label];
              const has = d?.playerId != null;
              const url = mediaUrl(d?.photoPath);
              const tappable = !!onTapSlot;
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!tappable}
                  onClick={tappable ? () => onTapSlot!(label) : undefined}
                  className={`flex flex-col items-center gap-0.5 min-w-0 ${tappable ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span
                    className="grid place-items-center rounded-full border-2 overflow-hidden"
                    style={{
                      width: 40, height: 40,
                      borderColor: 'rgba(255,255,255,0.85)',
                      backgroundColor: has ? '#fff' : 'rgba(255,255,255,0.18)',
                      backgroundImage: url ? `url(${url})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    {!url && (
                      <span className={`font-bold ${has ? 'text-black text-base' : 'text-white/90 text-[10px]'}`}>
                        {has ? (d?.jerseyNumber ?? '') : slotBase(label)}
                      </span>
                    )}
                  </span>
                  <span
                    className="text-white text-[10px] font-semibold text-center truncate max-w-[64px]"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
                  >
                    {has ? d?.playerName : label}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
