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
export type TMatchStatus = 'scheduled' | 'live' | 'completed' | 'postponed' | 'cancelled' | 'finished';
export type TStageType = 'group' | 'league' | 'knockout';
export type TEventType =
  | 'goal' | 'assist' | 'yellow' | 'second_yellow' | 'red' | 'substitution_in' | 'substitution_out'
  | 'penalty_scored' | 'penalty_missed';

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
  photo_path: string | null;
  sort_order: number;
}

export interface TBranch {
  id: number;
  academy_id: number;
  name: string;
  governorate: string | null;
  address: string | null;
  location_url: string | null;
  phone: string | null;
  sort_order: number;
}

export interface TAcademy {
  id: number;
  name: string;
  name_en: string | null;
  logo_path: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  facebook_url: string | null;
  training_place: string | null;
  address: string | null;
  description: string | null;
  /** Up to 3 gallery photos (paths/URLs) for the advertising page. */
  photos: string[];
  status: TAcademyStatus;
  rejection_reason?: string | null;
  managers: TManager[];
  branches: TBranch[];
  teams?: TTeam[];
  created_at?: string;
}

export interface TCoach {
  id: number;
  team_id: number;
  name: string;
  name_en: string | null;
  role_ar: string | null;
  license: string | null;
  bio: string | null;
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
  player_name_en: string | null;
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
  academy_name_en: string | null;
  academy_logo: string | null;
  age_category_id: number;
  age_category: string | null;
  oldest_birth_year: number | null;
  class_label: string | null;
  name: string | null;
  name_en: string | null;
  photo_path: string | null;
  description: string | null;
  display_name: string;
  display_name_en: string;
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
  name_en: string | null;
  dob: string | null;
  position: string | null;
  sub_position: string | null;
  photo_path: string | null;
  current_team_id: number | null;
  current_academy_id: number | null;
  jersey_number: number | null;
  // National ID (الرقم القومي) — PII, present only for callers the API lets see
  // the private shape (owning academy/team login, or a competition admin).
  national_id?: string | null;
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
  label_ar: string | null;
  label_en: string | null;
  oldest_birth_year: number | null;
  required_files: number;
  required_documents: string[];
  sort_order: number;
}

export interface TSeason {
  id: number;
  name: string;
  name_ar: string | null;
  name_en: string | null;
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
  oldest_birth_year: number | null;
  name: string | null;
  /** Public "about this sub-competition" text, shown to everyone. */
  description: string | null;
  /** Who runs this specific sub-competition (public). */
  organizer_name: string | null;
  organizer_photo_path: string | null;
  /** The pitch size for this age bracket, free text (public). */
  field_size: string | null;
  /** Per-team entry fee (EGP). Present ONLY when the viewer is an academy or a
   *  competition admin — omitted for the public, so `undefined` means "not
   *  allowed to see" while `null` means "no fee set". */
  subscription_fee?: number | null;
  player_registration_deadline: string | null;
  required_documents: string[];
  max_players_per_team: number;
  lineup_size: number;
  players_on_pitch: number;
  max_substitutes: number;
  num_periods: number;
  period_minutes: number;
  /** Extra-time format for knockout ties; null = no extra time (straight to pens). */
  et_num_periods: number | null;
  et_period_minutes: number | null;
  lineup_deadline_minutes: number;
  replacements_open: boolean;
  max_replacements: number;
  formation_required: boolean;
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
  /** A competition super admin (owner): holds all permissions, removable only by
   *  the site super admin. */
  is_owner: boolean;
  /** May this organizer remove punishments? (Granting a punishment is open to all.) */
  can_remove_punishments: boolean;
  /** May this organizer use the academy/team chat? */
  can_chat: boolean;
}

export interface TCompetition {
  id: number;
  season_id: number;
  season_name: string | null;
  /** The competition series' edition number (الموسم), typed by the organizer. */
  season_number: number | null;
  name: string;
  name_en: string | null;
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
  /** Photo of the competition's organizer, shown on the public info page. */
  organizer_photo_path: string | null;
  contact_phone: string | null;
  /** Digits only, international form — see whatsappLink(). */
  whatsapp_number: string | null;
  whatsapp_group_url: string | null;
  facebook_url: string | null;
  location_url: string | null;
  registration_open: boolean;
  /** Cap on total contributing players across the whole competition, set by the
   *  super admin — tla3bny is priced by this count. null means uncapped. */
  max_players: number | null;
  /** Super-admin sponsor-ad controls: how many ads the competition admin may run,
   *  and the master on/off switch that hides them all when off. */
  max_ads: number;
  ads_enabled: boolean;
  ages?: TCompAge[];
  admins?: TCompAdmin[];
}

