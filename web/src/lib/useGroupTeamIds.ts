'use client';
import { useEffect, useState } from 'react';
import { apiGroupTeams } from './adminApi';

/**
 * The team ids registered in a competition group, for scoping match-entry team
 * pickers (and the photo-import matcher) to the group the admin picked.
 *
 * `ids` is null when no group is selected or on error; `loading` is true only
 * while a selected group's set is being fetched. Callers must distinguish the
 * two: fall back to ALL teams when `ids` is null and not loading (no group /
 * flat stage), but show NO teams while loading — otherwise there's a window
 * right after picking a group where every competition team is offered and an
 * out-of-group team could be picked before the group's set arrives.
 */
export function useGroupTeamIds(
  token: string, groupId: string | number,
): { ids: Set<number> | null; loading: boolean } {
  const [ids, setIds] = useState<Set<number> | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const gid = Number(groupId);
    if (!gid) { setIds(null); setLoading(false); return; }
    let alive = true;
    setIds(null); setLoading(true);
    apiGroupTeams(token, gid)
      .then(ts => { if (alive) { setIds(new Set(ts.map(t => t.id))); setLoading(false); } })
      .catch(() => { if (alive) { setIds(null); setLoading(false); } });
    return () => { alive = false; };
  }, [token, groupId]);
  return { ids, loading };
}
