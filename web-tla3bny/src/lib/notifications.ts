'use client';
// Web push for tla3bny via Firebase Cloud Messaging.
//
// The backend broadcasts to tla3bny-namespaced FCM topics (t3_news, t3_comp_<id>).
// A browser has no client-side topic API, so it registers here, hands its FCM
// token to the server (/api/tla3bny/push/*), and the server subscribes it.
//
// Firebase is imported dynamically inside the functions (never at module top),
// because this file is pulled into a client component and the static export
// prerenders those in Node — where firebase/messaging touches browser globals.
// Only the erased `type` import is static.
import type { Messaging } from 'firebase/messaging';
import { T_BASE } from '@/lib/tla3bnyApi';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

const SW_URL = '/firebase-messaging-sw.js';
const SW_SCOPE = '/firebase-cloud-messaging-push-scope';

// Followed competitions live in localStorage (no accounts). The device is
// subscribed to each one's FCM topic server-side; this list re-subscribes after
// a token rotation and drives the follow button's on/off state.
const LS_FOLLOWS = 'tla3bnyFollowedCompetitions';

export type NotifState = 'unsupported' | 'default' | 'granted' | 'denied' | 'opted_out';

// User can turn notifications off in-app without revoking browser permission.
// We delete the FCM token so messages stop arriving, and store this flag so
// initNotifications skips re-subscription on the next page load.
const LS_OPT_OUT = 'tla3bnyNotifOptOut';

let messaging: Messaging | null = null;

export function followedCompetitions(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(LS_FOLLOWS) || '[]'); }
  catch { return []; }
}

export function isFollowing(cid: string | number): boolean {
  return followedCompetitions().includes(String(cid));
}

function setFollowed(ids: string[]): void {
  localStorage.setItem(LS_FOLLOWS, JSON.stringify([...new Set(ids)]));
}

// Followed teams — same device-local model as competitions, its own topic per team.
const LS_TEAM_FOLLOWS = 'tla3bnyFollowedTeams';

export function followedTeams(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(LS_TEAM_FOLLOWS) || '[]'); }
  catch { return []; }
}

export function isFollowingTeam(tid: string | number): boolean {
  return followedTeams().includes(String(tid));
}

function setFollowedTeams(ids: string[]): void {
  localStorage.setItem(LS_TEAM_FOLLOWS, JSON.stringify([...new Set(ids)]));
}

// Followed players — a parent follows their child to be pinged when they score.
const LS_PLAYER_FOLLOWS = 'tla3bnyFollowedPlayers';

export function followedPlayers(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(LS_PLAYER_FOLLOWS) || '[]'); }
  catch { return []; }
}

export function isFollowingPlayer(pid: string | number): boolean {
  return followedPlayers().includes(String(pid));
}

function setFollowedPlayers(ids: string[]): void {
  localStorage.setItem(LS_PLAYER_FOLLOWS, JSON.stringify([...new Set(ids)]));
}

export function notifState(): NotifState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' && localStorage.getItem(LS_OPT_OUT) === 'true') return 'opted_out';
  return Notification.permission as NotifState;
}

async function supported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!firebaseConfig.apiKey || !VAPID_KEY) return false;
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return false;
  const { isSupported } = await import('firebase/messaging');
  return isSupported().catch(() => false);
}

async function getReg(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  return existing ?? navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
}

async function ready(): Promise<Messaging | null> {
  if (!(await supported())) return null;
  if (!messaging) {
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getMessaging, onMessage } = await import('firebase/messaging');
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    messaging = getMessaging(app);
    // Foreground: onBackgroundMessage doesn't fire while focused, so draw it here.
    onMessage(messaging, async (payload) => {
      try {
        const reg = await getReg();
        const d = payload.data || {};
        reg.showNotification(d.title || 'تلاعبني', {
          body: d.body || '',
          icon: '/icon.png',
          badge: '/icon.png',
          dir: 'rtl',
          lang: 'ar',
          tag: `${d.type || 'msg'}:${d.id || d.url || d.title || ''}`,
          data: { url: d.url || '/' },
        });
      } catch { /* a failed toast must never break the page */ }
    });
  }
  return messaging;
}

async function currentToken(m: Messaging): Promise<string | null> {
  const { getToken } = await import('firebase/messaging');
  const reg = await getReg();
  return getToken(m, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg }).catch(() => null);
}

