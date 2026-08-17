// Admin API client — talks to the Flask auth + admin endpoints with a bearer token.

// Same-origin by default (relative '/api/...'); the Flask backend serves the
// admin panel too. Override with NEXT_PUBLIC_CONFIG_URL for a different origin.
const API_ORIGIN = (process.env.NEXT_PUBLIC_CONFIG_URL ?? '/api/config')
  .replace(/\/api\/config\/?$/, '');

export interface AdminUser {
  id: number;
  username: string;
  full_name: string | null;
  role: 'superadmin' | 'editor' | 'clerk';
  is_active: boolean;
  last_login_at: string | null;
}

export const ROLE_LABEL: Record<string, { ar: string; en: string }> = {
  superadmin: { ar: 'مدير عام', en: 'Super Admin' },
  editor:     { ar: 'محرّر', en: 'Editor' },
  clerk:      { ar: 'مُدخِل بيانات', en: 'Data Entry' },
};

function headers(token: string | null, json = false): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('admin-session-expired'));
    throw new Error('انتهت صلاحية الجلسة');
  }
  if (!res.ok) throw new Error((data as { error?: string }).error || `خطأ (${res.status})`);
  return data as T;
}

export async function apiLogin(username: string, password: string) {
  const res = await fetch(`${API_ORIGIN}/api/auth/login`, {
    method: 'POST', headers: headers(null, true),
    body: JSON.stringify({ username, password }),
  });
  return parse<{ token: string; user: AdminUser }>(res);
}

export async function apiMe(token: string): Promise<AdminUser | null> {
  const res = await fetch(`${API_ORIGIN}/api/auth/me`, { headers: headers(token) });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.user ?? null) as AdminUser | null;
}

export async function apiListUsers(token: string) {
  const res = await fetch(`${API_ORIGIN}/api/admin/users`, { headers: headers(token) });
  return (await parse<{ users: AdminUser[] }>(res)).users;
}

// ── global admin search (clubs / teams / players) ──────────────────────────────
export interface AdminSearchClub { id: number; name: string; city: string; logo: string | null }
export interface AdminSearchTeam { id: number; name: string; logo: string | null }
export interface AdminSearchPlayer { id: number; name: string; birth_year: number; club: string | null; team_id: number | null }
export interface AdminSearchCoach { id: number; name: string; role: string | null; club: string | null; team_id: number | null }
export interface AdminSearchResults { clubs: AdminSearchClub[]; teams: AdminSearchTeam[]; players: AdminSearchPlayer[]; coaches: AdminSearchCoach[] }
export async function apiAdminSearch(token: string, q: string): Promise<AdminSearchResults> {
  const res = await fetch(`${API_ORIGIN}/api/admin/search?q=${encodeURIComponent(q)}`, { headers: headers(token) });
  return parse<AdminSearchResults>(res);
}

export async function apiCreateUser(token: string, body: {
  username: string; password: string; role: string; full_name?: string;
}) {
  const res = await fetch(`${API_ORIGIN}/api/admin/users`, {
    method: 'POST', headers: headers(token, true), body: JSON.stringify(body),
  });
  return (await parse<{ user: AdminUser }>(res)).user;
}

export async function apiUpdateUser(token: string, id: number, body: Record<string, unknown>) {
  const res = await fetch(`${API_ORIGIN}/api/admin/users/${id}`, {
    method: 'PATCH', headers: headers(token, true), body: JSON.stringify(body),
  });
  return (await parse<{ user: AdminUser }>(res)).user;
}

export async function apiDeleteUser(token: string, id: number) {
  const res = await fetch(`${API_ORIGIN}/api/admin/users/${id}`, {
    method: 'DELETE', headers: headers(token),
  });
  return parse<{ deleted: number }>(res);
}

// ── match entry ────────────────────────────────────────────────────────────