/** A sponsor advertisement: a poster plus whichever contact buttons are set. */
export interface TAd {
  id: number;
  competition_id: number | null;
  competition_name: string | null;
  sponsor_name: string | null;
  caption: string | null;
  poster_path: string;
  whatsapp_number: string | null;
  phone: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  website_url: string | null;
  location_url: string | null;
  /** Last day the ad shows (YYYY-MM-DD), or null to never expire. */
  expires_at: string | null;
  is_active: boolean;
  sort_order: number;
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
  player_name_en?: string | null;
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

/** A player eligible to appear in a match lineup — either an approved
 *  competition player (guest=false) or a younger guest from the same academy. */
export interface TEligiblePlayer {
  player_id: number;
  player_name: string | null;
  photo_path: string | null;
  position: string | null;
  dob: string | null;
  guest: boolean;
  guest_team: string | null;
  /** Hard-blocked by an active punishment (match ban / disqualification). */
  banned?: boolean;
  banned_reason?: string | null;
}

export interface TCompTeam {
  id: number;
  competition_id: number;
  competition_name: string | null;
  team_id: number;
  team_name: string | null;
  team_name_en: string | null;
  academy_id: number | null;
  academy_name: string | null;
  academy_name_en: string | null;
  academy_logo: string | null;
  age_category_id: number;
  competition_age_id: number | null;
  sub_competition_name: string | null;
  status: string;
  point_deduction: number;
  roster?: TCompPlayer[];
}

export interface TJoinableCompetition {
  competition_age_id: number;
  competition_id: number;
  competition_name: string | null;
  registration_open: boolean;
  sub_competition_name: string | null;
  age_category: string | null;
  player_registration_deadline: string | null;
}

export interface TRules {
  players_on_pitch: number;
  lineup_size: number;
  max_substitutes: number;
  num_periods: number;
  period_minutes: number;
  et_num_periods?: number | null;
  et_period_minutes?: number | null;
  lineup_deadline_minutes: number;
  max_players_per_team: number;
  oldest_birth_year: number | null;
  formation_required: boolean;
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
  /** True when the event happened during extra time. */
  is_extra_time: boolean;
  /** True for own goals (team_id is the benefiting team). */
  is_own_goal: boolean;
  /** True when the goal was scored from the penalty spot during play (not shootout). */
  is_penalty: boolean;
  /** Position in the penalty shootout sequence (penalty_scored / penalty_missed only). */
  kick_order: number | null;
  /** True for the kick that decided the shootout. */
  is_winning_kick: boolean;
}

export interface TMatch {
  id: number;
  competition_id: number;
  competition_name: string | null;
  age_category_id: number;
  age_category: string | null;
  competition_age_id: number | null;
  stage_id: number | null;
  stage_name: string | null;
  stage_type: TStageType | null;
  group_id: number | null;
  group_name: string | null;
  home_team_id: number;
  away_team_id: number;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_name_en: string | null;
  away_team_name_en: string | null;
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
  /** Cumulative score after extra time (null if no ET was played). */
  home_score_et: number | null;
  away_score_et: number | null;
  /** Penalty-shootout score (null if no shootout). */
  home_score_pen: number | null;
  away_score_pen: number | null;
  note: string | null;
  /** The organizer's player of the match, shown on the card and detail. */
  player_of_match?: { player_id: number; player_name: string | null; player_name_en: string | null; photo_path: string | null } | null;
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
  player_name_en: string | null;
  /** Full DOB (YYYY-MM-DD); cards show the year of birth from it. */
  player_dob: string | null;
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
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      // Token rejected (expired/revoked, e.g. after a password change) — drop it
      // and signal the auth provider to reset to logged-out instead of retrying
      // with a dead token.
      localStorage.removeItem('tla3bny_token');
      window.dispatchEvent(new Event('tla3bny-session-expired'));
    }
    throw new Error((data as { error?: string }).error || `خطأ (${res.status})`);
  }
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
  name: string; name_en?: string; username: string; password: string; phone: string;
  email?: string; facebook_url?: string; whatsapp_number?: string; training_place?: string;
  address?: string; description?: string; logo?: File | null;
}) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null && v !== '' && k !== 'logo') body.append(k, String(v)); });
  if (fd.logo) body.append('logo', fd.logo);
  return fetch(`${T_BASE}/auth/register`, { method: 'POST', body }).then(
    r => parse<{ message: string; token: string; user: TUser; academy: TAcademy }>(r),
  );
}

export const tMe = (token: string) => get<TMeResponse>('/auth/me', token).catch(() => null);

/** Change your own username / email / password. Returns the updated user plus,
 *  when the password changed, a fresh token (the old one is now invalidated). */
export const tUpdateCredentials = (
  token: string,
  b: { username?: string; email?: string; password?: string },
) => send<{ user: TUser; token?: string }>('PUT', '/auth/credentials', b, token);

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

export function tUpdateAcademy(
  token: string, fd: Record<string, string | undefined>, logo?: File | null, photos?: string[],
) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null) body.append(k, v); });
  if (logo) body.append('logo', logo);
  // Sending photos (even empty) replaces the gallery; empty marker clears it.
  if (photos) (photos.length ? photos : ['']).forEach(p => body.append('photos', p));
  return sendForm<TAcademy>('PUT', '/academies/me', body, token);
}
export const tAddManager = (token: string, academyId: number, b: Record<string, unknown>) =>
  send<TManager>('POST', `/academies/${academyId}/managers`, b, token);
