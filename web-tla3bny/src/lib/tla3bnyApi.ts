// tla3bny API client (v2) — talks to the Flask /api/tla3bny endpoints.
// Reads are public; writes carry the tla3bny bearer token, which is separate
// from the youthscores admin token.

// Same-origin by default (relative): Flask serves this app on
// tla3bny.youthscores.org and answers /api/tla3bny there too. Override with
// NEXT_PUBLIC_CONFIG_URL only to point at a different origin.
const API_ORIGIN = (
  process.env.NEXT_PUBLIC_CONFIG_URL ?? '/api/config'
).replace(/\/api\/config\/?$/, '');

export const T_BASE = `${API_ORIGIN}/api/tla3bny`;

/** Absolute URL for an uploaded asset stored as `uploads/<name>`. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${API_ORIGIN}/${path.replace(/^\/+/, '')}`;
}

// ── types ───────────────────────────────────────────────────────────────────
export type TRole = 'super_admin' | 'competition_admin' | 'academy' | 'team';
export type TUserStatus = 'active' | 'pending' | 'approved' | 'rejected';
export type TAcademyStatus = 'pending' | 'approved' | 'rejected';
export type TApprovalStatus = 'pending' | 'approved' | 'rejected';
export type TCompStatus = 'draft' | 'active' | 'finished';
export type TMatchStatus = 'scheduled' | 'live' | 'finished';
export type TStageType = 'group' | 'league' | 'knockout';
export type TEventType =
  | 'goal' | 'assist' | 'yellow' | 'red' | 'substitution_in' | 'substitution_out';

export interface TUser {
  id: number;
  email: string;
  role: TRole;
  status: TUserStatus;
  name: string | null;
  academy_id: number | null;
  team_id: number | null;
  created_at?: string;
}

export interface TManager {
  id: number;
  academy_id: number;
  name: string;
  role: string | null;
  phone: string | null;
  sort_order: number;
}

export interface TAcademy {
  id: number;
  name: string;
  logo_path: string | null;
  phone: string | null;
  facebook_url: string | null;
  training_place: string | null;
  address: string | null;
  description: string | null;
  status: TAcademyStatus;
  rejection_reason?: string | null;
  managers: TManager[];
  teams?: TTeam[];
  created_at?: string;
}

export interface TCoach {
  id: number;
  team_id: number;
  name: string;
  role_ar: string | null;
  phone: string | null;
  photo_path: string | null;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
}

export interface TMembership {
  id: number;
  player_id: number;
  player_name: string | null;
  photo_path: string | null;
  position: string | null;
  team_id: number;
  academy_id: number | null;
  jersey_number: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

export interface TTeam {
  id: number;
  academy_id: number;
  academy_name: string | null;
  academy_logo: string | null;
  age_category_id: number;
  age_category: string | null;
  class_label: string | null;
  name: string | null;
  display_name: string;
  coaches?: TCoach[];
  players?: TMembership[];
}

export interface TPlayerFile {
  id: number;
  player_id: number;
  file_path: string;
  original_name: string | null;
}

export interface TPlayer {
  id: number;
  name: string;
  dob: string | null;
  position: string | null;
  sub_position: string | null;
  photo_path: string | null;
  papers_path: string | null;
  current_team_id: number | null;
  current_academy_id: number | null;
  jersey_number: number | null;
  files?: TPlayerFile[];
  file_count?: number;
}

export interface TCategory {
  id: number;
  label: string;
  required_files: number;
  sort_order: number;
}

export interface TSeason {
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface TCompAge {
  id: number;
  competition_id: number;
  age_category_id: number;
  age_category: string | null;
  max_players_per_team: number;
  lineup_size: number;
  players_on_pitch: number;
  max_substitutes: number;
  num_periods: number;
  period_minutes: number;
  lineup_deadline_minutes: number;
  stages?: TStage[];
}

export interface TCompAdmin {
  id: number;
  competition_id: number;
  user_id: number;
  user_email: string | null;
  user_name: string | null;
}

export interface TCompetition {
  id: number;
  season_id: number;
  season_name: string | null;
  name: string;
  description: string | null;
  logo_path: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  status: TCompStatus;
  ages?: TCompAge[];
  admins?: TCompAdmin[];
}

export interface TStage {
  id: number;
  competition_age_id: number;
  name: string | null;
  stage_order: number;
  type: TStageType;
  carries_points: boolean;
  groups?: TGroup[];
}

export interface TGroup {
  id: number;
  stage_id: number;
  name: string | null;
  team_ids: number[];
}

export interface TCompPlayer {
  id: number;
  competition_team_id: number;
  player_id: number;
  player_name: string | null;
  photo_path: string | null;
  position: string | null;
  status: TApprovalStatus;
  rejection_reason: string | null;
}

export interface TCompTeam {
  id: number;
  competition_id: number;
  team_id: number;
  team_name: string | null;
  academy_id: number | null;
  academy_name: string | null;
  academy_logo: string | null;
  age_category_id: number;
  status: string;
  point_deduction: number;
  roster?: TCompPlayer[];
}

export interface TRules {
  players_on_pitch: number;
  lineup_size: number;
  max_substitutes: number;
  num_periods: number;
  period_minutes: number;
  lineup_deadline_minutes: number;
  max_players_per_team: number;
}

export interface TMatchEvent {
  id: number;
  match_id: number;
  player_id: number | null;
  player_name: string | null;
  team_id: number | null;
  event_type: TEventType;
  minute: number | null;
  related_event_id: number | null;
}

export interface TMatch {
  id: number;
  competition_id: number;
  competition_name: string | null;
  age_category_id: number;
  age_category: string | null;
  stage_id: number | null;
  stage_name: string | null;
  stage_type: TStageType | null;
  group_id: number | null;
  group_name: string | null;
  home_team_id: number;
  away_team_id: number;
  home_team_name: string | null;
  away_team_name: string | null;
  home_academy_id: number | null;
  away_academy_id: number | null;
  home_logo: string | null;
  away_logo: string | null;
  date: string | null;
  time: string | null;
  venue: string | null;
  round: string | null;
  rules: (TRules & { age_category: string | null }) | null;
  status: TMatchStatus;
  home_score: number | null;
  away_score: number | null;
  events?: TMatchEvent[];
}

export interface TStandingRow {
  team_id: number;
  team_name: string | null;
  academy_id: number | null;
  academy_logo: string | null;
  P: number; W: number; D: number; L: number;
  GF: number; GA: number; GD: number;
  point_deduction: number;
  Pts: number;
  rank: number;
  form: ('W' | 'D' | 'L')[];
}
export interface TStandingGroup {
  group: { id: number; name: string | null; stage_id: number } | null;
  standings: TStandingRow[];
}

export interface TBracketStage {
  stage_id: number;
  stage_name: string | null;
  rounds: { round: string; matches: TMatch[] }[];
}

export interface TBoardRow {
  player_id: number;
  player_name: string;
  photo_path: string | null;
  team_id: number | null;
  team_name: string | null;
  academy_id: number | null;
  count: number;
}
export interface TAnalysis {
  top_scorers: TBoardRow[];
  top_assisters: TBoardRow[];
  yellow_cards: TBoardRow[];
  red_cards: TBoardRow[];
}

export interface TLineupSlot {
  id: number;
  lineup_id: number;
  position_slot: string | null;
  player_id: number | null;
  player_name: string | null;
  photo_path: string | null;
  is_substitute: boolean;
}
export interface TLineup {
  id: number;
  match_id: number;
  team_id: number;
  team_name: string | null;
  formation: string | null;
  slots: TLineupSlot[];
}

export interface TNews {
  id: number;
  competition_id: number;
  competition_name: string | null;
  title: string;
  body: string | null;
  image_path: string | null;
  published_at: string;
}

export interface THome {
  today_matches: TMatch[];
  recent_news: TNews[];
}

export interface TMeResponse {
  user: TUser;
  academy?: TAcademy;
  team?: TTeam;
  competitions?: TCompetition[];
}

// ── fetch helpers ───────────────────────────────────────────────────────────
function authHeaders(token?: string | null, json = false): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `خطأ (${res.status})`);
  return data as T;
}

const get = <T,>(path: string, token?: string | null) =>
  fetch(`${T_BASE}${path}`, { headers: authHeaders(token), cache: 'no-store' }).then(r => parse<T>(r));
const send = <T,>(method: string, path: string, body?: unknown, token?: string | null) =>
  fetch(`${T_BASE}${path}`, {
    method,
    headers: authHeaders(token, true),
    body: body != null ? JSON.stringify(body) : undefined,
  }).then(r => parse<T>(r));
const sendForm = <T,>(method: string, path: string, body: FormData, token?: string | null) =>
  fetch(`${T_BASE}${path}`, { method, headers: authHeaders(token), body }).then(r => parse<T>(r));

function qs(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, String(v)); });
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ── auth ────────────────────────────────────────────────────────────────────
export const tLogin = (email: string, password: string) =>
  send<{ token: string; user: TUser }>('POST', '/auth/login', { email, password });

export function tRegister(fd: {
  name: string; email: string; password: string;
  phone?: string; facebook_url?: string; training_place?: string; address?: string;
  description?: string; logo?: File | null;
}) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null && v !== '' && k !== 'logo') body.append(k, String(v)); });
  if (fd.logo) body.append('logo', fd.logo);
  return fetch(`${T_BASE}/auth/register`, { method: 'POST', body }).then(
    r => parse<{ message: string; token: string; user: TUser }>(r),
  );
}

export const tMe = (token: string) => get<TMeResponse>('/auth/me', token).catch(() => null);

// ── seasons ─────────────────────────────────────────────────────────────────
export const tSeasons = () => get<TSeason[]>('/seasons');
export const tCreateSeason = (token: string, b: Record<string, unknown>) =>
  send<TSeason>('POST', '/seasons', b, token);
export const tUpdateSeason = (token: string, id: number, b: Record<string, unknown>) =>
  send<TSeason>('PUT', `/seasons/${id}`, b, token);
export const tDeleteSeason = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/seasons/${id}`, undefined, token);

// ── age categories ──────────────────────────────────────────────────────────
export const tCategories = () => get<TCategory[]>('/categories');
export const tCreateCategory = (token: string, b: Record<string, unknown>) =>
  send<TCategory>('POST', '/categories', b, token);
export const tUpdateCategory = (token: string, id: number, b: Record<string, unknown>) =>
  send<TCategory>('PUT', `/categories/${id}`, b, token);
export const tDeleteCategory = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/categories/${id}`, undefined, token);

// ── academies ───────────────────────────────────────────────────────────────
export const tAcademies = () => get<TAcademy[]>('/academies');
export const tAcademy = (id: number) => get<TAcademy>(`/academies/${id}`);
export const tManageAcademies = (token: string, status?: string) =>
  get<TAcademy[]>(`/academies/manage${qs({ status })}`, token);
export const tApproveAcademy = (token: string, id: number) =>
  send<TAcademy>('POST', `/academies/${id}/approve`, undefined, token);
export const tRejectAcademy = (token: string, id: number, reason?: string) =>
  send<TAcademy>('POST', `/academies/${id}/reject`, { reason }, token);
export const tSuspendAcademy = (token: string, id: number) =>
  send<TAcademy>('POST', `/academies/${id}/suspend`, undefined, token);

export function tUpdateAcademy(token: string, fd: Record<string, string | undefined>, logo?: File | null) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null) body.append(k, v); });
  if (logo) body.append('logo', logo);
  return sendForm<TAcademy>('PUT', '/academies/me', body, token);
}
export const tAddManager = (token: string, academyId: number, b: Record<string, unknown>) =>
  send<TManager>('POST', `/academies/${academyId}/managers`, b, token);
export const tDeleteManager = (token: string, academyId: number, id: number) =>
  send<{ message: string }>('DELETE', `/academies/${academyId}/managers/${id}`, undefined, token);

// ── teams ───────────────────────────────────────────────────────────────────
export const tAcademyTeams = (academyId: number) => get<TTeam[]>(`/academies/${academyId}/teams`);
export const tTeam = (id: number) => get<TTeam>(`/teams/${id}`);
export const tCreateTeam = (token: string, academyId: number, b: Record<string, unknown>) =>
  send<TTeam>('POST', `/academies/${academyId}/teams`, b, token);
export const tUpdateTeam = (token: string, id: number, b: Record<string, unknown>) =>
  send<TTeam>('PUT', `/teams/${id}`, b, token);
export const tDeleteTeam = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/teams/${id}`, undefined, token);
export const tSetTeamAccount = (token: string, teamId: number, b: { email: string; password: string }) =>
  send<{ message: string; email: string; team_id: number }>('POST', `/teams/${teamId}/account`, b, token);

// ── coaches ─────────────────────────────────────────────────────────────────
export function tAddCoach(token: string, teamId: number, fd: Record<string, string | undefined>, photo?: File | null) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null && v !== '') body.append(k, v); });
  if (photo) body.append('photo', photo);
  return sendForm<TCoach>('POST', `/teams/${teamId}/coaches`, body, token);
}
export function tUpdateCoach(token: string, id: number, fd: Record<string, string | undefined>, photo?: File | null) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null) body.append(k, v); });
  if (photo) body.append('photo', photo);
  return sendForm<TCoach>('PUT', `/coaches/${id}`, body, token);
}
export const tDeleteCoach = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/coaches/${id}`, undefined, token);

// ── players ─────────────────────────────────────────────────────────────────
export const tPlayer = (id: number) => get<TPlayer>(`/players/${id}`);
export function tCreatePlayer(
  token: string, teamId: number, fd: Record<string, string | number | undefined>,
  photo?: File | null, documents?: File[],
) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null && v !== '') body.append(k, String(v)); });
  if (photo) body.append('photo', photo);
  (documents ?? []).forEach(f => body.append('documents', f));
  return sendForm<TPlayer>('POST', `/teams/${teamId}/players`, body, token);
}
export function tUpdatePlayer(
  token: string, id: number, fd: Record<string, string | number | undefined>,
  photo?: File | null, documents?: File[],
) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null && v !== '') body.append(k, String(v)); });
  if (photo) body.append('photo', photo);
  (documents ?? []).forEach(f => body.append('documents', f));
  return sendForm<TPlayer>('PUT', `/players/${id}`, body, token);
}
export const tMovePlayer = (token: string, id: number, b: Record<string, unknown>) =>
  send<TPlayer>('POST', `/players/${id}/move`, b, token);
export const tDeletePlayer = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/players/${id}`, undefined, token);
export const tDeletePlayerFile = (token: string, playerId: number, fileId: number) =>
  send<{ message: string }>('DELETE', `/players/${playerId}/files/${fileId}`, undefined, token);

// ── competitions ────────────────────────────────────────────────────────────
export const tCompetitions = (seasonId?: number) =>
  get<TCompetition[]>(`/competitions${qs({ season_id: seasonId })}`);
export const tCompetition = (id: number) => get<TCompetition>(`/competitions/${id}`);
export function tCreateCompetition(token: string, fd: Record<string, string | number | undefined>, logo?: File | null) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null && v !== '') body.append(k, String(v)); });
  if (logo) body.append('logo', logo);
  return sendForm<TCompetition>('POST', '/competitions', body, token);
}
export function tUpdateCompetition(token: string, id: number, fd: Record<string, string | number | undefined>, logo?: File | null) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null) body.append(k, String(v)); });
  if (logo) body.append('logo', logo);
  return sendForm<TCompetition>('PUT', `/competitions/${id}`, body, token);
}
export const tDeleteCompetition = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/competitions/${id}`, undefined, token);
export const tAddCompAdmin = (token: string, compId: number, b: Record<string, unknown>) =>
  send<{ message: string; user: TUser }>('POST', `/competitions/${compId}/admins`, b, token);
export const tRemoveCompAdmin = (token: string, compId: number, userId: number) =>
  send<{ message: string }>('DELETE', `/competitions/${compId}/admins/${userId}`, undefined, token);

// ── competition ages + rules ──────────────────────────────────────────────
export const tAddCompAge = (token: string, compId: number, b: Record<string, unknown>) =>
  send<TCompAge>('POST', `/competitions/${compId}/ages`, b, token);
export const tUpdateCompAge = (token: string, id: number, b: Record<string, unknown>) =>
  send<TCompAge>('PUT', `/competition-ages/${id}`, b, token);
export const tDeleteCompAge = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/competition-ages/${id}`, undefined, token);

// ── stages + groups ─────────────────────────────────────────────────────────
export const tAddStage = (token: string, cageId: number, b: Record<string, unknown>) =>
  send<TStage>('POST', `/competition-ages/${cageId}/stages`, b, token);
export const tUpdateStage = (token: string, id: number, b: Record<string, unknown>) =>
  send<TStage>('PUT', `/stages/${id}`, b, token);
export const tDeleteStage = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/stages/${id}`, undefined, token);
export const tAddGroup = (token: string, stageId: number, b: Record<string, unknown>) =>
  send<TGroup>('POST', `/stages/${stageId}/groups`, b, token);
export const tDeleteGroup = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/groups/${id}`, undefined, token);
export const tAddGroupTeam = (token: string, groupId: number, teamId: number) =>
  send<TGroup>('POST', `/groups/${groupId}/teams`, { team_id: teamId }, token);
export const tRemoveGroupTeam = (token: string, groupId: number, teamId: number) =>
  send<{ message: string }>('DELETE', `/groups/${groupId}/teams/${teamId}`, undefined, token);

// ── registration + roster ─────────────────────────────────────────────────
export const tCompTeams = (compId: number, ageId?: number, withRoster = false) =>
  get<TCompTeam[]>(`/competitions/${compId}/teams${qs({ age_category_id: ageId, roster: withRoster ? 1 : undefined })}`);
export const tRegisterTeam = (token: string, compId: number, teamId: number) =>
  send<TCompTeam>('POST', `/competitions/${compId}/teams`, { team_id: teamId }, token);
export const tUnregisterTeam = (token: string, entryId: number) =>
  send<{ message: string }>('DELETE', `/competition-teams/${entryId}`, undefined, token);
export const tRoster = (entryId: number) => get<TCompTeam>(`/competition-teams/${entryId}/roster`);
export const tAddRosterPlayer = (token: string, entryId: number, playerId: number) =>
  send<TCompPlayer>('POST', `/competition-teams/${entryId}/players`, { player_id: playerId }, token);
export const tRemoveRosterPlayer = (token: string, cpId: number) =>
  send<{ message: string }>('DELETE', `/competition-players/${cpId}`, undefined, token);
export const tApproveRosterPlayer = (token: string, cpId: number) =>
  send<TCompPlayer>('POST', `/competition-players/${cpId}/approve`, undefined, token);
export const tRejectRosterPlayer = (token: string, cpId: number, reason?: string) =>
  send<TCompPlayer>('POST', `/competition-players/${cpId}/reject`, { reason }, token);

// ── matches ─────────────────────────────────────────────────────────────────
export const tMatches = (params: {
  competition_id?: number; age_category_id?: number; stage_id?: number;
  group_id?: number; status?: string; team_id?: number; date?: string;
} = {}) => get<TMatch[]>(`/matches${qs(params)}`);
export const tMatch = (id: number) => get<TMatch>(`/matches/${id}`);
export const tCreateMatch = (token: string, b: Record<string, unknown>) =>
  send<TMatch>('POST', '/matches', b, token);
export const tUpdateMatch = (token: string, id: number, b: Record<string, unknown>) =>
  send<TMatch>('PUT', `/matches/${id}`, b, token);
export const tDeleteMatch = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/matches/${id}`, undefined, token);
export const tEnterResult = (token: string, id: number, b: Record<string, unknown>) =>
  send<TMatch>('POST', `/matches/${id}/result`, b, token);

// ── lineups ─────────────────────────────────────────────────────────────────
export const tMatchLineups = (matchId: number) => get<TLineup[]>(`/lineups/match/${matchId}`);
export const tSaveLineup = (token: string, matchId: number, teamId: number, b: Record<string, unknown>) =>
  send<TLineup>('PUT', `/lineups/match/${matchId}/team/${teamId}`, b, token);

// ── standings / bracket / analysis ────────────────────────────────────────
export const tStandings = (compId: number, ageId: number) =>
  get<TStandingGroup[]>(`/standings${qs({ competition_id: compId, age_category_id: ageId })}`);
export const tBracket = (compId: number, ageId: number) =>
  get<TBracketStage[]>(`/bracket${qs({ competition_id: compId, age_category_id: ageId })}`);
export const tAnalysis = (compId: number, ageId: number) =>
  get<TAnalysis>(`/analysis${qs({ competition_id: compId, age_category_id: ageId })}`);

// ── news / home ─────────────────────────────────────────────────────────────
export const tNews = (compId?: number, limit?: number) =>
  get<TNews[]>(`/news${qs({ competition_id: compId, limit })}`);
export const tNewsItem = (id: number) => get<TNews>(`/news/${id}`);
export function tCreateNews(token: string, compId: number, fd: Record<string, string | undefined>, image?: File | null) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null && v !== '') body.append(k, v); });
  if (image) body.append('image', image);
  return sendForm<TNews>('POST', `/competitions/${compId}/news`, body, token);
}
export const tDeleteNews = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/news/${id}`, undefined, token);
export const tHome = () => get<THome>('/home');