type Loc = { ar: string; en: string };
export interface EntryCompetition { id: number; name: Loc; age: string; sector: Loc | null; season: string; }
export interface EntryTeam { id: number; name: Loc; logo?: string; }
export interface EntryMatchRow {
  id: number; date: string; time: string; week: string; status: string;
  home: { id: number; name: Loc }; away: { id: number; name: Loc };
  home_score: number | null; away_score: number | null;
  stage_id: number | null; group_id: number | null;
  stage_name: string | null; group_name: string | null;
  deleted_at?: string | null;
}
export interface EntryGoal { id: number; team_id: number; side: string; scorer: string; assist: string | null; minute: number | null; is_own_goal: boolean; is_penalty: boolean; }
export interface EntryCard { id: number; team_id: number; side: string; player: string; card_type: string; minute: number | null; }
export interface EntrySub {
  id: number; team_id: number; side: string;
  player_out: string; player_in: string; minute: number | null;
}
export interface EntryShootoutKick {
  id: number; team_id: number; side: string; player: string;
  kick_order: number; result: string; is_winning_kick: boolean;
}
/** Who started and who was on the bench. Names only — no minutes or positions. */
export interface EntrySide { team_id: number; starters: string[]; bench: string[] }

export interface EntryMatch extends EntryMatchRow {
  home_penalty_score: number | null; away_penalty_score: number | null;
  venue: string; round: string; note: string; goals: EntryGoal[]; cards: EntryCard[];
  subs: EntrySub[]; shootout: EntryShootoutKick[];
  lineup: { home: EntrySide; away: EntrySide };
}

const get = <T,>(token: string, path: string) =>
  fetch(`${API_ORIGIN}${path}`, { headers: headers(token) }).then(r => parse<T>(r));
const send = <T,>(token: string, method: string, path: string, body?: unknown) =>
  fetch(`${API_ORIGIN}${path}`, { method, headers: headers(token, true), body: body ? JSON.stringify(body) : undefined }).then(r => parse<T>(r));

export const apiCompetitions = (t: string) => get<{ competitions: EntryCompetition[] }>(t, '/api/admin/competitions').then(d => d.competitions);
export const apiCompetitionTeams = (t: string, cid: number) => get<{ teams: EntryTeam[] }>(t, `/api/admin/competitions/${cid}/teams`).then(d => d.teams);
export const apiTeamPlayers = (t: string, teamId: number) => get<{ players: string[] }>(t, `/api/admin/teams/${teamId}/players`).then(d => d.players);
// Venue suggestions scoped to one competition — only the grounds already used
// on its matches (empty until fixtures are entered).
export const apiMatchVenues = (t: string, cid: number) => get<{ venues: string[] }>(t, `/api/admin/competitions/${cid}/match-venues`).then(d => d.venues);

// Send one round-results digest notification to the competition's followers.
// Runs in dry-run (logs the payload) until Firebase credentials are configured.
export const apiNotifyRound = (t: string, cid: number, week: string) =>
  send<{ notification: { status: string; topic?: string }; count: number }>(t, 'POST', `/api/admin/competitions/${cid}/notify-round`, { week });
export const apiCompetitionMatches = (t: string, cid: number) => get<{ matches: EntryMatchRow[] }>(t, `/api/admin/competitions/${cid}/matches`).then(d => d.matches);
export const apiCreateMatch = (t: string, cid: number, body: Record<string, unknown>) => send<EntryMatch>(t, 'POST', `/api/admin/competitions/${cid}/matches`, body);
export const apiGetMatch = (t: string, mid: number) => get<EntryMatch>(t, `/api/admin/matches/${mid}`);
export const apiUpdateMatch = (t: string, mid: number, body: Record<string, unknown>) => send<EntryMatch>(t, 'PATCH', `/api/admin/matches/${mid}`, body);
export const apiDeleteMatch = (t: string, mid: number) => send<{ deleted: number; deleted_at: string }>(t, 'DELETE', `/api/admin/matches/${mid}`);
export const apiRestoreMatch = (t: string, mid: number) => send<EntryMatch>(t, 'POST', `/api/admin/matches/${mid}/restore`);

export interface PlayerSearchResult { id: number; name: string; birth_year: number; club: string | null; }
export const apiSearchPlayers = (t: string, q: string) =>
  get<{ players: PlayerSearchResult[] }>(t, `/api/admin/players/search?q=${encodeURIComponent(q)}`).then(d => d.players);

