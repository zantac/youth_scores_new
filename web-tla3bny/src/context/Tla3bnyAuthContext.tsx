'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  tLogin, tMe, tRegister,
  type TUser, type TAcademy, type TTeam, type TCompetition,
} from '@/lib/tla3bnyApi';
import { subscribeAccount } from '@/lib/notifications';

// Kept separate from the youthscores admin session (ys_admin_token): this is the
// subdomain's own login, so the two never collide in localStorage.
const TOKEN_KEY = 'tla3bny_token';

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

  // Once logged in (on login or a restored session), subscribe this device to
  // the account's private notification topics. No-op unless push is enabled;
  // the server derives which topics from the bearer token.
  useEffect(() => {
    if (token && user) subscribeAccount(token).catch(() => {});
  }, [token, user]);

  const canAdminCompetition = useCallback(
    (compId: number) =>
      user?.role === 'super_admin' || competitions.some(c => c.id === compId),
    [user, competitions],
  );

  return (
    <AuthCtx.Provider value={{
      token, user, academy, team, competitions, loading,
      login, register, logout, refresh,
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
