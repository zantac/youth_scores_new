// ── Config ────────────────────────────────────────────────────────────────────

export type Localized = { ar: string; en: string };

export interface AppVersion {
  version_code: string;
  version_name: string;
}

export interface Venue {
  venue_id: string;
  name: string | Localized;
  url?: string;
}

export interface NewsItem {
  id?: number;
  date: string;
  title: string | Localized;
  image?: string;
  details?: string | Localized;
  images?: string[];
}

export interface AdItem {
  id: number;
  name: string;
  image?: string;
  youtube_video?: string;
  facebook_link?: string;
  mobile_number?: string;
  whatsapp_number?: string;
  location?: string;
  location_url?: string;
  link?: string;
  weight?: number;
  placement?: string;   // interstitial | feed | both
  feed_position?: number;  // native card shows after the Nth match (from anchor)
  feed_repeat?: number | null;  // repeat every N matches after that; null = once
  expire_date?: string;
}

export interface Sector {
  name: { ar: string; en: string };
  url: string;
}

export interface AgeGroup {
  age: string;
  ageName?: Localized;
  matchDays?: number[];
  directMatchesUrl?: string;
  sectors: Sector[];
}

export interface Competition {
  id: string;
  name: { ar: string; en: string } | string;
  ages: AgeGroup[];
}

export interface Season {
  name: string | { ar: string; en: string };
  competitions: Competition[];
}

export interface ConfigData {
  seasons: Season[];
  venues: Venue[];
  news: NewsItem[];
  ads: AdItem[];
  app_version?: AppVersion;
}

// ── Competition data ──────────────────────────────────────────────────────────

export interface Players {
  coach: string[];
  goalkeepers: string[];
  defenders: string[];
  midfielders: string[];
  attackers: string[];
}

export interface TeamStaff { id: number; name: Localized; role: Localized | null; current: boolean; }
export interface RosterPlayer { id: number; name: Localized; shirt: number | null; position: Localized | null; birthYear: number; current: boolean; }

export interface Team {
  id: string;
  clubId?: number;
  group?: string | Localized;
  /** Every group the team is in; a second-phase qualifier is in two. */
  groups?: (string | Localized)[];
  /** The team's display name — its own override when it has one, else the club's. */
  name: string | Localized;
  /** The club's own name. Differs from `name` only when the team overrides it. */
  clubName?: string | Localized;
  logo?: string;
  field?: string;
  fieldurl?: string;
  city?: string | Localized;
  information?: string;
  players?: Players;
  staff?: TeamStaff[];
  roster?: RosterPlayer[];
  pointDeduction: number;
}

export interface Match {
  id: string;
  group: string;
  week: string;
  date: string;
  time: string;
  homeTeamId: string;
  awayTeamId: string;
  venue: string;
  status: string;
  note?: string;
  homeScore?: number;
  awayScore?: number;
  homeScorers: string[];
  awayScorers: string[];
  homePenalty?: number;
  awayPenalty?: number;
  homeYc: string[];
  awayYc: string[];
  homeRc: string[];
  awayRc: string[];
  homeSub: string[];
  awaySub: string[];
  /** The same substitutions with the players kept apart, so each can be coloured. */
  subs: MatchSub[];
  homeSquad: string[];
  awaySquad: string[];
  stage: string;
}

export interface MatchSub {
  side: 'home' | 'away';
  in: string;
  out: string;
  minute: number | null;
}

/** A table computed by the server, which alone knows whether a stage carries
 *  its points forward from earlier stages. */
export interface StandingsBlock {
  group: Localized | null;
  rows: Standing[];
}

export interface CompetitionData {
  // The competition's own id + title, so a page opened by ?id= can render its
  // header without the title being passed in the URL.
  competition?: { id: number; title: Localized };
  matches: Match[];
  teams: Team[];
  venues: string[];
  standings?: StandingsBlock[];
}

// ── Derived ───────────────────────────────────────────────────────────────────

export interface Standing {
  teamId: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  goalDiff: number;
  pointDeduction: number;
}

export interface HomeCompetition {
  id: number;
  code: string;
  name: Localized;
  age: string;
  ageName?: Localized | null;
  sector: Localized | null;
  title: Localized;
  dataUrl: string;
}

export interface HomeMatch {
  id: string;
  date: string;
  time: string;
  status: string;
  group: string;
  venue: string;
  note?: string;
  homeScore?: number;
  awayScore?: number;
  homePenalty?: number;
  awayPenalty?: number;
  competition: HomeCompetition;
  homeTeam?: { id: string; name: string | Localized; logo?: string };
  awayTeam?: { id: string; name: string | Localized; logo?: string };
}