// Compact profile for the merge preview (confirm two records are the same person).
export interface PlayerMergeTeam { club: string; age: string | null; current: boolean; guest: boolean; goals: number }
export interface PlayerMergeSummary { id: number; name: string; birth_year: number; goals: number; assists: number; appearances: number; teams: PlayerMergeTeam[] }
export const apiPlayerSummary = (t: string, id: number) =>
  get<PlayerMergeSummary>(t, `/api/admin/players/${id}/summary`);
export const apiMergePlayer = (t: string, sourceId: number, targetId: number) =>
  send<{ merged: number; into: number; target_name: string }>(t, 'POST', `/api/admin/players/${sourceId}/merge-into/${targetId}`);
export const apiAddGoal = (t: string, mid: number, body: Record<string, unknown>) => send<EntryMatch>(t, 'POST', `/api/admin/matches/${mid}/goals`, body);
export const apiUpdateGoal = (t: string, gid: number, body: Record<string, unknown>) => send<EntryMatch>(t, 'PATCH', `/api/admin/goals/${gid}`, body);
export const apiDeleteGoal = (t: string, gid: number) => send<EntryMatch>(t, 'DELETE', `/api/admin/goals/${gid}`);
export const apiAddCard = (t: string, mid: number, body: Record<string, unknown>) => send<EntryMatch>(t, 'POST', `/api/admin/matches/${mid}/cards`, body);
export const apiUpdateCard = (t: string, cid: number, body: Record<string, unknown>) => send<EntryMatch>(t, 'PATCH', `/api/admin/cards/${cid}`, body);
export const apiDeleteCard = (t: string, cid: number) => send<EntryMatch>(t, 'DELETE', `/api/admin/cards/${cid}`);
// The line-up is sent as a whole side at a time, so a save cannot leave half a list.
export const apiSetLineup = (t: string, mid: number, teamId: number, starters: string[], bench: string[]) =>
  send<EntryMatch>(t, 'PUT', `/api/admin/matches/${mid}/lineup`, { team_id: teamId, starters, bench });
export const apiAddSub = (t: string, mid: number, body: Record<string, unknown>) => send<EntryMatch>(t, 'POST', `/api/admin/matches/${mid}/subs`, body);
export const apiUpdateSub = (t: string, sid: number, body: Record<string, unknown>) => send<EntryMatch>(t, 'PATCH', `/api/admin/subs/${sid}`, body);
export const apiDeleteSub = (t: string, sid: number) => send<EntryMatch>(t, 'DELETE', `/api/admin/subs/${sid}`);
export const apiAddShootoutKick = (t: string, mid: number, body: Record<string, unknown>) => send<EntryMatch>(t, 'POST', `/api/admin/matches/${mid}/shootout`, body);
export const apiUpdateShootoutKick = (t: string, kid: number, body: Record<string, unknown>) => send<EntryMatch>(t, 'PATCH', `/api/admin/shootout/${kid}`, body);
export const apiDeleteShootoutKick = (t: string, kid: number) => send<EntryMatch>(t, 'DELETE', `/api/admin/shootout/${kid}`);

// ── content (news / venues) ──────────────────────────────────────────────────

export interface NotifyResult { status: string; topic?: string; title?: string; body?: string; }

export interface AdminNews {
  id: number; date: string;
  title_ar: string | null; title_en: string | null;
  details_ar: string | null; details_en: string | null;
  image_url: string | null; images: string[]; is_published: boolean;
}

export const apiCreateNews = (t: string, body: Record<string, unknown>) =>
  send<{ id: number; notification: NotifyResult; news: AdminNews }>(t, 'POST', '/api/admin/news', body);
export const apiCreateVenue = (t: string, body: Record<string, unknown>) =>
  send<{ id: number; notification: NotifyResult }>(t, 'POST', '/api/admin/venues', body);

