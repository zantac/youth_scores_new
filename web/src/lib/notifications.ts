'use client';
// Web push via Firebase Cloud Messaging.
//
// The backend broadcasts to FCM *topics* (news / venues / results). A browser
// has no client-side topic API, so it registers here, hands its FCM token to the
// server (POST /api/push/subscribe), and the server subscribes that token to the
// topics. From then on a topic broadcast reaches this device.
//
// Firebase is imported *dynamically* inside the functions below, never at module
// top level: this file is pulled into a client component, and the static export
// (`output: 'export'`) prerenders those in Node — where `firebase/messaging`
// touches browser globals and would crash the build. Deferring the import keeps
// it browser-only. Only the erased `type` import is static.
//
// FCM needs its own service worker, registered under a private scope so it never
// collides with the next-pwa (workbox) worker that owns "/". The public
// firebaseConfig is duplicated in public/firebase-messaging-sw.js — keep in sync.
import type { Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

// The backend origin, derived the same way the data layer does it: strip
// "/api/config" off the configured config URL (empty string -> same origin).
const CONFIG_URL = process.env.NEXT_PUBLIC_CONFIG_URL ?? '/api/config';
const API_ORIGIN = CONFIG_URL.replace(/\/api\/config\/?$/, '');

const SW_URL = '/firebase-messaging-sw.js';
const SW_SCOPE = '/firebase-cloud-messaging-push-scope';

// Followed competitions live in localStorage (no accounts). The device is
// subscribed to each one's FCM topic server-side; this list lets us re-subscribe
// after a token rotation and drive the follow button's on/off state.
const LS_FOLLOWS = 'followedCompetitions';
// Followed teams live in their own localStorage list, mirroring competitions.
const LS_FOLLOWS_TEAMS = 'followedTeams';

export type NotifState = 'unsupported' | 'default' | 'granted' | 'denied';

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

export function followedTeams(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(LS_FOLLOWS_TEAMS) || '[]'); }
  catch { return []; }
}

export function isFollowingTeam(tid: string | number): boolean {
  return followedTeams().includes(String(tid));
}

function setFollowedTeams(ids: string[]): void {
  localStorage.setItem(LS_FOLLOWS_TEAMS, JSON.stringify([...new Set(ids)]));
}

// An anonymous, per-install id so the admin can count how many devices follow
// each competition/team. Generated once and kept in localStorage; it is not an
// FCM token and carries no personal data. Reported to /api/follows on every
// follow/unfollow, independently of the FCM subscription (the native app does
// the same via its own SDK path), so the tally covers web and app alike.
const LS_DEVICE_ID = 'deviceId';
function deviceId(): string {
  let id = localStorage.getItem(LS_DEVICE_ID);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
    localStorage.setItem(LS_DEVICE_ID, id);
  }
  return id;
}

/** Best-effort: tell the server this device followed/unfollowed a competition
 *  (kind='comp') or team (kind='team'), for the admin's follower tally only. */
async function reportFollow(kind: 'comp' | 'team', id: string | number, subscribe: boolean): Promise<void> {
  await postJson('/api/follows', { device_id: deviceId(), kind, id: Number(id), subscribe });
}

/** Current permission, without touching Firebase. */
export function notifState(): NotifState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotifState;
}

/** True only when the browser can actually do web push and we have a key. */
async function supported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!firebaseConfig.apiKey || !VAPID_KEY) return false; // not configured
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
    // Foreground: onBackgroundMessage does NOT fire while the tab is focused,
    // so draw the notification ourselves. Messages are data-only (see the
    // backend note), so title/body/url come from payload.data.
    onMessage(messaging, async (payload) => {
      try {
        const reg = await getReg();
        const d = payload.data || {};
        reg.showNotification(d.title || 'Youth Scores', {
          body: d.body || '',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          dir: 'rtl',
          lang: 'ar',
          // Same tag as the SW so duplicate deliveries (multiple tabs, or SW +
          // foreground) collapse into one notification instead of stacking.
          tag: `${d.type || 'msg'}:${d.id || d.url || d.title || ''}`,
          data: { url: d.url || '/' },
        });
      } catch { /* a failed toast must never break the page */ }
    });
  }
  return messaging;
}

/** This device's current FCM registration token, or null. */
async function currentToken(m: Messaging): Promise<string | null> {
  const { getToken } = await import('firebase/messaging');
  const reg = await getReg();
  return getToken(m, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg }).catch(() => null);
}

