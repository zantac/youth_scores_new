'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ConfigData, CompetitionData, AdItem } from '@/lib/types';
import { fetchConfig, fetchCompetition } from '@/lib/api';
import { initNotifications } from '@/lib/notifications';
import { adNotExpired } from '@/lib/utils';
import { countUnseen, markSeen } from '@/lib/seen';

// Stable per-item ids for the "new items" badges. News rows carry a DB id; fall
// back to date+title so an id-less row still tracks. Venues carry a venue_id.
const newsIds = (cfg: ConfigData): string[] =>
  (cfg.news ?? []).map(n =>
    n.id != null ? `n${n.id}` : `d${n.date}|${typeof n.title === 'string' ? n.title : n.title.ar}`);
const venueIds = (cfg: ConfigData): string[] =>
  (cfg.venues ?? []).map(v => String(v.venue_id));

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
  newNewsCount: number;
  newVenuesCount: number;
  markNewsSeen: () => void;
  markVenuesSeen: () => void;
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
  const [newNewsCount, setNewNewsCount]     = useState(0);
  const [newVenuesCount, setNewVenuesCount] = useState(0);
  const cache      = useRef(new Map<string, CompetitionData>());
  const shownAds   = useRef(new Set<string>());

  const clearAd = useCallback(() => setPendingAd(null), []);

  const pickAd = useCallback((cfg: ConfigData | null): AdItem | null => {
    if (!cfg?.ads?.length) return null;
    const now = new Date();
    // Interstitial pick only — feed-only ads render in the match feed instead.
    const valid = cfg.ads.filter(a =>
      adNotExpired(a.expire_date, now) &&
      (a.placement ?? 'interstitial') !== 'feed');
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

  const loadConfigInternal = useCallback(async (silent = false) => {
    // Silent (background) refresh keeps the current news/venues on screen — no
    // loading spinner, and a failed fetch leaves the existing data untouched.
    if (!silent) { setCfgL(true); setCfgErr(null); }
    try { setConfig(await fetchConfig()); if (silent) setCfgErr(null); }
    catch (e) { if (!silent) setCfgErr(String(e)); }
    finally { if (!silent) setCfgL(false); }
  }, []);

  useEffect(() => { loadConfigInternal(); }, [loadConfigInternal]);

  // Silently refresh news/venues (the config feed) when the tab regains focus,
  // so a newly added/edited item appears without a manual page reload. Throttled
  // so rapid tab switches don't spam the two config requests.
  const lastCfgAt = useRef(0);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastCfgAt.current < 15000) return;
      lastCfgAt.current = now;
      loadConfigInternal(true);
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [loadConfigInternal]);

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

  // Recompute the bottom-bar "new items" badges whenever the config feed loads
  // or is silently refreshed. First run seeds the baseline (badge stays 0).
  useEffect(() => {
    if (!config) return;
    setNewNewsCount(countUnseen('news', newsIds(config)));
    setNewVenuesCount(countUnseen('venues', venueIds(config)));
  }, [config]);

  // Called when the user opens the News / Venues page: everything currently in
  // the feed becomes "seen", clearing the badge until something new arrives.
  const markNewsSeen = useCallback(() => {
    if (config) markSeen('news', newsIds(config));
    setNewNewsCount(0);
  }, [config]);
  const markVenuesSeen = useCallback(() => {
    if (config) markSeen('venues', venueIds(config));
    setNewVenuesCount(0);
  }, [config]);

  return (
    <Ctx.Provider value={{ locale, isDark, toggleLocale, toggleTheme, config, configLoading, configError, competition, compLoading, compError, compUrl, compTitle, loadCompetition, refreshCompetition, refreshConfig, pendingAd, clearAd, newNewsCount, newVenuesCount, markNewsSeen, markVenuesSeen }}>
      {children}
    </Ctx.Provider>
  );
}