export interface AdminVenue { id: number; name_ar: string | null; name_en: string | null; url: string | null; }
export const apiListVenues = (t: string) =>
  get<{ venues: AdminVenue[] }>(t, '/api/admin/venues').then(d => d.venues);
export const apiUpdateVenue = (t: string, id: number, body: Record<string, unknown>) =>
  send<{ venue: AdminVenue }>(t, 'PATCH', `/api/admin/venues/${id}`, body);
export const apiDeleteVenue = (t: string, id: number) =>
  send<{ deleted: number }>(t, 'DELETE', `/api/admin/venues/${id}`);
// Dashboard figures. No user counts: push goes to an FCM topic with no device
// tokens stored, so the backend genuinely cannot count app users.
export interface AdminStats {
  counts: {
    seasons: number; age_groups: number; competitions: number; clubs: number;
    teams: number; players: number; coaches: number; matches: number;
    goals: number; news: number; venues: number;
  };
  matches: { total: number; played: number; remaining: number };
  averages: { goals_per_match: number; players_per_team: number; teams_per_competition: number };
  active_season: string | null;
  competitions: { id: number; name: string; sector: string; played: number; total: number }[];
  // Full season/competition lists for the dashboard filter — always complete,
  // regardless of which filter is currently applied.
  filters: {
    seasons: { id: number; name: string }[];
    competitions: { id: number; season_id: number; name: string; sector: string; age: string }[];
  };
}
export const apiStats = (t: string, f?: { seasonId?: number | null; competitionId?: number | null }) => {
  const p = new URLSearchParams();
  if (f?.seasonId) p.set('season_id', String(f.seasonId));
  if (f?.competitionId) p.set('competition_id', String(f.competitionId));
  const qs = p.toString();
  return get<AdminStats>(t, `/api/admin/stats${qs ? `?${qs}` : ''}`);
};

export const apiListNews = (t: string) => get<{ news: AdminNews[] }>(t, '/api/admin/news').then(d => d.news);
export const apiUpdateNews = (t: string, id: number, body: Record<string, unknown>) =>
  send<{ news: AdminNews }>(t, 'PATCH', `/api/admin/news/${id}`, body).then(d => d.news);
export const apiDeleteNews = (t: string, id: number) => send<{ deleted: number }>(t, 'DELETE', `/api/admin/news/${id}`);

// ── ads (interstitial) ────────────────────────────────────────────────────────

export interface AdminAd {
  id: number; name: string;
  image: string | null; youtube_video: string | null; facebook_link: string | null;
  mobile_number: string | null; whatsapp_number: string | null;
  location: string | null; location_url: string | null; link: string | null;
  start_date: string | null; expire_date: string | null;
  active: boolean; weight: number; placement: string;
  feed_position: number; feed_repeat: number | null;
}
export const apiListAds = (t: string) => get<{ ads: AdminAd[] }>(t, '/api/admin/ads').then(d => d.ads);
export const apiCreateAd = (t: string, b: Record<string, unknown>) => send<{ ad: AdminAd }>(t, 'POST', '/api/admin/ads', b).then(d => d.ad);
export const apiUpdateAd = (t: string, id: number, b: Record<string, unknown>) => send<{ ad: AdminAd }>(t, 'PATCH', `/api/admin/ads/${id}`, b).then(d => d.ad);
export const apiDeleteAd = (t: string, id: number) => send<{ deleted: number }>(t, 'DELETE', `/api/admin/ads/${id}`);

// First-party ad analytics: per-ad totals + a 30-day daily series.
export interface AdStatRow  { id: number; name: string; impressions: number; clicks: number; ctr: number; }
export interface AdDailyRow { date: string; impressions: number; clicks: number; }
export const apiAdStats = (t: string) => get<{ ads: AdStatRow[]; daily: AdDailyRow[] }>(t, '/api/admin/ads/stats');

// ── app version gate (Android update prompt) ───────────────────────────────────
export interface AppVersionInfo { version_code: string; version_name: string; force_update: boolean; }
export const apiGetAppVersion = (t: string) =>
  get<{ app_version: AppVersionInfo }>(t, '/api/admin/app-version').then(d => d.app_version);
