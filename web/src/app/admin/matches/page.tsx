'use client';
import AdminShell from '@/components/admin/AdminShell';
import MatchesEntry from '@/components/admin/MatchesEntry';

// The dedicated match-entry screen. For an editor+ the nav points at the
// المباريات tab inside المسابقات and this route is just a kept-alive bookmark;
// for a clerk (data entry) this IS their whole panel — the only nav entry.
export default function AdminMatchesPage() {
  return <AdminShell title="إدخال المباريات"><MatchesEntry /></AdminShell>;
}
