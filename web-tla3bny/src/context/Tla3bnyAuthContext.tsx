'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  tLogin, tMe, tRegister, tImpersonate, tImpersonateAcademy,
  type TUser, type TAcademy, type TTeam, type TCompetition,
} from '@/lib/tla3bnyApi';
import { subscribeAccount } from '@/lib/notifications';

// Kept separate from the youthscores admin session (ys_admin_token): this is the
// subdomain's own login, so the two never collide in localStorage.
const TOKEN_KEY = 'tla3bny_token';
// While a super admin is "logged in as" another account, their own token is
// parked here so "return to my account" can restore it. Its mere presence is
// what tells the UI we're in an impersonation session (survives a page reload).
const ADMIN_TOKEN_KEY = 'tla3bny_admin_token';

interface Ctx {
  token: string | null;
  user: TUser | null;
  academy: TAcademy | null;
  team: TTeam | null;
  competitions: TCompetition[];
  loading: boolean;
  /** `login` is a username or an email — accounts may carry either. */
  login: (login: string, password: string) => Promise<TUser>;
  register: (fd: Parameters<typeof tRegister>[0]) => Promise<TUser>;
  logout: () => void;
  refresh: () => Promise<void>;
  /** Replace the stored session token (e.g. the fresh one issued after a
   *  password change) and re-hydrate the account from it. */
  updateToken: (token: string) => Promise<void>;
  /** True while a super admin is signed in AS another account. */
  impersonating: boolean;
  /** Super admin only: sign in AS another account to troubleshoot it — target
   *  a competition organizer by its user id, or an academy by its academy id. */
  impersonate: (target: { userId: number } | { academyId: number }) => Promise<void>;
  /** Leave a "login as" session and restore the super admin's own account. */
  stopImpersonation: () => Promise<void>;
  isSuperAdmin: boolean;
  isCompetitionAdmin: boolean;
  isAcademy: boolean;
  /** An academy account that has not been suspended. Registration is open, so
   *  this is true from the moment it signs up. */
  isActiveAcademy: boolean;
  isTeam: boolean;
  /** Super admin, or a competition admin assigned to this competition. */
  canAdminCompetition: (compId: number) => boolean;
}

const AuthCtx = createContext<Ctx | null>(null);

export function useTla3bnyAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useTla3bnyAuth outside Tla3bnyAuthProvider');
  return c;
}

export function Tla3bnyAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<TUser | null>(null);
  const [academy, setAcademy] = useState<TAcademy | null>(null);
  const [team, setTeam] = useState<TTeam | null>(null);
  const [competitions, setCompetitions] = useState<TCompetition[]>([]);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(false);

  const applyMe = useCallback((me: Awaited<ReturnType<typeof tMe>>) => {
    if (!me) return false;
    setUser(me.user);
    setAcademy(me.academy ?? null);
    setTeam(me.team ?? null);
    setCompetitions(me.competitions ?? []);
    return true;
  }, []);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    // A parked admin token means we reloaded mid-impersonation — keep the banner.
    if (typeof window !== 'undefined' && localStorage.getItem(ADMIN_TOKEN_KEY)) setImpersonating(true);
    if (!saved) { setLoading(false); return; }
    setToken(saved);
    tMe(saved)
      .then(me => { if (!applyMe(me)) { localStorage.removeItem(TOKEN_KEY); setToken(null); } })
      .finally(() => setLoading(false));
  }, [applyMe]);

  const afterAuth = useCallback(async (t: string, u: TUser) => {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
    const me = await tMe(t);
    applyMe(me);
    return u;
  }, [applyMe]);

  const login = useCallback(async (loginId: string, password: string) => {
    const { token: t, user: u } = await tLogin(loginId, password);
    return afterAuth(t, u);
  }, [afterAuth]);

  const register = useCallback(async (fd: Parameters<typeof tRegister>[0]) => {
    const { token: t, user: u } = await tRegister(fd);
    return afterAuth(t, u);
  }, [afterAuth]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setImpersonating(false);
    setToken(null);
    setUser(null);
    setAcademy(null);
    setTeam(null);
    setCompetitions([]);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    applyMe(await tMe(token));
  }, [token, applyMe]);

  const updateToken = useCallback(async (t: string) => {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    applyMe(await tMe(t));
  }, [applyMe]);

  // Super admin "logs in as" another account: park the admin's own token, then
  // swap in the impersonation token and hydrate as that account.
  const impersonate = useCallback(async (target: { userId: number } | { academyId: number }) => {
    if (!token) return;
    const { token: t, user: u } = 'academyId' in target
      ? await tImpersonateAcademy(token, target.academyId)
      : await tImpersonate(token, target.userId);
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    setImpersonating(true);
    await afterAuth(t, u);
  }, [token, afterAuth]);

  const stopImpersonation = useCallback(async () => {
    const admin = localStorage.getItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setImpersonating(false);
    if (admin) await updateToken(admin);
    else logout();
  }, [updateToken, logout]);

  // Once logged in (on login or a restored session), subscribe this device to
  // the account's private notification topics. No-op unless push is enabled;
  // the server derives which topics from the bearer token.
  useEffect(() => {
    if (token && user) subscribeAccount(token).catch(() => {});
  }, [token, user]);

  // The API client fires this when any request gets a 401 (token expired or
  // revoked). Reset to logged-out so the UI stops using a dead token.
  useEffect(() => {
    const onExpired = () => logout();
    window.addEventListener('tla3bny-session-expired', onExpired);
    return () => window.removeEventListener('tla3bny-session-expired', onExpired);
  }, [logout]);

  const canAdminCompetition = useCallback(
    (compId: number) =>
      user?.role === 'super_admin' || competitions.some(c => c.id === compId),
    [user, competitions],
  );

  return (
    <AuthCtx.Provider value={{
      token, user, academy, team, competitions, loading,
      login, register, logout, refresh, updateToken,
      impersonating, impersonate, stopImpersonation,
      isSuperAdmin: user?.role === 'super_admin',
      isCompetitionAdmin: user?.role === 'competition_admin',
      isAcademy: user?.role === 'academy',
      isActiveAcademy:
        user?.role === 'academy' &&
        academy?.status !== 'suspended' && academy?.status !== 'rejected',
      isTeam: user?.role === 'team',
      canAdminCompetition,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}