export const apiSetAppVersion = (t: string, b: { version_code: string; version_name: string; force_update: boolean }) =>
  send<{ app_version: AppVersionInfo }>(t, 'PUT', '/api/admin/app-version', b).then(d => d.app_version);

// ── structure management (seasons / age groups / clubs / competitions / teams) ─

export interface MSeason { id: number; name_ar: string | null; name_en: string | null; start_date: string; end_date: string; is_active: boolean; }
export interface MAge { id: number; name_ar: string | null; name_en: string | null; oldest_birth_year: number; }
export interface MClub {
  id: number; name_ar: string | null; name_en: string | null; city_ar: string | null; city_en: string | null;
  logo_url: string | null; website_url: string | null; facebook_url: string | null; instagram_url: string | null;
  twitter_url: string | null; youtube_url: string | null; established: string | null;
}
export interface MComp { id: number; code: string | null; season_id: number; season: string; age_group_id: number | null; age: string | null; name_ar: string | null; name_en: string | null; sector_ar: string | null; sector_en: string | null; }
export interface MTeam { id: number; club_id: number; club_name: string; name_ar: string | null; name_en: string | null; short_name_ar: string | null; short_name_en: string | null; point_deduction: number; logo: string | null; }

export const apiSeasons = (t: string) => get<{ seasons: MSeason[] }>(t, '/api/admin/seasons').then(d => d.seasons);
export const apiCreateSeason = (t: string, b: Record<string, unknown>) => send<{ season: MSeason }>(t, 'POST', '/api/admin/seasons', b).then(d => d.season);
export const apiUpdateSeason = (t: string, id: number, b: Record<string, unknown>) => send<{ season: MSeason }>(t, 'PATCH', `/api/admin/seasons/${id}`, b).then(d => d.season);
export const apiDeleteSeason = (t: string, id: number, password: string) => send<{ deleted: number }>(t, 'DELETE', `/api/admin/seasons/${id}`, { password });

// What a delete would take with it, shown before the admin confirms.
export type DeleteKind = 'season' | 'age-group' | 'club' | 'competition' | 'team';
export interface DeleteCount { count: number; noun: string }
export interface DeletePreview {
  label: string; name: string | null;
  blockers: DeleteCount[];   // non-empty means the delete is refused
  cascades: DeleteCount[];   // removed along with the row
}
export const apiDeletePreview = (t: string, kind: DeleteKind, id: number) =>
  get<DeletePreview>(t, `/api/admin/delete-preview/${kind}/${id}`);

export const apiAgeGroups = (t: string) => get<{ age_groups: MAge[] }>(t, '/api/admin/age-groups').then(d => d.age_groups);
export const apiCreateAge = (t: string, b: Record<string, unknown>) => send<{ age_group: MAge }>(t, 'POST', '/api/admin/age-groups', b).then(d => d.age_group);
export const apiUpdateAge = (t: string, id: number, b: Record<string, unknown>) => send<{ age_group: MAge }>(t, 'PATCH', `/api/admin/age-groups/${id}`, b).then(d => d.age_group);

export const apiDeleteAge = (t: string, id: number, password: string) => send<{ deleted: number }>(t, 'DELETE', `/api/admin/age-groups/${id}`, { password });

