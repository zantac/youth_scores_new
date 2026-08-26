'use client';
import { useEffect, useMemo, useState } from 'react';
import { compareCompName } from '@/lib/compOrder';

// One competition, flattened for the picker. `name`/`sector` are already
// localized by the caller so this component stays language-agnostic.
export interface CompOption {
  id: number;
  season: string;
  name: string;
  age: string;    // may be '' for an open competition
  sector: string; // may be ''
}

// A competition is one (season, name, age/sector). With several seasons the same
// name repeats, so the flat list turns ambiguous. This narrows it in three
// steps — season → competition name → age/sector — and emits the chosen id.
export default function CompetitionSelect({
  options, value, onChange, className,
}: {
  options: CompOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  className?: string;
}) {
  const cls = className ??
    'w-full bg-cardBg border border-bdr rounded-xl px-3 py-2.5 text-text text-sm outline-none focus:border-aqua';

  const selected = useMemo(() => options.find(o => o.id === value) ?? null, [options, value]);
  const [season, setSeason] = useState('');
  const [name, setName] = useState('');
  const [sector, setSector] = useState('');

  // Keep the upper levels in step with an externally-set value (e.g. after an
  // edit reselects the competition).
  useEffect(() => {
    if (selected) { setSeason(selected.season); setName(selected.name); setSector(selected.sector); }
  }, [selected]);

  // Newest season first (season names sort lexically, e.g. 2025-2026 < 2026-2027).
  const seasons = useMemo(
    () => [...new Set(options.map(o => o.season).filter(Boolean))].sort().reverse(),
    [options],
  );
  // Default to the newest season once the list loads and nothing is chosen yet.
  useEffect(() => {
    if (!season && !value && seasons.length) setSeason(seasons[0]);
  }, [seasons, season, value]);

  const names = useMemo(
    () => [...new Set(options.filter(o => o.season === season).map(o => o.name))].sort(compareCompName),
    [options, season],
  );
  const variants = useMemo(
    () => options.filter(o => o.season === season && o.name === name),
    [options, season, name],
  );
  // A competition split into areas (sectors) shows an extra, optional sector
  // filter; the age group is always the final dimension. No areas → no filter.
  const sectors = useMemo(
    () => [...new Set(variants.map(v => v.sector).filter(Boolean))].sort(), [variants]);
  const hasSectors = sectors.length > 0;
  const ages = useMemo(
    () => variants.filter(v => !sector || v.sector === sector)
      .sort((a, b) => (a.age || '').localeCompare(b.age || '')),
    [variants, sector],
  );
  // Without a sector filter, disambiguate same ages across areas by appending
  // the sector; once a sector is chosen the label is just the age.
  const label = (o: CompOption) => sector
    ? (o.age || o.name)
    : ([o.age, o.sector].filter(Boolean).join(' · ') || o.name);

  // Skip the last step when there's a single option left.
  useEffect(() => {
    if (name && ages.length === 1 && ages[0].id !== value) onChange(ages[0].id);
  }, [ages, name, value, onChange]);

  const pickSeason = (s: string) => { setSeason(s); setName(''); setSector(''); onChange(null); };
  const pickName = (n: string) => { setName(n); setSector(''); onChange(null); };
  const pickSector = (s: string) => { setSector(s); onChange(null); };

  return (
    <div className={`grid grid-cols-1 gap-2 ${hasSectors ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
      <select value={season} onChange={e => pickSeason(e.target.value)} className={cls}>
        <option value="">الموسم</option>
        {seasons.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={name} onChange={e => pickName(e.target.value)} disabled={!season} className={cls + ' disabled:opacity-50'}>
        <option value="">البطولة</option>
        {names.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      {hasSectors && (
        <select value={sector} onChange={e => pickSector(e.target.value)} disabled={!name} className={cls + ' disabled:opacity-50'}>
          <option value="">كل القطاعات</option>
          {sectors.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      <select value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
        disabled={!name} className={cls + ' disabled:opacity-50'}>
        <option value="">المرحلة</option>
        {ages.map(o => <option key={o.id} value={o.id}>{label(o)}</option>)}
      </select>
    </div>
  );
}
