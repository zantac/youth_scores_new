'use client';
import { useEffect, useState } from 'react';
import { apiGroupTeams } from './adminApi';

/**
 * The set of team ids registered in a competition group, for scoping match-entry
 * team pickers (and the photo-import matcher) to the group the admin picked.
 *
 * Returns null when no group is selected, while the fetch is in flight, or on
 * error — callers treat null as "not scoped" and fall back to the full
 * competition team list, so a flat (group-less) stage is unaffected.
 */
export function useGroupTeamIds(token: string, groupId: string | number): Set<number> | null {
  const [ids, setIds] = useState<Set<number> | null>(null);
  useEffect(() => {
    const gid = Number(groupId);
    if (!gid) { setIds(null); return; }
    let alive = true;
    setIds(null); // loading: fall back to all teams until the group's set arrives
    apiGroupTeams(token, gid)
      .then(ts => { if (alive) setIds(new Set(ts.map(t => t.id))); })
      .catch(() => { if (alive) setIds(null); });
    return () => { alive = false; };
  }, [token, groupId]);
  return ids;
}