export const apiClubs = (t: string, q = '') => get<{ clubs: MClub[] }>(t, `/api/admin/clubs${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(d => d.clubs);
export const apiClub = (t: string, id: number) => get<{ club: MClub }>(t, `/api/admin/clubs/${id}`).then(d => d.club);
export const apiCreateClub = (t: string, b: Record<string, unknown>) => send<{ club: MClub }>(t, 'POST', '/api/admin/clubs', b).then(d => d.club);
export const apiUpdateClub = (t: string, id: number, b: Record<string, unknown>) => send<{ club: MClub }>(t, 'PATCH', `/api/admin/clubs/${id}`, b).then(d => d.club);
export const apiDeleteClub = (t: string, id: number, password: string) => send<{ deleted: number }>(t, 'DELETE', `/api/admin/clubs/${id}`, { password });

// ── club youth-sector staff (managers) ───────────────────────────────────────
export interface MClubStaff {
  id: number; coach_id: number;
  name_ar: string | null; name_en: string | null; photo: string | null;
  role_ar: string | null; role_en: string | null;
  start_date: string | null; end_date: string | null;
}
export const apiClubStaff = (t: string, cid: number) => get<{ staff: MClubStaff[] }>(t, `/api/admin/clubs/${cid}/staff`).then(d => d.staff);
export const apiAddClubStaff = (t: string, cid: number, b: Record<string, unknown>) => send<{ staff: MClubStaff }>(t, 'POST', `/api/admin/clubs/${cid}/staff`, b).then(d => d.staff);
/** Attach an EXISTING person (by coach id) as club staff — e.g. a coach promoted to a manager. */
export const apiAttachClubStaff = (t: string, cid: number, b: { coach_id: number; role_ar?: string; role_en?: string; start_date?: string }) =>
  send<{ staff: MClubStaff }>(t, 'POST', `/api/admin/clubs/${cid}/staff/attach`, b).then(d => d.staff);
export const apiUpdateClubStaff = (t: string, sid: number, b: Record<string, unknown>) => send<{ staff: MClubStaff }>(t, 'PATCH', `/api/admin/club-staff/${sid}`, b).then(d => d.staff);
export const apiDeleteClubStaff = (t: string, sid: number) => send<{ deleted: number }>(t, 'DELETE', `/api/admin/club-staff/${sid}`);
export const apiReorderClubStaff = (t: string, cid: number, ids: number[]) => send<{ ok: boolean }>(t, 'POST', `/api/admin/clubs/${cid}/staff/reorder`, { ids });

// ── teams, team coaches, roster ───────────────────────────────────────────────
export interface MTeamFull {
  id: number; club_id: number; club_name: string | null;
  name_ar: string | null; name_en: string | null; logo: string | null;
  age_group_id: number | null; age: string | null;
  // A team is not tied to a season; these are the seasons it actually played,
  // newest first, taken from the competitions it entered.
  seasons: string[];
}
export interface MTeamCoach {
  id: number; coach_id: number; name_ar: string | null; name_en: string | null; photo: string | null;
  role_ar: string | null; role_en: string | null; start_date: string | null; end_date: string | null;
}
export interface MRegistration {
  id: number; player_id: number; name_ar: string | null; name_en: string | null; photo: string | null;
  birth_year: number; birth_year_verified: boolean;
  position_ar: string | null; position_en: string | null;
  sub_position_ar: string | null; sub_position_en: string | null;
  shirt_number: number | null; status: string; start_date: string | null; end_date: string | null;
  /** A younger player guesting up for this older team (same club). */
  is_guest: boolean;
}

export const apiClubTeams = (t: string, cid: number) => get<{ teams: MTeamFull[] }>(t, `/api/admin/clubs/${cid}/teams`).then(d => d.teams);
export const apiCreateClubTeam = (t: string, cid: number, b: Record<string, unknown>) => send<{ team: MTeamFull }>(t, 'POST', `/api/admin/clubs/${cid}/teams`, b).then(d => d.team);
export const apiTeam = (t: string, tid: number) => get<{ team: MTeamFull }>(t, `/api/admin/teams/${tid}`).then(d => d.team);

export const apiTeamCoaches = (t: string, tid: number) => get<{ coaches: MTeamCoach[] }>(t, `/api/admin/teams/${tid}/coaches`).then(d => d.coaches);
export const apiAddTeamCoach = (t: string, tid: number, b: Record<string, unknown>) => send<{ coach: MTeamCoach }>(t, 'POST', `/api/admin/teams/${tid}/coaches`, b).then(d => d.coach);
/** Attach an EXISTING coach (by id) to a team, instead of creating a new one. */
export const apiAttachCoach = (t: string, tid: number, b: { coach_id: number; role_ar?: string; role_en?: string; start_date?: string }) =>
  send<{ coach: MTeamCoach }>(t, 'POST', `/api/admin/teams/${tid}/coaches/attach`, b).then(d => d.coach);
export interface CoachSearchResult { id: number; name: string; birth_year: number | null; club: string | null; role: string | null }
export const apiSearchCoaches = (t: string, q: string) =>
  get<{ coaches: CoachSearchResult[] }>(t, `/api/admin/coaches/search?q=${encodeURIComponent(q)}`).then(d => d.coaches);

// Compact profile for the coach merge preview (confirm two records are one person).
export interface CoachMergeRole { type: 'coach' | 'manager'; club: string | null; role: string | null; age: string | null; current: boolean }
export interface CoachMergeSummary { id: number; name: string; birth_year: number | null; roles: CoachMergeRole[] }
export const apiCoachSummary = (t: string, id: number) =>
  get<CoachMergeSummary>(t, `/api/admin/coaches/${id}/summary`);
export const apiMergeCoach = (t: string, sourceId: number, targetId: number) =>
  send<{ merged: number; into: number; target_name: string }>(t, 'POST', `/api/admin/coaches/${sourceId}/merge-into/${targetId}`);
export const apiUpdateTeamCoach = (t: string, id: number, b: Record<string, unknown>) => send<{ coach: MTeamCoach }>(t, 'PATCH', `/api/admin/team-coaches/${id}`, b).then(d => d.coach);
export const apiDeleteTeamCoach = (t: string, id: number) => send<{ deleted: number }>(t, 'DELETE', `/api/admin/team-coaches/${id}`);
export const apiReorderTeamCoaches = (t: string, tid: number, ids: number[]) => send<{ ok: boolean }>(t, 'POST', `/api/admin/teams/${tid}/coaches/reorder`, { ids });

export const apiTeamRoster = (t: string, tid: number) => get<{ roster: MRegistration[] }>(t, `/api/admin/teams/${tid}/roster`).then(d => d.roster);
export const apiAddTeamPlayer = (t: string, tid: number, b: Record<string, unknown>) => send<{ registration: MRegistration }>(t, 'POST', `/api/admin/teams/${tid}/roster`, b).then(d => d.registration);
/** Attach an EXISTING player (by id) to a team, instead of creating a new one. */
export const apiAttachPlayer = (t: string, tid: number, b: { player_id: number; shirt_number?: number | null; start_date?: string; status?: string }) =>
  send<{ registration: MRegistration }>(t, 'POST', `/api/admin/teams/${tid}/roster/attach`, b).then(d => d.registration);
export const apiUpdateTeamPlayer = (t: string, id: number, b: Record<string, unknown>) => send<{ registration: MRegistration }>(t, 'PATCH', `/api/admin/player-teams/${id}`, b).then(d => d.registration);
export const apiDeleteTeamPlayer = (t: string, id: number) => send<{ deleted: number }>(t, 'DELETE', `/api/admin/player-teams/${id}`);
export const apiReorderTeamRoster = (t: string, tid: number, ids: number[]) => send<{ ok: boolean }>(t, 'POST', `/api/admin/teams/${tid}/roster/reorder`, { ids });
/** Move the same player to another team: closes this stint, opens a new one. */
export const apiTransferPlayer = (t: string, ptid: number, b: { team_id: number; start_date?: string; shirt_number?: number | null }) =>
  send<{ registration: MRegistration; team_id: number }>(t, 'POST', `/api/admin/player-teams/${ptid}/transfer`, b);

export const apiCompsManage = (t: string) => get<{ competitions: MComp[] }>(t, '/api/admin/competitions-manage').then(d => d.competitions);
export const apiCreateComp = (t: string, b: Record<string, unknown>) => send<{ competition: MComp }>(t, 'POST', '/api/admin/competitions-manage', b).then(d => d.competition);
export const apiUpdateComp = (t: string, id: number, b: Record<string, unknown>) => send<{ competition: MComp }>(t, 'PATCH', `/api/admin/competitions-manage/${id}`, b).then(d => d.competition);
export const apiDeleteComp = (t: string, id: number, password: string) => send<{ deleted: number }>(t, 'DELETE', `/api/admin/competitions-manage/${id}`, { password });

// ── stages and groups ─────────────────────────────────────────────────────────
export type StageType = 'league' | 'group' | 'knockout';
export const STAGE_TYPE_LABEL: Record<StageType, string> = {
  league: 'دوري', group: 'مجموعات', knockout: 'خروج المغلوب',
};
export interface MGroup {
  id: number; stage_id: number; name_ar: string | null; name_en: string | null; team_count: number;
}
export interface MStage {
  id: number; competition_id: number;
  name_ar: string | null; name_en: string | null;
  stage_order: number; type: StageType; carries_points: boolean;
  match_count: number; groups: MGroup[];
}
export interface MGroupTeam extends MTeam { group_team_id: number }

export const apiCompetition = (t: string, cid: number) => get<{ competition: MComp }>(t, `/api/admin/competitions-manage/${cid}`).then(d => d.competition);
export const apiStages = (t: string, cid: number) => get<{ stages: MStage[] }>(t, `/api/admin/competitions-manage/${cid}/stages`).then(d => d.stages);
export const apiCreateStage = (t: string, cid: number, b: Record<string, unknown>) => send<{ stage: MStage }>(t, 'POST', `/api/admin/competitions-manage/${cid}/stages`, b).then(d => d.stage);
export const apiUpdateStage = (t: string, sid: number, b: Record<string, unknown>) => send<{ stage: MStage }>(t, 'PATCH', `/api/admin/stages/${sid}`, b).then(d => d.stage);
export const apiDeleteStage = (t: string, sid: number) => send<{ deleted: number }>(t, 'DELETE', `/api/admin/stages/${sid}`);

export const apiCreateGroup = (t: string, sid: number, b: Record<string, unknown>) => send<{ group: MGroup }>(t, 'POST', `/api/admin/stages/${sid}/groups`, b).then(d => d.group);
export const apiUpdateGroup = (t: string, gid: number, b: Record<string, unknown>) => send<{ group: MGroup }>(t, 'PATCH', `/api/admin/groups/${gid}`, b).then(d => d.group);
export const apiDeleteGroup = (t: string, gid: number) => send<{ deleted: number }>(t, 'DELETE', `/api/admin/groups/${gid}`);

export const apiGroupTeams = (t: string, gid: number) => get<{ teams: MGroupTeam[] }>(t, `/api/admin/groups/${gid}/teams`).then(d => d.teams);
export const apiAddGroupTeam = (t: string, gid: number, teamId: number) => send<{ team: MGroupTeam }>(t, 'POST', `/api/admin/groups/${gid}/teams`, { team_id: teamId }).then(d => d.team);
export const apiRemoveGroupTeam = (t: string, gtid: number) => send<{ deleted: number }>(t, 'DELETE', `/api/admin/group-teams/${gtid}`);

export const apiCompTeamsManage = (t: string, cid: number) => get<{ teams: MTeam[] }>(t, `/api/admin/competitions/${cid}/teams-manage`).then(d => d.teams);
export const apiEnrollTeam = (t: string, cid: number, b: Record<string, unknown>) => send<{ team: MTeam }>(t, 'POST', `/api/admin/competitions/${cid}/teams-manage`, b).then(d => d.team);
export const apiUnenrollTeam = (t: string, cid: number, tid: number) => send<{ ok: boolean }>(t, 'DELETE', `/api/admin/competitions/${cid}/teams-manage/${tid}`).then(d => d.ok);
export const apiUpdateTeam = (t: string, id: number, b: Record<string, unknown>) => send<{ team: MTeam }>(t, 'PATCH', `/api/admin/teams/${id}`, b).then(d => d.team);
export const apiDeleteTeam = (t: string, id: number, password: string) => send<{ deleted: number }>(t, 'DELETE', `/api/admin/teams/${id}`, { password });

/** Upload an image file; the server resizes it and returns a hosted URL. */
export async function apiUploadImage(token: string, file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_ORIGIN}/api/admin/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'فشل رفع الصورة');
  return (data as { url: string }).url;
}
