'use client';
import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  followCompetition, unfollowCompetition, isFollowing,
  followTeam, unfollowTeam, isFollowingTeam,
  notifState, type NotifState,
} from '@/lib/notifications';

// A star toggle in a competition's or team's header: follow it to get a push when
// a new result is posted. A device can follow any number of each. Pass exactly one
// of competitionId / teamId. Hidden on browsers that can't do web push so it never
// dead-ends.
export default function FollowButton(
  { competitionId, teamId }: { competitionId?: string; teamId?: string },
) {
  const { locale } = useApp();
  const isAr = locale === 'ar';
  const isTeam = !!teamId;
  const targetId = teamId ?? competitionId ?? '';
  const [supported, setSupported] = useState(false);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    setSupported(notifState() !== 'unsupported');
    setFollowing(isTeam ? isFollowingTeam(targetId) : isFollowing(targetId));
    setBlocked(notifState() === 'denied');
  }, [isTeam, targetId]);

  if (!supported || !targetId) return null;

  const label = following
    ? (isAr ? 'إلغاء متابعة إشعارات النتائج' : 'Unfollow results notifications')
    : blocked
      ? (isAr ? 'الإشعارات محظورة في المتصفح' : 'Notifications blocked in browser')
      : (isAr ? 'تابع لإشعارات النتائج' : 'Follow for results notifications');

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (following) {
        await (isTeam ? unfollowTeam(targetId) : unfollowCompetition(targetId));
        setFollowing(false);
      } else {
        const res: NotifState = await (isTeam ? followTeam(targetId) : followCompetition(targetId));
        if (res === 'granted') { setFollowing(true); setBlocked(false); }
        else if (res === 'denied') setBlocked(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={label}
      aria-label={label}
      aria-pressed={following}
      className={`flex items-center gap-1 text-sm leading-none rounded-lg px-2.5 py-1 border transition-colors
        ${following ? 'border-gold/60 bg-gold/10 text-gold'
                    : 'border-aqua/40 bg-cardBg text-aqua hover:bg-aqua/10'}`}
    >
      <span aria-hidden="true">{busy ? '…' : following ? '★' : '☆'}</span>
      <span className="text-[11px] font-bold">
        {following ? (isAr ? 'متابَع' : 'Following') : (isAr ? 'متابعة' : 'Follow')}
      </span>
    </button>
  );
}
