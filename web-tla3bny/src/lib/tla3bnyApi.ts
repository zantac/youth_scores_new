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
export type TUserStatus = 'active' | 'suspended' | 'pending' | 'approved' | 'rejected';
/** Registration is open, so an academy is 'approved' from the moment it signs
 *  up; 'suspended' is the super admin taking one off the site. */
export type TAcademyStatus = 'approved' | 'suspended' | 'pending' | 'rejected';
export type TApprovalStatus = 'pending' | 'approved' | 'rejected';
export type TCompStatus = 'draft' | 'active' | 'finished';
export type TMatchStatus = 'scheduled' | 'live' | 'finished';
export type TStageType = 'group' | 'league' | 'knockout';
export type TEventType =
  | 'goal' | 'assist' | 'yellow' | 'red' | 'substitution_in' | 'substitution_out';

export interface TUser {
  id: number;
  /** The login handed to an organizer / academy owner / team manager. */
  username: string | null;
  email: string | null;
  /** Whichever of the two this account signs in with. */
  login: string | null;
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
  label: string | null;
}

export interface TPlayer {
  id: number;
  name: string;
  dob: string | null;
  position: string | null;
  sub_position: string | null;
  photo_path: string | null;
  current_team_id: number | null;
  current_academy_id: number | null;
  jersey_number: number | null;
  // Registration papers — present only for callers the API lets see them
  // (the owning academy/team login, or a competition admin).
  papers_path?: string | null;
  files?: TPlayerFile[];
  file_count?: number;
}

/** One competition a player was entered into, and how that request went. */
export interface TPlayerRegistration {
  id: number;
  competition_id: number | null;
  competition_name: string | null;
  status: TApprovalStatus;
  // Withheld from public callers.
  rejection_reason?: string | null;
  required_documents?: string[];
  missing_documents?: string[];
}

/** Which papers a team's players must upload, and which competition asks. */
export interface TDocSource {
  competition_id: number | null;
  competition_name: string | null;
  documents: string[];
}
export interface TRequiredDocs {
  documents: string[];
  sources: TDocSource[];
}

export interface TCategory {
  id: number;
  label: string;
  required_files: number;
  required_documents: string[];
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
  user_username: string | null;
  /** Whichever of username/email this organizer signs in with. */
  user_login: string | null;
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
  /** Papers every player entered in this competition must upload. */
  required_documents: string[];
  // ── the public info page ──
  /** The long "about this competition" text: format, rules, fees, how to enter. */
  info: string | null;
  organizer_name: string | null;
  contact_phone: string | null;
  /** Digits only, international form — see whatsappLink(). */
  whatsapp_number: string | null;
  whatsapp_group_url: string | null;
  facebook_url: string | null;
  location_url: string | null;
  registration_open: boolean;
  ages?: TCompAge[];
  admins?: TCompAdmin[];
}