export const tUpdateManager = (token: string, academyId: number, id: number, b: Record<string, unknown>) =>
  send<TManager>('PUT', `/academies/${academyId}/managers/${id}`, b, token);
export const tDeleteManager = (token: string, academyId: number, id: number) =>
  send<{ message: string }>('DELETE', `/academies/${academyId}/managers/${id}`, undefined, token);
// ── academy branches (locations) ──────────────────────────────────────────────
export const tAddBranch = (token: string, academyId: number, b: Record<string, unknown>) =>
  send<TBranch>('POST', `/academies/${academyId}/branches`, b, token);
export const tUpdateBranch = (token: string, academyId: number, id: number, b: Record<string, unknown>) =>
  send<TBranch>('PUT', `/academies/${academyId}/branches/${id}`, b, token);
export const tDeleteBranch = (token: string, academyId: number, id: number) =>
  send<{ message: string }>('DELETE', `/academies/${academyId}/branches/${id}`, undefined, token);

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

export interface TApprovedPlayer {
  competition_player_id: number;
  player_id: number;
  player_name: string | null;
  position: string | null;
}

export interface TTeamCompEntry {
  entry_id: number;
  competition_id: number;
  competition_name: string | null;
  competition_age_id: number | null;
  sub_competition_name: string | null;
  status: string;
  registration_open: boolean;
  /** Past the deadline the academy can no longer add/edit players (organizer can). */
  registration_deadline_passed: boolean;
  max_players: number | null;
  player_count: number;
  replacements_open: boolean;
  max_replacements: number;
  replacement_count: number;
  /** Populated only when replacements_open is true. */
  approved_players: TApprovedPlayer[];
  rejected_players: { player_id: number; player_name: string | null; rejection_reason: string | null }[];
  /** Players still awaiting the organizer's approval (newly added or edited). */
  pending_players: { player_id: number; player_name: string | null }[];
}
/** Competitions this team is registered in (active + pending), with player quota — for the academy dashboard. */
export const tTeamCompetitionEntries = (token: string, teamId: number) =>
  get<TTeamCompEntry[]>(`/teams/${teamId}/competition-entries`, token);
/** Sub-competitions the team can request to join (registration open, matching age). */
export const tJoinableCompetitions = (token: string, teamId: number) =>
  get<TJoinableCompetition[]>(`/teams/${teamId}/joinable-competitions`, token);
/** Academy requests to join a sub-competition. */
export const tRequestJoin = (token: string, teamId: number, competitionAgeId: number) =>
  send<TCompTeam>('POST', `/teams/${teamId}/request-join`, { competition_age_id: competitionAgeId }, token);
/** Competition admin approves a pending team join request. */
export const tApproveTeamJoin = (token: string, entryId: number) =>
  send<TCompTeam>('POST', `/competition-teams/${entryId}/approve`, undefined, token);
/** Competition admin rejects a pending team join request. */
export const tRejectTeamJoin = (token: string, entryId: number) =>
  send<{ message: string }>('POST', `/competition-teams/${entryId}/reject`, undefined, token);

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
/** Public coach profile: the coach plus the team (and academy) they're on. */
export interface TCoachDetail extends TCoach { team: TTeam | null }
export const tCoach = (id: number) => get<TCoachDetail>(`/coaches/${id}`);

// ── players ─────────────────────────────────────────────────────────────────
/** Pass the token to get the player's papers back (admins/owners only). */
export const tPlayer = (id: number, token?: string | null) =>
  get<TPlayer>(`/players/${id}`, token);
/** The player's competition requests — with the rejection reason for owners. */
export const tPlayerRegistrations = (id: number, token?: string | null) =>
  get<TPlayerRegistration[]>(`/players/${id}/registrations`, token);

export interface TPlayerStatTotals {
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  appearances: number;
}
export interface TPlayerStatRow extends TPlayerStatTotals {
  competition_id: number;
  competition_name: string | null;
  season_name: string | null;
}
export interface TPlayerStats {
  player_id: number;
  totals: TPlayerStatTotals;
  by_competition: TPlayerStatRow[];
}
/** Career stats (goals, assists, yellow/red cards, appearances) — public endpoint. */
export const tPlayerStats = (id: number) =>
  get<TPlayerStats>(`/players/${id}/stats`);

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
/** Pass a token to receive fields limited to academies/admins (subscription
 *  fees on each sub-competition). Anonymous callers get the public shape. */
export const tCompetition = (id: number, token?: string | null) =>
  get<TCompetition>(`/competitions/${id}`, token);
/** `documents` is the competition's required player papers — one entry per
 *  paper, in the order the organiser listed them. */
