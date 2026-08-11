'use client';
import { useEffect, useState } from 'react';
import { useTT } from './kit';
import {
  followCompetition, unfollowCompetition, isFollowing, notifState, type NotifState,
} from '@/lib/notifications';

// Star toggle in a tla3bny competition's header: follow it to get a push when a
// new round's results are posted. A device can follow any number of competitions.
// Hidden on browsers that can't do web push so it never dead-ends.
export default function FollowButton({ competitionId }: { competitionId: string }) {
  const tt = useTT();
  const [supported, setSupported] = useState(false);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    setSupported(notifState() !== 'unsupported');
    setFollowing(isFollowing(competitionId));
    setBlocked(notifState() === 'denied');
  }, [competitionId]);

  if (!supported || !competitionId) return null;

  const label = following
    ? tt('إلغاء متابعة إشعارات النتائج', 'Unfollow results notifications')
    : blocked
      ? tt('الإشعارات محظورة في المتصفح', 'Notifications blocked in browser')
      : tt('تابع لإشعارات النتائج', 'Follow for results notifications');

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (following) {
        await unfollowCompetition(competitionId);
        setFollowing(false);
      } else {
        const res: NotifState = await followCompetition(competitionId);
        if (res === 'granted') { setFollowing(true); setBlocked(false); }
        else if (res === 'denied') setBlocked(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={onClick} disabled={busy} title={label} aria-label={label} aria-pressed={following}
      className={`flex items-center gap-1 text-sm leading-none rounded-lg px-2.5 py-1 border transition-colors flex-shrink-0
        ${following ? 'border-yellow-400/60 bg-yellow-400/10 text-yellow-400'
                    : 'border-aqua/40 bg-cardBg text-aqua hover:bg-aqua/10'}`}>
      <span aria-hidden="true">{busy ? '…' : following ? '★' : '☆'}</span>
      <span className="text-[11px] font-bold">
        {following ? tt('متابَع', 'Following') : tt('متابعة', 'Follow')}
      </span>
    </button>
  );
}
