'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import AppBar from '@/components/ui/AppBar';
import Spinner from '@/components/ui/Spinner';
import { getCompName, localize, groupKey, buildCompTitle } from '@/lib/utils';

export default function CompetitionsPage() {
  const { config, configLoading, configError, refreshConfig, locale } = useApp();
  const router = useRouter();
  const [q, setQ]               = useState('');
  const [openSeasons, setOS]     = useState<Set<string>>(new Set());
  const [openComps,   setOC]     = useState<Set<string>>(new Set());
  const [openAreas,   setOA]     = useState<Set<string>>(new Set());
  const isAr = locale === 'ar';

  const toggleSeason = (name: string) =>
    setOS(prev => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s; });

  const toggleComp = (key: string) =>
    setOC(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const toggleArea = (key: string) =>
    setOA(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const go = (url: string, title: { ar: string; en: string }) => {
    // The data URL embeds the competition id (…/competitions/<id>/data) — open
    // by that compact id; fall back to the legacy url+title form if it's absent.
    const m = url.match(/\/competitions\/(\d+)\/data/);
    const p = m
      ? new URLSearchParams({ id: m[1] })
      : new URLSearchParams({ url, title: title.ar || title.en, titleAr: title.ar, titleEn: title.en });
    router.push(`/competition?${p.toString()}`);
  };

  const filteredSeasons = useMemo(() => {
    if (!config) return [];
    // Fold Arabic (tashkeel/tatweel + alef/ya/ta spelling) and lowercase, so a
    // city/section search matches regardless of spelling variants.
    const fold = (s: string) => s.toLowerCase()
      .replace(/[ً-ْـ]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ').trim();
    const lq = fold(q);
    const secText = (s: { name: { ar: string; en: string } }) =>
      fold(`${s.name.ar ?? ''} ${s.name.en ?? ''}`);
    const seasons = lq
      ? config.seasons
          .map(season => {
            const seasonHay = fold(`${localize(season.name, 'ar')} ${localize(season.name, 'en')}`);
            return {
              ...season,
              // Match on the competition's own name/season (keep all its sections),
              // or on a section (sector) name — then keep only the matching sections
              // so a city search lands right on the relevant one.
              competitions: season.competitions.flatMap(comp => {
                const nm = typeof comp.name === 'string'
                  ? comp.name : `${comp.name.ar ?? ''} ${comp.name.en ?? ''}`;
                if (fold(nm).includes(lq) || seasonHay.includes(lq)) return [comp];
                const ages = comp.ages
                  .map(age => ({ ...age, sectors: age.sectors.filter(s => secText(s).includes(lq)) }))
                  .filter(age => age.sectors.length > 0);
                return ages.length ? [{ ...comp, ages }] : [];
              }),
            };
          })
          .filter(season => season.competitions.length > 0)
      : config.seasons;
    // Newest season first — season names are year ranges ("2025-2026") that sort
    // lexicographically, so descending string order gives the current season at [0].
    return [...seasons].sort((a, b) => {
      const na = localize(a.name, 'en') || localize(a.name, 'ar') || '';
      const nb = localize(b.name, 'en') || localize(b.name, 'ar') || '';
      return nb.localeCompare(na);
    });
  }, [config, q, locale]);

  const searchActive = q.trim().length > 0;

  return (
    <>
      <AppBar title={isAr ? 'البطولات' : 'Competitions'} />

      <div className="p-3">
        {/* Search */}
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={isAr ? 'ابحث عن بطولة...' : 'Search competitions...'}
          className="w-full bg-cardBg border border-bdr rounded-xl px-4 py-2.5 text-text text-sm placeholder-hint outline-none focus:border-aqua mb-4"
        />

        {configLoading && !config && <Spinner label={isAr ? 'جاري التحميل...' : 'Loading...'} />}

        {configError && (
          <div className="text-center py-8 space-y-3">
            <p className="text-red-400 text-sm">{configError}</p>
            <button onClick={refreshConfig}
              className="bg-aqua text-on-accent font-bold px-6 py-2.5 rounded-xl text-sm">
              {isAr ? 'إعادة المحاولة' : 'Retry'}
            </button>
          </div>
        )}

        <div className="space-y-3 pb-6">
          {filteredSeasons.map((season, i) => {
            const seasonKey  = groupKey(season.name);
            const seasonName = localize(season.name, locale);
            const seasonOpen = searchActive || openSeasons.has(seasonKey);
            return (
              <div key={seasonKey} className="rounded-2xl overflow-hidden border border-bdr">

                {/* Season header */}
                <button
                  onClick={() => toggleSeason(seasonKey)}
                  className="w-full flex items-center gap-3 bg-gradient-to-l from-aqua/[0.06] to-transparent px-4 py-4 hover:from-aqua/10">
                  <div className="w-10 h-10 rounded-xl bg-aqua/10 border border-aqua/20 flex items-center justify-center flex-shrink-0">
                    <img src="https://res.cloudinary.com/debq5s4sn/image/upload/v1783596194/Egyptian-FA-01_ehrgye.png" alt="EFA" className="w-7 h-7 object-contain" />
                  </div>
                  <div className="flex-1 text-start">
                    <p className="text-aqua font-extrabold text-sm tnum">{seasonName}</p>
                    <p className="text-hint text-xs mt-0.5">
                      {season.competitions.length} {isAr ? 'بطولة' : 'competitions'}
                    </p>
                  </div>
                  {i === 0 && <span className="text-[10px] text-win bg-win/10 border border-win/30 rounded-full px-2 py-0.5 font-bold">{isAr ? '● جارية' : '● Live'}</span>}
                  <span className="text-aqua text-base">{seasonOpen ? '▲' : '▼'}</span>
                </button>

                {/* Competitions within this season */}
                {seasonOpen && (
                  <div className="bg-darkBg divide-y divide-bdr/60">
                    {season.competitions.map(comp => {
                      const name   = getCompName(comp, locale);
                      const compKey = `${seasonKey}:${comp.id}`;
                      const compOpen = searchActive || openComps.has(compKey);

                      const totalEntries = comp.ages.reduce((sum, age) =>
                        sum + (age.sectors.length > 0 ? age.sectors.length : age.directMatchesUrl ? 1 : 0), 0);

                      // Pivot age→areas into area→ages: for a competition split
                      // into areas the user picks the area (city/section) first,
                      // then the age within it. Ages with no section (a single
                      // direct link) have no area — keep them as a flat list.
                      const areaGroups: { name: { ar: string; en: string }; ages: { key: string; label: string; title: { ar: string; en: string }; url: string }[] }[] = [];
                      comp.ages.forEach(age => {
                        const label = localize(age.ageName ?? age.age, locale);
                        age.sectors.forEach(sec => {
                          const k = localize(sec.name, locale);
                          let g = areaGroups.find(a => localize(a.name, locale) === k);
                          if (!g) { g = { name: sec.name, ages: [] }; areaGroups.push(g); }
                          g.ages.push({
                            key: `${age.age}:${sec.url}`,
                            label,
                            title: buildCompTitle(comp.name, age.ageName ?? age.age, sec.name, ' · '),
                            url: sec.url,
                          });
                        });
                      });
                      const directAges = comp.ages.filter(a => a.sectors.length === 0 && a.directMatchesUrl);
                      // A first-team-only competition has a single age, so the age
                      // is the same under every area and repeating it is noise —
                      // let the area itself be the link.
                      const singleAge = comp.ages.length === 1;

                      return (
                        <div key={comp.id}>
                          {/* Competition row */}
                          <button
                            onClick={() => toggleComp(compKey)}
                            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-aqua/[0.04] transition-colors">
                            <div className="w-8 h-8 rounded-lg bg-aqua/10 flex items-center justify-center flex-shrink-0">
                              <img src="https://res.cloudinary.com/debq5s4sn/image/upload/v1783596194/Egyptian-FA-01_ehrgye.png" alt="EFA" className="w-6 h-6 object-contain" />
                            </div>
                            <div className="flex-1 text-start">
                              <p className="text-text font-semibold text-sm">{name}</p>
                              <p className="text-hint text-xs mt-0.5">
                                {comp.ages.length} {isAr ? 'فئة' : 'age groups'}
                                {totalEntries > comp.ages.length && ` · ${totalEntries} ${isAr ? 'قسم' : 'sections'}`}
                              </p>
                            </div>
                            <span className="text-hint text-sm">{compOpen ? '▲' : '▼'}</span>
                          </button>

                          {/* Areas → ages: pick the area (city/section) first,
                              then the age within it. Age-only competitions with
                              no sections fall back to a flat age list below. */}
                          {compOpen && (
                            <div className="bg-cardBg/60 border-t border-bdr/40">
                              {areaGroups.map(area => {
                                const areaName = localize(area.name, locale);
                                // Single-age competition: the area is the leaf —
                                // one tap straight to its matches, no age row.
                                if (singleAge) {
                                  const a = area.ages[0];
                                  return (
                                    <button
                                      key={areaName}
                                      onClick={() => go(a.url, a.title)}
                                      className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-bdr/30 last:border-0 active:bg-aqua/5 text-start">
                                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(78,168,196,0.15)' }}>
                                        <span className="text-sm">📍</span>
                                      </div>
                                      <span className="flex-1 text-teal text-sm font-medium">{areaName}</span>
                                      <div className="flex items-center gap-1 bg-aqua/10 border border-aqua/20 rounded-lg px-2.5 py-1">
                                        <span className="text-aqua text-xs font-bold">{isAr ? 'عرض' : 'View'}</span>
                                        <span className="text-aqua text-xs">›</span>
                                      </div>
                                    </button>
                                  );
                                }
                                // Multi-age area: show the area name as a row;
                                // tapping it reveals the ages within that area, so
                                // the user picks the area first (not one long list).
                                const areaKey = `${compKey}:${areaName}`;
                                const areaOpen = searchActive || openAreas.has(areaKey);
                                return (
                                  <div key={areaName} className="border-b border-bdr/30 last:border-0">
                                    <button
                                      onClick={() => toggleArea(areaKey)}
                                      className="w-full flex items-center gap-2 px-5 py-3 bg-darkBg/50 active:bg-aqua/5 text-start">
                                      <span className="text-hint text-sm">📍</span>
                                      <span className="flex-1 text-aqua text-sm font-bold">{areaName}</span>
                                      <span className="text-hint text-[11px]">
                                        {area.ages.length} {isAr ? 'فئة' : 'ages'}
                                      </span>
                                      <span className="text-hint text-xs">{areaOpen ? '▲' : '▼'}</span>
                                    </button>
                                    {areaOpen && area.ages.map(a => (
                                      <button
                                        key={a.key}
                                        onClick={() => go(a.url, a.title)}
                                        className="w-full flex items-center gap-3 px-6 py-3 border-t border-bdr/20 active:bg-aqua/5 text-start">
                                        <span className="text-aqua text-xs">›</span>
                                        <span className="flex-1 text-teal text-sm">{a.label}</span>
                                        <span className="text-bdr text-xs">↗</span>
                                      </button>
                                    ))}
                                  </div>
                                );
                              })}
                              {directAges.map(age => {
                                const ageLabel = localize(age.ageName ?? age.age, locale);
                                const title = buildCompTitle(comp.name, age.ageName ?? age.age, null, ' · ');
                                return (
                                  <button
                                    key={age.age}
                                    onClick={() => go(age.directMatchesUrl!, title)}
                                    className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-bdr/30 last:border-0 active:bg-aqua/5 text-start">
                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(78,168,196,0.15)' }}>
                                      <span className="text-sm">👥</span>
                                    </div>
                                    <span className="flex-1 text-teal text-sm font-medium">{ageLabel}</span>
                                    <div className="flex items-center gap-1 bg-aqua/10 border border-aqua/20 rounded-lg px-2.5 py-1">
                                      <span className="text-aqua text-xs font-bold">
                                        {isAr ? 'عرض' : 'View'}
                                      </span>
                                      <span className="text-aqua text-xs">›</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {!configLoading && filteredSeasons.length === 0 && q.trim() && (
            <div className="text-center py-12 space-y-2">
              <p className="text-4xl">🔍</p>
              <p className="text-hint text-sm">
                {isAr ? `لا توجد نتائج لـ "${q}"` : `No results for "${q}"`}
              </p>
              <button onClick={() => setQ('')} className="text-aqua text-xs underline">
                {isAr ? 'مسح البحث' : 'Clear search'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
