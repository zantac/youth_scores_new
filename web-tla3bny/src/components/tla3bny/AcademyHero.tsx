'use client';
import { mediaUrl, type TAcademy } from '@/lib/tla3bnyApi';

// The academy identity card — mirrors CompetitionHero: the logo fills the card
// height, with the name, about (description) and branch names beside it.
export default function AcademyHero({ academy }: { academy: TAcademy }) {
  const logo = mediaUrl(academy.logo_path);
  const branches = (academy.branches ?? []).map(b => b.name).filter(Boolean);
  return (
    <div className="flex items-stretch gap-4 bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.7)]">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={academy.name}
          className="w-24 sm:w-28 self-stretch object-cover rounded-xl flex-shrink-0 bg-darkBg border border-bdr/60" />
      ) : (
        <div className="w-24 sm:w-28 self-stretch rounded-xl bg-aqua/10 grid place-items-center text-4xl flex-shrink-0">🏫</div>
      )}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-2 py-1">
        <h1 className="text-text font-black text-2xl leading-tight">{academy.name}</h1>
        {academy.description && (
          <p className="text-sm text-teal leading-relaxed line-clamp-3">{academy.description}</p>
        )}
        {branches.length > 0 && (
          <p className="text-hint text-xs flex items-start gap-1">
            <span aria-hidden="true">📍</span>
            <span className="line-clamp-2">{branches.join(' · ')}</span>
          </p>
        )}
      </div>
    </div>
  );
}
