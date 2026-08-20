'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, Kanban, Download, LogOut, CalendarClock, CalendarDays, PhoneCall, ListOrdered } from 'lucide-react';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/called-answered', label: 'Called + answered', icon: PhoneCall, badge: true },
  { href: '/calls', label: 'All the calls', icon: ListOrdered },
  { href: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/scrape', label: 'Scrape', icon: Download },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [actionCount, setActionCount] = useState(0);

  // Calls land via webhook, so the count has to come to us — refresh on
  // navigation and every half minute.
  const refreshCount = useCallback(async () => {
    try {
      const res = await fetch('/api/action-required', { cache: 'no-store' });
      if (!res.ok) return;
      const { count } = await res.json();
      setActionCount(typeof count === 'number' ? count : 0);
    } catch { /* offline — leave the last known count */ }
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, 30_000);
    return () => clearInterval(timer);
  }, [refreshCount, pathname]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <aside className="w-56 bg-slate-900 flex flex-col shrink-0">
      <div className="px-4 py-5 border-b border-slate-800 flex items-center gap-2.5">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">G</span>
        </div>
        <span className="text-white font-semibold text-sm">Georgia CRM</span>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon, exact, badge }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          const showDot = badge && actionCount > 0;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon size={15} />
              <span className="flex-1">{label}</span>
              {showDot && (
                <span
                  title={`${actionCount} contact${actionCount === 1 ? '' : 's'} need an action`}
                  className="min-w-[1.15rem] h-[1.15rem] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none"
                >
                  {actionCount > 99 ? '99+' : actionCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 w-full transition-colors"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