/** A chat link for a competition's WhatsApp number, or null when it has none. */
export function whatsappLink(
  number: string | null | undefined,
  message?: string,
): string | null {
  const digits = (number ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${text}`;
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
  dob?: string | null;
  status: TApprovalStatus;
  rejection_reason: string | null;
  // Admin-panel only — the API omits these for public roster reads.
  files?: TPlayerFile[];
  required_documents?: string[];
  missing_documents?: string[];
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
  /** Null for site-wide news the super admin posts. */
  competition_id: number | null;
  competition_name: string | null;
  title: string;
  body: string | null;
  /** The cover — always the first entry of `images`. */
  image_path: string | null;
  images: string[];
  /** The date the item is about (what the editor set), not when it was saved. */
  date: string | null;
  is_published: boolean;
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
/** `login` is a username or an email — accounts may have either. */
export const tLogin = (login: string, password: string) =>
  send<{ token: string; user: TUser }>('POST', '/auth/login', { login, password });

export function tRegister(fd: {
  name: string; username: string; password: string; phone: string;
  email?: string; facebook_url?: string; training_place?: string; address?: string;
  description?: string; logo?: File | null;
}) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null && v !== '' && k !== 'logo') body.append(k, String(v)); });
  if (fd.logo) body.append('logo', fd.logo);
  return fetch(`${T_BASE}/auth/register`, { method: 'POST', body }).then(
    r => parse<{ message: string; token: string; user: TUser; academy: TAcademy }>(r),
  );
}

export const tMe = (token: string) => get<TMeResponse>('/auth/me', token).catch(() => null);

/** Change your own username / email / password. */
export const tUpdateCredentials = (
  token: string,
  b: { username?: string; email?: string; password?: string },
) => send<TUser>('PUT', '/auth/credentials', b, token);

/** Upload one image and get back the path to put in a gallery. */
export function tUploadImage(token: string, file: File) {
  const body = new FormData();
  body.append('image', file);
  return sendForm<{ path: string; url: string }>('POST', '/uploads/image', body, token)
    .then(r => r.path);
}

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
/** Put a suspended academy back on the site. (Nothing waits for approval.) */
export const tRestoreAcademy = (token: string, id: number) =>
  send<TAcademy>('POST', `/academies/${id}/approve`, undefined, token);
export const tSuspendAcademy = (token: string, id: number, reason?: string) =>
  send<TAcademy>('POST', `/academies/${id}/suspend`, { reason }, token);
/** Super admin creates or resets the academy owner's login. */
export const tSetAcademyAccount = (
  token: string, id: number, b: { username: string; password: string },
) => send<{ message: string; username: string }>('POST', `/academies/${id}/account`, b, token);

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
/** The labelled paper slots to show for this team's players. */
export const tTeamRequiredDocs = (teamId: number) =>
  get<TRequiredDocs>(`/teams/${teamId}/required-documents`);
/** Create or reset the team manager's login (a username + password). */
export const tSetTeamAccount = (token: string, teamId: number, b: { username: string; password: string }) =>
  send<{ message: string; username: string; team_id: number }>('POST', `/teams/${teamId}/account`, b, token);
/** Whether the team already has a login, and under which username. */
export const tTeamAccount = (token: string, teamId: number) =>
  get<{ team_id: number; has_account: boolean; username: string | null }>(
    `/teams/${teamId}/account`, token,
  );

export interface TTeamCompEntry {
  entry_id: number;
  competition_id: number;
  competition_name: string | null;
  registration_open: boolean;
  max_players: number | null;
  player_count: number;
}
/** Competitions this team is registered in, with player quota — for the academy dashboard. */
export const tTeamCompetitionEntries = (token: string, teamId: number) =>
  get<TTeamCompEntry[]>(`/teams/${teamId}/competition-entries`, token);

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
/** Pass the token to get the player's papers back (admins/owners only). */
export const tPlayer = (id: number, token?: string | null) =>
  get<TPlayer>(`/players/${id}`, token);
/** The player's competition requests — with the rejection reason for owners. */
export const tPlayerRegistrations = (id: number, token?: string | null) =>
  get<TPlayerRegistration[]>(`/players/${id}/registrations`, token);

/** A registration paper paired with the document type it fulfils. */
export interface LabeledDoc { label: string; file: File }

function playerBody(fd: Record<string, string | number | undefined>, photo?: File | null, documents?: LabeledDoc[]) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null && v !== '') body.append(k, String(v)); });
  if (photo) body.append('photo', photo);
  (documents ?? []).forEach(d => { body.append('documents', d.file); body.append('document_labels', d.label); });
  return body;
}
export function tCreatePlayer(
  token: string, teamId: number, fd: Record<string, string | number | undefined>,
  photo?: File | null, documents?: LabeledDoc[],
) {
  return sendForm<TPlayer>('POST', `/teams/${teamId}/players`, playerBody(fd, photo, documents), token);
}
export function tUpdatePlayer(
  token: string, id: number, fd: Record<string, string | number | undefined>,
  photo?: File | null, documents?: LabeledDoc[],
) {
  return sendForm<TPlayer>('PUT', `/players/${id}`, playerBody(fd, photo, documents), token);
}
export const tMovePlayer = (token: string, id: number, b: Record<string, unknown>) =>
  send<TPlayer>('POST', `/players/${id}/move`, b, token);
export const tDeletePlayer = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/players/${id}`, undefined, token);
export const tDeletePlayerFile = (token: string, playerId: number, fileId: number) =>
  send<{ message: string }>('DELETE', `/players/${playerId}/files/${fileId}`, undefined, token);

// ── competitions ────────────────────────────────────────────────────────────
/** Pass a super admin's token to get each competition's organizers back too. */
export const tCompetitions = (seasonId?: number, token?: string | null) =>
  get<TCompetition[]>(`/competitions${qs({ season_id: seasonId })}`, token);
export const tCompetition = (id: number) => get<TCompetition>(`/competitions/${id}`);
/** `documents` is the competition's required player papers — one entry per
 *  paper, in the order the organiser listed them. */
function compBody(
  fd: Record<string, string | number | undefined>,
  logo?: File | null, documents?: string[], keepEmpty = false,
) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null && (keepEmpty || v !== '')) body.append(k, String(v)); });
  if (logo) body.append('logo', logo);
  // An empty entry still marks the field as sent, which resets the competition
  // to the default paper list rather than leaving the old one in place.
  if (documents) (documents.length ? documents : ['']).forEach(d => body.append('required_documents', d));
  return body;
}
export function tCreateCompetition(
  token: string, fd: Record<string, string | number | undefined>,
  logo?: File | null, documents?: string[],
) {
  return sendForm<TCompetition>('POST', '/competitions', compBody(fd, logo, documents), token);
}
export function tUpdateCompetition(
  token: string, id: number, fd: Record<string, string | number | undefined>,
  logo?: File | null, documents?: string[],
) {
  return sendForm<TCompetition>('PUT', `/competitions/${id}`, compBody(fd, logo, documents, true), token);
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
/** Pass the token as a competition admin to get each player's papers back. */
export const tCompTeams = (compId: number, ageId?: number, withRoster = false, token?: string | null) =>
  get<TCompTeam[]>(
    `/competitions/${compId}/teams${qs({ age_category_id: ageId, roster: withRoster ? 1 : undefined })}`,
    token,
  );
export const tRegisterTeam = (token: string, compId: number, teamId: number) =>
  send<TCompTeam>('POST', `/competitions/${compId}/teams`, { team_id: teamId }, token);
export const tUnregisterTeam = (token: string, entryId: number) =>
  send<{ message: string }>('DELETE', `/competition-teams/${entryId}`, undefined, token);
export const tRoster = (entryId: number, token?: string | null) =>
  get<TCompTeam>(`/competition-teams/${entryId}/roster`, token);
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
  /** A date window, for the home feed's page-outwards-from-today browsing. */
  from?: string; to?: string; order?: 'asc'; limit?: number;
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
/** Published news. An editor passes their token with `drafts` to see their own
 *  unpublished items too; `scope: 'site'` narrows to site-wide news. */
export const tNews = (
  opts: { competition_id?: number; limit?: number; scope?: 'site'; drafts?: boolean } = {},
  token?: string | null,
) =>
  get<TNews[]>(
    `/news${qs({
      competition_id: opts.competition_id,
      limit: opts.limit,
      scope: opts.scope,
      drafts: opts.drafts ? 1 : undefined,
    })}`,
    token,
  );
export const tNewsItem = (id: number, token?: string | null) =>
  get<TNews>(`/news/${id}`, token);

/** What a news form submits. `images` are paths/URLs already uploaded (see
 *  tUploadImage), cover first — sending it replaces the whole gallery. */
export interface TNewsInput {
  title: string;
  body?: string;
  date?: string;
  is_published?: boolean;
  images?: string[];
}
function newsBody(fd: TNewsInput) {
  const body = new FormData();
  body.append('title', fd.title);
  body.append('body', fd.body ?? '');
  if (fd.date) body.append('date', fd.date);
  body.append('is_published', fd.is_published === false ? 'false' : 'true');
  // An empty entry still marks the gallery as sent, which is how the last
  // image gets removed rather than silently kept.
  if (fd.images) (fd.images.length ? fd.images : ['']).forEach(i => body.append('images', i));
  return body;
}
/** Competition news (competition admins), or site-wide news when compId is null
 *  (super admin only). */
export function tCreateNews(token: string, compId: number | null, fd: TNewsInput) {
  const path = compId == null ? '/news' : `/competitions/${compId}/news`;
  return sendForm<TNews>('POST', path, newsBody(fd), token);
}
export const tUpdateNews = (token: string, id: number, fd: TNewsInput) =>
  sendForm<TNews>('PUT', `/news/${id}`, newsBody(fd), token);
export const tDeleteNews = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/news/${id}`, undefined, token);
export const tHome = () => get<THome>('/home');
