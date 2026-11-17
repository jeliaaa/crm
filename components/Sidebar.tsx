'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import GlobalSearch from './GlobalSearch';
import { LogOut } from 'lucide-react';
import { NAV } from '@/lib/nav';
import { useActionCount } from '@/lib/hooks/useActionCount';

// Visible from `lg` up only — below that, app/(dashboard)/layout.tsx shows
// MobileNav's top and bottom bars instead.
export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const actionCount = useActionCount();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <aside className="hidden lg:flex w-56 bg-slate-900 flex-col shrink-0">
      <div className="px-4 py-5 border-b border-slate-800 flex items-center gap-2.5">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">G</span>
        </div>
        <span className="text-white font-semibold text-sm">Georgia CRM</span>
      </div>

      <GlobalSearch />

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
