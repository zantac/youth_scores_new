import type { Metadata } from 'next';
import MatchByIdClient from './MatchByIdClient';

// Static export can't prebuild every match id (thousands, churns daily and goes
// stale on each new result), so generateStaticParams emits ONE sentinel shell.
// The Flask backend serves this shell for any /match/<id> and injects the real
// per-match <title>/OG from live DB data at request time (see _match_share_page).
export function generateStaticParams() {
  return [{ id: '_' }];
}

// Generic placeholder metadata for the sentinel shell; Flask overrides it per id.
export const metadata: Metadata = {
  title: 'مباراة | Youth Scores',
};

export default function Page() {
  return <MatchByIdClient />;
}