export interface MatchGoalEv { side: 'home' | 'away'; minute: number | null; scorer: string | null; scorer_id: number | null; assist: string | null; is_penalty: boolean; is_own_goal: boolean; }
export interface MatchCardEv { side: 'home' | 'away'; minute: number | null; player: string | null; type: string; }
export interface MatchSubEv  { side: 'home' | 'away'; minute: number | null; in: string | null; out: string | null; }
export interface MatchLineupSide { starters: string[]; bench: string[]; }
export interface MatchLineup { home: MatchLineupSide; away: MatchLineupSide; }

export interface MatchFull {
  id: number;
  competition: { id: number; name: Localized; age?: Localized | null } | null;
  date: string; time: string; week: string | null; venue: string | null; note?: string | null; status: string;
  home: { id: number; name: Localized | string; logo?: string };
  away: { id: number; name: Localized | string; logo?: string };
  home_score: number | null; away_score: number | null;
  home_penalty: number | null; away_penalty: number | null;
  goals: MatchGoalEv[]; cards: MatchCardEv[]; subs: MatchSubEv[];
  lineup?: MatchLineup | null;
}

export interface PlayerCareerComp { name: string | Localized; goals: number; assists: number; appearances: number; }
export interface PlayerCareer {
  club: string; logo: string | null; age: Localized | null; is_guest?: boolean; season: string | { ar: string; en: string };
  goals: number; assists: number; appearances: number;
  current: boolean; end_date?: string | null; status: string;
  competitions: PlayerCareerComp[];
}
export interface PlayerFull {
  id: number; name: Localized; position: Localized | null; sub_position: Localized | null; birth_year: number;
  nationality: Localized | null; photo: string | null; current_club: string | null;
  goals: number; assists: number; appearances: number; career: PlayerCareer[];
}

export interface PlayerStat {
  name: string;
  teamId: string;
  teamName: string | Localized;
  count: number;
}

// ── Coach / manager profile ─────────────────────────────────────────────────
export interface CoachCareer {
  type: 'coach' | 'manager';
  club: string | null;
  logo: string | null;
  season: Localized | null;
  age: Localized | null;
  role: Localized;
  current: boolean;
  start_date: string | null;
}
export interface CoachFull {
  id: number;
  name: Localized;
  birth_year: number | null;
  nationality: Localized | null;
  photo: string | null;
  career: CoachCareer[];
}

// ── Public club profile ─────────────────────────────────────────────────────
export interface ClubListItem { id: number; name: Localized; city: Localized | null; logo: string | null; }

// Global search (clubs / players / coaches) — one row's worth of data each.
export interface SearchClub   { id: number; name: Localized; city: Localized | null; logo: string | null; }
export interface SearchPlayer { id: number; name: Localized; birth_year: number; position: Localized | null; club: Localized | null; photo: string | null; }
export interface SearchCoach  { id: number; name: Localized; role: Localized | null; club: Localized | null; photo: string | null; }
export interface SearchResults { clubs: SearchClub[]; players: SearchPlayer[]; coaches: SearchCoach[]; }

export interface TeamStaffMember { id: number; name: Localized; photo: string | null; role: Localized | null; current: boolean; }
export interface TeamRosterPlayer { id: number; name: Localized; photo: string | null; shirt: number | null; position: Localized | null; birth_year: number; current: boolean; guest?: boolean; }
export interface TeamPublic {
  id: number;
  name: Localized;
  logo: string | null;
  club: { id: number; name: Localized };
  age: Localized | null;
  // A team carries across seasons; these are the ones it actually played,
  // newest first, derived from the competitions it entered.
  seasons: { id: number; name: Localized }[];
  // The season the roster/staff below are scoped to, or null for all-time.
  season_id?: number | null;
  // Each competition the team entered (newest season first) — the season block
  // links to that competition's in-competition team view.
  competitions: { competition_id: number; title: Localized; season: Localized }[];
  staff: TeamStaffMember[];
  roster: TeamRosterPlayer[];
}

export interface ClubManager { id: number; name: Localized; photo: string | null; role: Localized | null; current: boolean; }
export interface ClubTeamRef { id: number; name: Localized; age: Localized | null; seasons: Localized[]; }
export interface ClubPublic {
  id: number;
  name: Localized;
  city: Localized | null;
  logo: string | null;
  website: string | null; facebook: string | null; instagram: string | null; youtube: string | null; twitter: string | null;
  established: string | null;
  managers: ClubManager[];
  teams: ClubTeamRef[];
}

export interface TeamGoalStat {
  teamId: string;
  teamName: string | Localized;
  goalsFor: number;
  goalsAgainst: number;
}