async function postJson(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${API_ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch { return false; }
}

function hasFavourites(): boolean {
  return followedCompetitions().length > 0 || followedTeams().length > 0;
}

/**
 * Join the all-competitions results broadcast only while the user has no
 * favourites, so every round still reaches new users; drop it the moment they
 * follow their first competition/team, after which only followed topics deliver.
 * Mirrors the native app + backend TOPIC_RESULTS. Best-effort.
 */
async function syncResultsBroadcast(token: string): Promise<void> {
  await postJson('/api/push/results-broadcast', { token, subscribe: !hasFavourites() });
}

/**
 * On page load: if the user has already granted permission, silently refresh
 * the token, rejoin the always-on topics, and re-assert every followed
 * competition against the (possibly rotated) token. No prompt.
 */
export async function initNotifications(): Promise<void> {
  if (notifState() !== 'granted') return;
  const m = await ready();
  if (!m) return;
  const token = await currentToken(m);
  if (!token) return;
  await postJson('/api/push/subscribe', { token });
  await Promise.all([
    ...followedCompetitions().map(cid => postJson('/api/push/follow', { token, competition_id: Number(cid) })),
    ...followedTeams().map(tid => postJson('/api/push/follow-team', { token, team_id: Number(tid) })),
    // Re-assert the anonymous tally too, so a device that followed before this
    // existed (or on any revisit) is counted. Idempotent server-side.
    ...followedCompetitions().map(cid => reportFollow('comp', cid, true)),
    ...followedTeams().map(tid => reportFollow('team', tid, true)),
  ]);
  await syncResultsBroadcast(token);
}

/**
 * From a user click: prompt for permission, then join the always-on topics.
 * Returns the resulting state so the UI can reflect it.
 */
export async function enableNotifications(): Promise<NotifState> {
  const m = await ready();
  if (!m) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm as NotifState;
  const token = await currentToken(m);
  if (token) {
    await postJson('/api/push/subscribe', { token });
    await syncResultsBroadcast(token); // no favourites yet → join the results broadcast
  }
  return 'granted';
}

/**
 * Follow a competition: prompt for permission if needed, then subscribe this
 * device's token to the competition's topic and remember it locally. Returns
 * the permission state — 'granted' means it worked.
 */
export async function followCompetition(cid: string | number): Promise<NotifState> {
  const m = await ready();
  if (!m) return 'unsupported';
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return perm as NotifState;
  }
  // Record the follow the instant permission is granted — this is the device's
  // source of truth and what turns the star gold. The server subscription below
  // is best-effort and re-asserted on every page load (initNotifications), so a
  // flaky network never loses the choice or leaves the star out of sync.
  setFollowed([...followedCompetitions(), String(cid)]);
  reportFollow('comp', cid, true); // anonymous tally; fire-and-forget
  const token = await currentToken(m);
  if (token) {
    await postJson('/api/push/subscribe', { token }); // join the always-on topics too
    await postJson('/api/push/follow', { token, competition_id: Number(cid) });
    await syncResultsBroadcast(token); // now has a favourite → leave the broadcast
  }
  return 'granted';
}

/** Unfollow a competition: forget it locally (optimistic) and unsubscribe. */
export async function unfollowCompetition(cid: string | number): Promise<void> {
  setFollowed(followedCompetitions().filter(id => id !== String(cid)));
  reportFollow('comp', cid, false); // anonymous tally; fire-and-forget
  const m = await ready();
  if (!m) return;
  const token = await currentToken(m);
  if (token) {
    await postJson('/api/push/unfollow', { token, competition_id: Number(cid) });
    await syncResultsBroadcast(token); // rejoin the broadcast if no favourites remain
  }
}

/**
 * Follow a team: mirrors followCompetition. Prompt for permission if needed,
 * subscribe this device's token to the team's topic, and remember it locally.
 */
export async function followTeam(tid: string | number): Promise<NotifState> {
  const m = await ready();
  if (!m) return 'unsupported';
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return perm as NotifState;
  }
  // Local record is the source of truth (turns the star gold); the server call is
  // best-effort and re-asserted on every load (initNotifications).
  setFollowedTeams([...followedTeams(), String(tid)]);
  reportFollow('team', tid, true); // anonymous tally; fire-and-forget
  const token = await currentToken(m);
  if (token) {
    await postJson('/api/push/subscribe', { token }); // join the always-on topics too
    await postJson('/api/push/follow-team', { token, team_id: Number(tid) });
    await syncResultsBroadcast(token); // now has a favourite → leave the broadcast
  }
  return 'granted';
}

/** Unfollow a team: forget it locally (optimistic) and unsubscribe. */
export async function unfollowTeam(tid: string | number): Promise<void> {
  setFollowedTeams(followedTeams().filter(id => id !== String(tid)));
  reportFollow('team', tid, false); // anonymous tally; fire-and-forget
  const m = await ready();
  if (!m) return;
  const token = await currentToken(m);
  if (token) {
    await postJson('/api/push/unfollow-team', { token, team_id: Number(tid) });
    await syncResultsBroadcast(token); // rejoin the broadcast if no favourites remain
  }
}