async function postJson(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${T_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch { return false; }
}

function hasFavourites(): boolean {
  return followedCompetitions().length > 0
    || followedTeams().length > 0
    || followedPlayers().length > 0;
}

/**
 * Join the all-competitions results broadcast only while the device follows no
 * competition/team/player, so every round still reaches new users; drop it the
 * moment they follow their first one, after which only followed topics deliver.
 * Mirrors the youthscores app + backend TLA3BNY_TOPIC_RESULTS. Best-effort.
 */
async function syncResultsBroadcast(token: string): Promise<void> {
  await postJson('/push/results-broadcast', { token, subscribe: !hasFavourites() });
}

/** On load, if already granted: refresh token, rejoin news, re-assert follows. */
export async function initNotifications(): Promise<void> {
  if (notifState() !== 'granted') return; // 'opted_out' also skips — user chose off
  const m = await ready();
  if (!m) return;
  const token = await currentToken(m);
  if (!token) return;
  await postJson('/push/subscribe', { token });
  await Promise.all([
    ...followedCompetitions().map(cid => postJson('/push/follow', { token, competition_id: Number(cid) })),
    ...followedTeams().map(tid => postJson('/push/follow-team', { token, team_id: Number(tid) })),
    ...followedPlayers().map(pid => postJson('/push/follow-player', { token, player_id: Number(pid) })),
  ]);
  await syncResultsBroadcast(token);
}

/** From a user click: prompt (or re-enable after opt-out), join the news topic. */
export async function enableNotifications(): Promise<NotifState> {
  localStorage.removeItem(LS_OPT_OUT);
  const m = await ready();
  if (!m) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm as NotifState;
  const token = await currentToken(m);
  if (token) {
    await postJson('/push/subscribe', { token });
    await syncResultsBroadcast(token);
  }
  return 'granted';
}

/** From a user click: stop push without revoking browser permission.
 *  Deletes the FCM token so messages stop arriving; sets the opt-out flag so
 *  initNotifications skips re-subscription on the next load. */
export async function disableNotifications(): Promise<NotifState> {
  localStorage.setItem(LS_OPT_OUT, 'true');
  if (messaging) {
    const { deleteToken } = await import('firebase/messaging');
    await deleteToken(messaging).catch(() => {});
  }
  return 'opted_out';
}

/** Follow a competition: prompt if needed, subscribe, remember locally. */
export async function followCompetition(cid: string | number): Promise<NotifState> {
  const m = await ready();
  if (!m) return 'unsupported';
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return perm as NotifState;
  }
  // Record the follow the instant permission is granted — the device's source of
  // truth and what turns the star gold. The server calls are best-effort and
  // re-asserted on load, so a flaky network never loses the choice.
  setFollowed([...followedCompetitions(), String(cid)]);
  const token = await currentToken(m);
  if (token) {
    await postJson('/push/subscribe', { token });
    await postJson('/push/follow', { token, competition_id: Number(cid) });
    await syncResultsBroadcast(token); // now has a favourite → leave the broadcast
  }
  return 'granted';
}

/**
 * After login, subscribe the device to the account's private topics (academy /
 * competition-admin) — the server derives them from the bearer token. No-op
 * unless push is already granted; the account holder enables it via the bell.
 */
export async function subscribeAccount(bearer: string): Promise<void> {
  if (!bearer || notifState() !== 'granted') return;
  const m = await ready();
  if (!m) return;
  const token = await currentToken(m);
  if (!token) return;
  try {
    await fetch(`${T_BASE}/push/subscribe-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ token }),
    });
  } catch { /* best-effort; retried next login/load */ }
}

/** Unfollow a competition: forget locally (optimistic) and unsubscribe. */
export async function unfollowCompetition(cid: string | number): Promise<void> {
  setFollowed(followedCompetitions().filter(id => id !== String(cid)));
  const m = await ready();
  if (!m) return;
  const token = await currentToken(m);
  if (token) {
    await postJson('/push/unfollow', { token, competition_id: Number(cid) });
    await syncResultsBroadcast(token); // rejoin the broadcast if no favourites remain
  }
}

/** Follow a team: prompt if needed, subscribe, remember locally. Mirrors
 *  followCompetition — a parent follows just their kid's team for its results. */
export async function followTeam(tid: string | number): Promise<NotifState> {
  const m = await ready();
  if (!m) return 'unsupported';
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return perm as NotifState;
  }
  setFollowedTeams([...followedTeams(), String(tid)]);
  const token = await currentToken(m);
  if (token) {
    await postJson('/push/subscribe', { token });
    await postJson('/push/follow-team', { token, team_id: Number(tid) });
    await syncResultsBroadcast(token); // now has a favourite → leave the broadcast
  }
  return 'granted';
}

/** Unfollow a team: forget locally (optimistic) and unsubscribe. */
export async function unfollowTeam(tid: string | number): Promise<void> {
  setFollowedTeams(followedTeams().filter(id => id !== String(tid)));
  const m = await ready();
  if (!m) return;
  const token = await currentToken(m);
  if (token) {
    await postJson('/push/unfollow-team', { token, team_id: Number(tid) });
    await syncResultsBroadcast(token); // rejoin the broadcast if no favourites remain
  }
}

/** Follow a player: pinged when they score. Mirrors followTeam. */
export async function followPlayer(pid: string | number): Promise<NotifState> {
  const m = await ready();
  if (!m) return 'unsupported';
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return perm as NotifState;
  }
  setFollowedPlayers([...followedPlayers(), String(pid)]);
  const token = await currentToken(m);
  if (token) {
    await postJson('/push/subscribe', { token });
    await postJson('/push/follow-player', { token, player_id: Number(pid) });
    await syncResultsBroadcast(token); // now has a favourite → leave the broadcast
  }
  return 'granted';
}

/** Unfollow a player: forget locally (optimistic) and unsubscribe. */
export async function unfollowPlayer(pid: string | number): Promise<void> {
  setFollowedPlayers(followedPlayers().filter(id => id !== String(pid)));
  const m = await ready();
  if (!m) return;
  const token = await currentToken(m);
  if (token) {
    await postJson('/push/unfollow-player', { token, player_id: Number(pid) });
    await syncResultsBroadcast(token); // rejoin the broadcast if no favourites remain
  }
}