function compBody(
  fd: Record<string, string | number | undefined>,
  logo?: File | null, documents?: string[], keepEmpty = false, organizerPhoto?: File | null,
) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null && (keepEmpty || v !== '')) body.append(k, String(v)); });
  if (logo) body.append('logo', logo);
  if (organizerPhoto) body.append('organizer_photo', organizerPhoto);
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
  logo?: File | null, documents?: string[], organizerPhoto?: File | null,
) {
  return sendForm<TCompetition>('PUT', `/competitions/${id}`, compBody(fd, logo, documents, true, organizerPhoto), token);
}
export const tDeleteCompetition = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/competitions/${id}`, undefined, token);
export const tCloneCompetition = (token: string, id: number, seasonId: number) =>
  send<TCompetition>('POST', `/competitions/${id}/clone`, { season_id: seasonId }, token);
export const tAddCompAdmin = (token: string, compId: number, b: Record<string, unknown>) =>
  send<{ message: string; user: TUser }>('POST', `/competitions/${compId}/admins`, b, token);
export const tRemoveCompAdmin = (token: string, compId: number, userId: number) =>
  send<{ message: string }>('DELETE', `/competitions/${compId}/admins/${userId}`, undefined, token);
/** Set an organizer's ownership/permissions (is_owner is site-super-admin only). */
export const tSetCompAdminPerms = (token: string, compId: number, userId: number, b: { is_owner?: boolean; can_remove_punishments?: boolean; can_chat?: boolean }) =>
  send<TCompAdmin>('PUT', `/competitions/${compId}/admins/${userId}`, b, token);

// ── competition ages + rules ──────────────────────────────────────────────
export const tAddCompAge = (token: string, compId: number, b: Record<string, unknown>) =>
  send<TCompAge>('POST', `/competitions/${compId}/ages`, b, token);
export const tUpdateCompAge = (token: string, id: number, b: Record<string, unknown>) =>
  send<TCompAge>('PUT', `/competition-ages/${id}`, b, token);
export const tDeleteCompAge = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/competition-ages/${id}`, undefined, token);
/** Set/replace a sub-competition's organizer photo (multipart). Clear it via
 *  tUpdateCompAge with organizer_photo_path: ''. */
export function tSetCompAgeOrganizerPhoto(token: string, id: number, photo: File) {
  const body = new FormData();
  body.append('photo', photo);
  return sendForm<TCompAge>('POST', `/competition-ages/${id}/organizer-photo`, body, token);
}

// ── registration documents: export & cleanup ────────────────────────────────
export interface TDocDeleteResult {
  deleted_files: number;
  skipped_players: { player_id: number; player_name: string | null; reason: string }[];
  failed: string[];
  message?: string;
}

/** Fetch a protected file with the bearer token and save it via the browser.
 * A plain <a href> can't carry the Authorization header, so we stream the blob
 * and trigger the download ourselves. */
