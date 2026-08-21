// A football-shirt icon with the player's squad number sitting on the torso.
// The torso is kept wide so a two-digit number reads clearly. Shared by the
// competition team-detail roster and the standalone team page.
export default function JerseyNumber({ shirt }: { shirt: number | null }) {
  return (
    <div className="relative flex-shrink-0 w-11 h-9" title="#">
      <svg viewBox="0 0 30 26" className="w-11 h-9" aria-hidden="true">
        <path d="M11 2 L4 5 L1.5 9 L6 11.5 L8.5 10 L8.5 24 L21.5 24 L21.5 10 L24 11.5 L28.5 9 L26 5 L19 2 C18 4.2 16.5 5 15 5 C13.5 5 12 4.2 11 2 Z"
          className="fill-aqua/15 stroke-aqua/60" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center pt-2 text-aqua font-extrabold text-[11px] tnum leading-none">
        {shirt ?? '—'}
      </span>
    </div>
  );
}
