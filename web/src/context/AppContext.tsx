'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ConfigData, CompetitionData, AdItem } from '@/lib/types';
import { fetchConfig, fetchCompetition } from '@/lib/api';
import { initNotifications } from '@/lib/notifications';

interface AppContextValue {
  locale: 'ar' | 'en';
  isDark: boolean;
  toggleLocale: () => void;
  toggleTheme: () => void;
  config: ConfigData | null;
  configLoading: boolean;
  configError: string | null;
  competition: CompetitionData | null;
  compLoading: boolean;
  compError: string | null;
  compUrl: string | null;
  compTitle: string;
  loadCompetition: (url: string, title: string) => Promise<void>;
  refreshCompetition: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  pendingAd: AdItem | null;
  clearAd: () => void;
}

const Ctx = createContext<AppContextValue | null>(null);

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale]       = useState<'ar' | 'en'>('ar');
  const [isDark, setIsDark]       = useState(true);
  const [config, setConfig]       = useState<ConfigData | null>(null);
  const [configLoading, setCfgL]  = useState(false);
  const [configError, setCfgErr]  = useState<string | null>(null);
  const [competition, setComp]    = useState<CompetitionData | null>(null);
  const [compLoading, setCompL]   = useState(false);
  const [compError, setCompErr]   = useState<string | null>(null);
  const [compUrl, setCompUrl]     = useState<string | null>(null);
  const [compTitle, setCompTitle] = useState('');
  const [pendingAd, setPendingAd] = useState<AdItem | null>(null);
  const cache      = useRef(new Map<string, CompetitionData>());
  const shownAds   = useRef(new Set<string>());

  const clearAd = useCallback(() => setPendingAd(null), []);

  const pickAd = useCallback((cfg: ConfigData | null): AdItem | null => {
    if (!cfg?.ads?.length) return null;
    const now = new Date();
    const valid = cfg.ads.filter(a => !a.expire_date || new Date(a.expire_date) > now);
    if (!valid.length) return null;

    let pool = valid.filter(a => !shownAds.current.has(a.name));
    if (!pool.length) {
      shownAds.current.clear();
      pool = valid;
    }

    // Weighted random: a higher `weight` is shown proportionally more often.
    const w = (a: AdItem) => Math.max(1, a.weight ?? 1);
    let r = Math.random() * pool.reduce((s, a) => s + w(a), 0);
    const ad = pool.find(a => (r -= w(a)) < 0) ?? pool[pool.length - 1];
    shownAds.current.add(ad.name);
    return ad;
  }, []);

  // Persist preferences
  useEffect(() => {
    const l = localStorage.getItem('locale') as 'ar' | 'en' | null;
    const d = localStorage.getItem('isDark');
    if (l) setLocale(l);
    if (d !== null) setIsDark(d === 'true');
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.classList.toggle('dark', isDark);
  }, [locale, isDark]);

  const toggleLocale = useCallback(() => {
    setLocale(l => { const n = l === 'ar' ? 'en' : 'ar'; localStorage.setItem('locale', n); return n; });
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark(d => { localStorage.setItem('isDark', String(!d)); return !d; });
  }, []);

  const loadConfigInternal = useCallback(async () => {
    setCfgL(true); setCfgErr(null);
    try { setConfig(await fetchConfig()); }
    catch (e) { setCfgErr(String(e)); }
    finally { setCfgL(false); }
  }, []);

  useEffect(() => { loadConfigInternal(); }, [loadConfigInternal]);

  // If the user already granted push permission on a past visit, silently
  // refresh this device's FCM token/subscription (tokens rotate over time).
  useEffect(() => { initNotifications().catch(() => {}); }, []);

  const loadCompetition = useCallback(async (url: string, title: string) => {
    setCompTitle(title);
    const activeUrl = sessionStorage.getItem('activeCompUrl');
    if (url !== activeUrl) {
      const ad = pickAd(config);
      if (ad) setPendingAd(ad);
    }
    sessionStorage.setItem('activeCompUrl', url);
    if (cache.current.has(url)) {
      setComp(cache.current.get(url)!); setCompUrl(url);
      // silent refresh
      fetchCompetition(url).then(d => { cache.current.set(url, d); setComp(d); }).catch(() => {});
      return;
    }
    setCompL(true); setCompErr(null);
    try {
      const d = await fetchCompetition(url);
      cache.current.set(url, d); setComp(d); setCompUrl(url);
    } catch (e) { setCompErr(String(e)); }
    finally { setCompL(false); }
  }, [config, pickAd]);

  const refreshCompetition = useCallback(async () => {
    if (!compUrl) return;
    cache.current.delete(compUrl);
    setCompL(true); setCompErr(null);
    try { const d = await fetchCompetition(compUrl); cache.current.set(compUrl, d); setComp(d); }
    catch (e) { setCompErr(String(e)); }
    finally { setCompL(false); }
  }, [compUrl]);

  const refreshConfig = useCallback(() => loadConfigInternal(), [loadConfigInternal]);

  return (
    <Ctx.Provider value={{ locale, isDark, toggleLocale, toggleTheme, config, configLoading, configError, competition, compLoading, compError, compUrl, compTitle, loadCompetition, refreshCompetition, refreshConfig, pendingAd, clearAd }}>
      {children}
    </Ctx.Provider>
  );
}