async function downloadAuthed(path: string, token: string, fallbackName: string): Promise<void> {
  const res = await fetch(`${T_BASE}${path}`, { headers: authHeaders(token), cache: 'no-store' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `خطأ (${res.status})`);
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Download one sub-competition's registration documents as a ZIP (finished only). */
export const tDownloadSubCompDocs = (token: string, cageId: number) =>
  downloadAuthed(`/competition-ages/${cageId}/documents/archive`, token, `sub_${cageId}_documents.zip`);
/** Delete one sub-competition's documents; shared players are skipped & reported. */
export const tDeleteSubCompDocs = (token: string, cageId: number) =>
  send<TDocDeleteResult>('DELETE', `/competition-ages/${cageId}/documents`, undefined, token);
/** Download every registration document in a competition as one ZIP (finished only). */
export const tDownloadCompDocs = (token: string, compId: number) =>
  downloadAuthed(`/competitions/${compId}/documents/archive`, token, `competition_${compId}_documents.zip`);
/** Final sweep: delete all remaining documents of a finished competition. */
export const tDeleteCompDocs = (token: string, compId: number) =>
  send<TDocDeleteResult>('DELETE', `/competitions/${compId}/documents`, undefined, token);

// ── stages + groups ─────────────────────────────────────────────────────────
export const tAddStage = (token: string, cageId: number, b: Record<string, unknown>) =>
  send<TStage>('POST', `/competition-ages/${cageId}/stages`, b, token);
export const tUpdateStage = (token: string, id: number, b: Record<string, unknown>) =>
  send<TStage>('PUT', `/stages/${id}`, b, token);
export const tDeleteStage = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/stages/${id}`, undefined, token);
export const tAddGroup = (token: string, stageId: number, b: Record<string, unknown>) =>
  send<TGroup>('POST', `/stages/${stageId}/groups`, b, token);
export const tUpdateGroup = (token: string, id: number, b: { name: string }) =>
  send<TGroup>('PUT', `/groups/${id}`, b, token);
export const tDeleteGroup = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/groups/${id}`, undefined, token);
export const tAddGroupTeam = (token: string, groupId: number, teamId: number) =>
  send<TGroup>('POST', `/groups/${groupId}/teams`, { team_id: teamId }, token);
export const tRemoveGroupTeam = (token: string, groupId: number, teamId: number) =>
  send<{ message: string }>('DELETE', `/groups/${groupId}/teams/${teamId}`, undefined, token);
/** Add a team directly to a knockout stage (no group required). */
export const tAddStageTeam = (token: string, stageId: number, teamId: number) =>
  send<{ team_id: number; group_id: number }>('POST', `/stages/${stageId}/teams`, { team_id: teamId }, token);
/** Remove a team from a knockout stage. */
export const tRemoveStageTeam = (token: string, stageId: number, teamId: number) =>
  send<{ message: string }>('DELETE', `/stages/${stageId}/teams/${teamId}`, undefined, token);

// ── registration + roster ─────────────────────────────────────────────────
/** Pass the token as a competition admin to get each player's papers back. */
export const tCompTeams = (compId: number, ageId?: number, withRoster = false, token?: string | null, cageId?: number) =>
  get<TCompTeam[]>(
    `/competitions/${compId}/teams${qs({ age_category_id: ageId, competition_age_id: cageId, roster: withRoster ? 1 : undefined })}`,
    token,
  );
export const tRegisterTeam = (token: string, compId: number, teamId: number, competitionAgeId?: number) =>
  send<TCompTeam>('POST', `/competitions/${compId}/teams`, { team_id: teamId, competition_age_id: competitionAgeId }, token);
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
/** Academy marks an approved player as replaced during the replacement window. */
export const tReplaceCompPlayer = (token: string, cpId: number) =>
  send<TCompPlayer>('POST', `/competition-players/${cpId}/replace`, undefined, token);

// ── per-competition player registration (with that competition's papers) ─────
/** One squad player as seen from a specific competition's registration screen. */
export interface TRegistrationPlayer {
  player_id: number;
  player_name: string | null;
  player_name_en: string | null;
  photo_path: string | null;
  position: string | null;
  dob: string | null;
  jersey_number: number | null;
  /** Null until the player is entered in *this* competition. */
  competition_player_id: number | null;
  registration_status: TApprovalStatus | 'replaced' | null;
  rejection_reason: string | null;
  /** Papers uploaded for *this* competition only. */
  files: TPlayerFile[];
  missing_documents: string[];
}
export interface TCompetitionRegistration {
  entry_id: number;
  competition_id: number;
  competition_name: string | null;
  sub_competition_name: string | null;
  status: string;
  required_documents: string[];
  max_players: number | null;
  registered_count: number;
  registration_open: boolean;
  replacements_open: boolean;
  players: TRegistrationPlayer[];
}
/** The academy's registration screen for one competition entry: the whole squad,
 *  who is entered here, and the papers this competition needs for each. */
export const tCompetitionRegistration = (token: string, entryId: number) =>
  get<TCompetitionRegistration>(`/competition-teams/${entryId}/registration`, token);

function docsBody(playerId: number | undefined, documents: LabeledDoc[]) {
  const body = new FormData();
  if (playerId != null) body.append('player_id', String(playerId));
  documents.forEach(d => { body.append('documents', d.file); body.append('document_labels', d.label); });
  return body;
}
/** Enter a squad player in this competition, with this competition's papers. */
export const tRegisterCompetitionPlayer = (
  token: string, entryId: number, playerId: number, documents: LabeledDoc[] = [],
) => sendForm<TCompPlayer>('POST', `/competition-teams/${entryId}/players`, docsBody(playerId, documents), token);
/** Add / refresh the papers on an existing registration (re-opens the review). */
export const tUploadRegistrationDocs = (
  token: string, cpId: number, documents: LabeledDoc[],
) => sendForm<TCompPlayer>('POST', `/competition-players/${cpId}/documents`, docsBody(undefined, documents), token);

// ── matches ─────────────────────────────────────────────────────────────────
export const tMatches = (params: {
  competition_id?: number; age_category_id?: number; competition_age_id?: number;
  stage_id?: number; group_id?: number; status?: string; team_id?: number; date?: string;
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
export const tEligibleLineupPlayers = (matchId: number, teamId: number) =>
  get<TEligiblePlayer[]>(`/lineups/match/${matchId}/team/${teamId}/eligible-players`);
export const tSaveLineup = (token: string, matchId: number, teamId: number, b: Record<string, unknown>) =>
  send<TLineup>('PUT', `/lineups/match/${matchId}/team/${teamId}`, b, token);

// ── fixture generation ───────────────────────────────────────────────────────
export interface TGenerateFixturesResult {
  created: number;
  matches: TMatch[];
}
export interface TGroupFixtureSetting {
  group_id: number;
  match_days?: number[];
  matches_per_day?: number;
  default_time?: string;
  default_venue?: string;
  time_interval_minutes?: number;
}
export const tGenerateFixtures = (
  token: string,
  stageId: number,
  body: {
    mode: 'round_robin' | 'double_round_robin' | 'knockout';
    start_date?: string;
    match_days?: number[];
    matches_per_day?: number;
    default_time?: string;
    default_venue?: string;
    time_interval_minutes?: number;
    force?: boolean;
    group_settings?: TGroupFixtureSetting[];
  },
) => send<TGenerateFixturesResult>('POST', `/stages/${stageId}/generate-fixtures`, body, token);

// ── standings / bracket / analysis ────────────────────────────────────────
export const tStandings = (compId: number, ageId: number, cageId?: number) =>
  get<TStandingGroup[]>(`/standings${qs({
    competition_id: compId,
    competition_age_id: cageId,
    age_category_id: cageId ? undefined : ageId,
  })}`);
export const tBracket = (compId: number, ageId: number) =>
  get<TBracketStage[]>(`/bracket${qs({ competition_id: compId, age_category_id: ageId })}`);
export const tAnalysis = (compId: number, ageId: number) =>
  get<TAnalysis>(`/analysis${qs({ competition_id: compId, age_category_id: ageId })}`);

// ── honours: titles, individual awards, team of the round ──────────────────
export type TAwardType =
  | 'champion' | 'runner_up' | 'third_place'
  | 'top_scorer' | 'top_assister' | 'best_player' | 'best_goalkeeper'
  | 'player_of_match' | 'player_of_round'
  | 'best_coach' | 'coach_of_round';
/** Team titles go to a team; coach awards to a coach; everything else to a player. */
export const TEAM_AWARD_TYPES: TAwardType[] = ['champion', 'runner_up', 'third_place'];
export const COACH_AWARD_TYPES: TAwardType[] = ['best_coach', 'coach_of_round'];

export interface TAward {
  id: number;
  competition_id: number;
  competition_name: string | null;
  competition_age_id: number | null;
  sub_competition_name: string | null;
  age_label: string | null;
  award_type: TAwardType;
  round: string | null;
  match_id: number | null;
  note: string | null;
  player_id: number | null;
  player_name: string | null;
  player_name_en: string | null;
  player_photo: string | null;
  team_id: number | null;
  team_name: string | null;
  team_logo: string | null;
  academy_id: number | null;
  // Coach awards (best_coach, coach_of_round) — recipient is a coach.
  coach_id: number | null;
  coach_name: string | null;
  coach_name_en: string | null;
  coach_photo: string | null;
  coach_team_id: number | null;
  coach_team_name: string | null;
}
export interface TTotrSlot {
  id: number;
  position_slot: string | null;
  sort_order: number;
  player_id: number | null;
  player_name: string | null;
  player_name_en: string | null;
  photo_path: string | null;
  team_id: number | null;
  team_name: string | null;
}
export interface TTeamOfRound {
  id: number;
  competition_id: number;
  competition_age_id: number | null;
  sub_competition_name: string | null;
  round: string;
  formation: string | null;
  slots: TTotrSlot[];
}
export interface TPlayerAchievements {
  individual_awards: TAward[];
  team_titles: TAward[];
  team_of_round: { competition_id: number; sub_competition_name: string | null; round: string; position_slot: string | null }[];
}
export interface TTeamHonours { titles: TAward[]; player_awards: TAward[] }

// public honours reads
export const tCompetitionAwards = (compId: number) =>
  get<TAward[]>(`/competitions/${compId}/awards`);
export const tPlayerAchievements = (playerId: number) =>
  get<TPlayerAchievements>(`/players/${playerId}/achievements`);
export const tTeamHonours = (teamId: number) =>
  get<TTeamHonours>(`/teams/${teamId}/honours`);
export const tAcademyHonours = (academyId: number) =>
  get<TAward[]>(`/academies/${academyId}/honours`);
export const tTeamOfRoundAll = (compId: number, cageId?: number) =>
  get<TTeamOfRound[]>(`/competitions/${compId}/team-of-round${qs({ competition_age_id: cageId })}`);
export const tTeamOfRound = (compId: number, round: string, cageId?: number) =>
  get<TTeamOfRound | null>(`/competitions/${compId}/team-of-round${qs({ competition_age_id: cageId, round })}`);

// admin: grant / revoke / suggest / round labels / team-of-round builder
export interface TAwardInput {
  award_type: TAwardType;
  competition_age_id?: number;
  round?: string;
  match_id?: number;
  player_id?: number;
  team_id?: number;
  coach_id?: number;
  note?: string;
}
export const tGrantAward = (token: string, compId: number, body: TAwardInput) =>
  send<TAward>('POST', `/competitions/${compId}/awards`, body, token);
/** Coaches of the teams in a competition — the pool for a coach award. */
export interface TCoachPool {
  id: number;
  name: string;
  name_en: string | null;
  photo_path: string | null;
  role_ar: string | null;
  team_id: number;
  team_name: string | null;
  team_name_en: string | null;
}
export const tCompetitionCoaches = (compId: number, cageId?: number, token?: string | null) =>
  get<TCoachPool[]>(`/competitions/${compId}/coaches${qs({ competition_age_id: cageId })}`, token);
export const tRevokeAward = (token: string, awardId: number) =>
  send<{ message: string }>('DELETE', `/awards/${awardId}`, undefined, token);
/** Set (playerId) or clear (null) the player of the match from its edit panel. */
export const tSetPlayerOfMatch = (token: string, matchId: number, playerId: number | null) =>
  send<TMatch>('PUT', `/matches/${matchId}/player-of-match`, { player_id: playerId }, token);
export interface TAwardSuggestions {
  players?: { player_id: number; player_name: string | null; photo_path: string | null; team_id: number | null; team_name: string | null; count?: number }[];
  teams?: { team_id: number; team_name: string | null; detail?: string }[];
}
export const tAwardSuggestions = (
  token: string, compId: number,
  params: { award_type: TAwardType; competition_age_id?: number; round?: string; match_id?: number },
) => get<TAwardSuggestions>(`/competitions/${compId}/awards/suggestions${qs(params)}`, token);
export const tCompetitionRounds = (compId: number, cageId?: number) =>
  get<string[]>(`/competitions/${compId}/rounds${qs({ competition_age_id: cageId })}`);
export interface TTotrInput {
  competition_age_id?: number;
  round: string;
  formation?: string;
  slots: { player_id: number; position_slot?: string; sort_order?: number }[];
}
export const tSaveTeamOfRound = (token: string, compId: number, body: TTotrInput) =>
  send<TTeamOfRound>('PUT', `/competitions/${compId}/team-of-round`, body, token);
export const tDeleteTeamOfRound = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/team-of-round/${id}`, undefined, token);

// ── punishments (العقوبات) ───────────────────────────────────────────────────
export type TPunishmentType = 'match_ban' | 'fine' | 'point_deduction' | 'disqualification';
export interface TPunishment {
  id: number;
  competition_id: number;
  competition_age_id: number | null;
  sub_competition_name: string | null;
  age_label: string | null;
  punishment_type: TPunishmentType;
  matches: number | null;
  points: number | null;
  /** Fines only, and only sent to an admin or the punished academy. */
  amount?: number | null;
  reason: string | null;
  player_id: number | null;
  player_name: string | null;
  player_name_en: string | null;
  player_photo: string | null;
  coach_id: number | null;
  coach_name: string | null;
  coach_name_en: string | null;
  coach_photo: string | null;
  team_id: number | null;
  team_name: string | null;
}
export interface TPunishmentInput {
  punishment_type: TPunishmentType;
  competition_age_id?: number;
  player_id?: number;
  coach_id?: number;
  team_id?: number;
  matches?: number;
  points?: number;
  amount?: number;
  reason?: string;
}
/** Fines are private: pass a token to get the ones you're allowed to see. */
export const tCompetitionPunishments = (compId: number, token?: string | null) =>
  get<TPunishment[]>(`/competitions/${compId}/punishments`, token);
/** A player's match bans / disqualifications across competitions (public). */
export interface TPlayerBan {
  id: number; competition_id: number; competition_name: string | null;
  punishment_type: 'match_ban' | 'disqualification';
  matches: number | null; reason: string | null;
}
export const tPlayerBans = (playerId: number) =>
  get<TPlayerBan[]>(`/players/${playerId}/bans`);
export const tCreatePunishment = (token: string, compId: number, body: TPunishmentInput) =>
  send<TPunishment>('POST', `/competitions/${compId}/punishments`, body, token);
export const tDeletePunishment = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/punishments/${id}`, undefined, token);

// ── chat (المحادثات) ─────────────────────────────────────────────────────────
export interface TConversation {
  id: number;
  competition_id: number;
  competition_name: string | null;
  team_id: number;
  team_name: string | null;
  team_name_en: string | null;
  academy_id: number | null;
  academy_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread: number;
}
export interface TChatMessage {
  id: number;
  conversation_id: number;
  sender_user_id: number | null;
  sender_side: 'academy' | 'organizer';
  sender_name: string | null;
  body: string;
  created_at: string | null;
}
export interface TChatThread {
  conversation_id: number | null;
  team_name: string | null;
  messages: TChatMessage[];
}
/** Organizer inbox: every team thread in a competition (chat-enabled organizers). */
export const tOrgConversations = (token: string, compId: number) =>
  get<TConversation[]>(`/competitions/${compId}/conversations`, token);
/** Academy/team side: the caller's team threads across competitions. */
export const tMyConversations = (token: string) =>
  get<TConversation[]>(`/my-conversations`, token);
/** The thread for (competition, team); fetching it marks it read for the caller. */
export const tChatThread = (token: string, compId: number, teamId: number) =>
  get<TChatThread>(`/competitions/${compId}/teams/${teamId}/messages`, token);
export const tSendMessage = (token: string, compId: number, teamId: number, body: string) =>
  send<TChatMessage>('POST', `/competitions/${compId}/teams/${teamId}/messages`, { body }, token);

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

// ── sponsor ads ──────────────────────────────────────────────────────────────
export interface TAdInput {
  sponsor_name?: string; caption?: string;
  whatsapp_number?: string; phone?: string;
  facebook_url?: string; instagram_url?: string; website_url?: string;
  location_url?: string; expires_at?: string;
  is_active?: boolean; sort_order?: number;
}
/** What a competition admin's ad panel gets back: the ads plus the super-admin
 *  gate (whether ads are enabled and how many are allowed). */
export interface TCompetitionAdsAdmin {
  ads: TAd[]; ads_enabled: boolean; max_ads: number; used: number;
}
function adBody(fd: TAdInput, poster?: File | null) {
  const body = new FormData();
  Object.entries(fd).forEach(([k, v]) => { if (v != null && v !== '') body.append(k, String(v)); });
  if (poster) body.append('poster', poster);
  return body;
}
/** How the sponsor carousels rotate and size their posters (shared, global). */
export interface TAdSettings { rotation_seconds: number; poster_scale: number }
export const tAdSettings = () => get<TAdSettings>('/ads/settings');
export const tUpdateAdSettings = (token: string, s: Partial<TAdSettings>) =>
  send<TAdSettings>('PUT', '/ads/settings', s, token);

/** Active home-screen ads (super admin's), shown on the home page. */
export const tHomeAds = () => get<TAd[]>('/ads/home');
/** The super admin's management view: every home ad, including hidden/expired. */
export const tHomeAdsAdmin = (token: string) => get<TAd[]>('/ads/home/all', token);
/** A competition's public ads (respects the super-admin on/off switch). */
export const tCompetitionAds = (compId: number) =>
  get<TAd[]>(`/competitions/${compId}/ads`);
/** The competition admin's view: all ads plus the gate state and allowance. */
export const tCompetitionAdsAdmin = (compId: number, token: string) =>
  get<TCompetitionAdsAdmin>(`/competitions/${compId}/ads`, token);
/** Ads to show on a player's profile (pooled from their competitions). */
export const tPlayerAds = (playerId: number) =>
  get<TAd[]>(`/players/${playerId}/ads`);
export const tCreateHomeAd = (token: string, fd: TAdInput, poster: File) =>
  sendForm<TAd>('POST', '/ads', adBody(fd, poster), token);
export const tCreateCompetitionAd = (token: string, compId: number, fd: TAdInput, poster: File) =>
  sendForm<TAd>('POST', `/competitions/${compId}/ads`, adBody(fd, poster), token);
export const tUpdateAd = (token: string, id: number, fd: TAdInput, poster?: File | null) =>
  sendForm<TAd>('PUT', `/ads/${id}`, adBody(fd, poster), token);
export const tDeleteAd = (token: string, id: number) =>
  send<{ message: string }>('DELETE', `/ads/${id}`, undefined, token);

// ── super-admin dashboard stats ──────────────────────────────────────────────
export interface TCompStat {
  id: number;
  name: string;
  name_en: string | null;
  season_name: string | null;
  status: TCompStatus;
  teams: number;
  total_matches: number;
  played_matches: number;
  pending_players: number;
  /** Approved players in this competition — counts against max_players. */
  approved_players: number;
  /** The priced participating-player cap, or null if none set. */
  max_players: number | null;
}
export interface TStats {
  counts: {
    seasons: number; competitions: number; age_categories: number;
    academies: number; teams: number; players: number;
    coaches: number; matches: number; goals: number; news: number;
  };
  matches: { total: number; played: number; remaining: number };
  averages: { goals_per_match: number; players_per_team: number };
  active_season: string | null;
  pending_approvals: number;
  competitions: TCompStat[];
}
export const tStats = (token: string) => get<TStats>('/stats', token);

// ── competition dashboard ─────────────────────────────────────────────────────
export interface TCompDashboard {
  counts: {
    teams: number;
    players_approved: number;
    players_pending: number;
    players_rejected: number;
    matches_total: number;
    matches_played: number;
    goals: number;
  };
  ages: {
    competition_age_id: number;
    age_category: string | null;
    name: string | null;
    teams: number;
    players_approved: number;
    players_pending: number;
    matches_total: number;
    matches_played: number;
  }[];
  pending_teams: { team_id: number; team_name: string | null; academy_name: string | null; pending: number }[];
}
export const tCompDashboard = (token: string, compId: number) =>
  get<TCompDashboard>(`/competitions/${compId}/dashboard`, token);

// ── global search ─────────────────────────────────────────────────────────────
export interface TSearchAcademy { id: number; name: string; name_en: string | null; logo_path: string | null }
export interface TSearchPlayer { id: number; name: string; name_en: string | null; position: string | null; photo_path: string | null }
export interface TSearchCoach { id: number; name: string; name_en: string | null; role_ar: string | null; photo_path: string | null; team_name: string | null }
export interface TSearchResults { academies: TSearchAcademy[]; players: TSearchPlayer[]; coaches: TSearchCoach[] }
/** Free-text search across academies, players and coaches (public). */
export const tSearch = (q: string) => get<TSearchResults>(`/search${qs({ q })}`);
