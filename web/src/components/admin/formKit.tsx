// Shared admin form primitives, so the content (news/venues) page and the
// standalone ads page use the exact same field styling and don't drift apart.
import type { ReactNode } from 'react';

export const inputCls =
  'w-full bg-darkBg border border-bdr rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-aqua';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-teal text-[11px] font-bold mb-1">{label}</label>
      {children}
    </div>
  );
}
