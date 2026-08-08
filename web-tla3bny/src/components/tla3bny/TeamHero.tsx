'use client';
import { mediaUrl, type TTeam } from '@/lib/tla3bnyApi';
import { useName } from './kit';

// The team identity card — mirrors CompetitionHero / AcademyHero: the photo
// fills the card height, with the team name, its age category and a short
// description beside it. Keeps the shape consistent across the app.
export default function TeamHero({ team }: { team: TTeam }) {
  const nm = useName();
  const photo = mediaUrl(team.photo_path);
  return (
    <div className="flex items-stretch gap-4 bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-2xl p-4 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.7)]">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={team.display_name}
          className="w-24 sm:w-28 self-stretch object-cover rounded-xl flex-shrink-0 bg-darkBg border border-bdr/60" />
      ) : (
        <div className="w-24 sm:w-28 self-stretch rounded-xl bg-aqua/10 grid place-items-center text-4xl flex-shrink-0">⚽</div>
      )}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-2 py-1">
        <h1 className="text-text font-black text-2xl leading-tight">{nm(team.display_name, team.display_name_en)}</h1>
        {team.age_category && (
          <span className="self-start text-[11px] font-bold text-aqua bg-aqua/10 border border-aqua/30 rounded-full px-2.5 py-0.5">
            {team.age_category}
          </span>
        )}
        {team.description && (
          <p className="text-sm text-teal leading-relaxed line-clamp-3">{team.description}</p>
        )}
      </div>
    </div>
  );
}
