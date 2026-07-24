'use client';
import type { TCategory } from '@/lib/tla3bnyApi';

/** Horizontally scrollable age-category selector. `null` = "All" (optional). */
export default function CategoryTabs({
  categories, selected, onSelect, allowAll = false, allLabel = 'الكل',
}: {
  categories: TCategory[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  allowAll?: boolean;
  allLabel?: string;
}) {
  const chip = (active: boolean) =>
    `px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap border transition-colors ${
      active ? 'bg-aqua text-on-accent border-aqua' : 'bg-cardBg2 text-teal border-bdr hover:border-aqua/50'
    }`;

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
      {allowAll && (
        <button className={chip(selected === null)} onClick={() => onSelect(null)}>{allLabel}</button>
      )}
      {categories.map(c => (
        <button key={c.id} className={chip(selected === c.id)} onClick={() => onSelect(c.id)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}
