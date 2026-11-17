'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Search, X, LogOut } from 'lucide-react';
import GlobalSearch from './GlobalSearch';
import { NAV, MOBILE_PRIMARY_HREFS } from '@/lib/nav';
import { useActionCount } from '@/lib/hooks/useActionCount';

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

// Below `lg`, this renders the top bar and bottom tab bar that stand in for
// the desktop Sidebar, and wraps the page content between them so the whole
// thing is one scroll column (no fixed positioning, so it can't be pushed
// around by the mobile keyboard or an address-bar show/hide).
export default function MobileNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const actionCount = useActionCount();
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Close the search bar / sheet whenever the route changes underneath them.
  useEffect(() => {
    setSearchOpen(false);
    setSheetOpen(false);
  }, [pathname]);

  const primary = MOBILE_PRIMARY_HREFS.map((href) => NAV.find((n) => n.href === href)).filter(
    (n): n is NonNullable<typeof n> => Boolean(n)
  );
  const overflow = NAV.filter((n) => !MOBILE_PRIMARY_HREFS.includes(n.href));
  const overflowNeedsAttention = overflow.some((n) => n.badge) && actionCount > 0;

  async function logout() {
    setSheetOpen(false);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="lg:hidden shrink-0 bg-slate-900 border-b border-slate-800">
        <div className="h-14 px-2 flex items-center gap-1">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0 ml-1">
            <span className="text-white font-bold text-xs">G</span>
          </div>
          <span className="text-white font-semibold text-sm flex-1 truncate ml-1.5">Georgia CRM</span>
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label={searchOpen ? 'Close search' : 'Search'}
            aria-pressed={searchOpen}
            className={`p-2.5 rounded-lg ${searchOpen ? 'bg-slate-800 text-white' : 'text-slate-400'}`}
          >
            {searchOpen ? <X size={19} /> : <Search size={19} />}
          </button>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="More"
            className="p-2.5 rounded-lg text-slate-400 relative"
          >
            <Menu size={19} />
            {overflowNeedsAttention && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-slate-900" />
            )}
          </button>
        </div>
        {searchOpen && (
          <div className="pb-3 -mt-1">
            <GlobalSearch />
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">{children}</main>

      <nav
        className="lg:hidden shrink-0 bg-slate-900 border-t border-slate-800 flex items-stretch"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {primary.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(pathname, href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-w-0 text-[10.5px] leading-tight ${
                active ? 'text-indigo-400' : 'text-slate-400'
              }`}
            >
              <Icon size={20} />
              <span className="truncate max-w-full px-0.5">{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-w-0 text-[10.5px] leading-tight text-slate-400 relative"
        >
          <Menu size={20} />
          <span>More</span>
          {overflowNeedsAttention && (
            <span className="absolute top-1 right-[30%] w-1.5 h-1.5 rounded-full bg-red-500" />
          )}
        </button>
      </nav>

      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
            className="relative w-full bg-white rounded-t-2xl max-h-[75vh] overflow-y-auto"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-200" />
            <div className="p-2 pb-4">
              {overflow.map(({ href, label, icon: Icon, badge }) => {
                const active = isActive(pathname, href);
                const showDot = badge && actionCount > 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setSheetOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm ${
                      active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="flex-1">{label}</span>
                    {showDot && (
                      <span className="min-w-[1.15rem] h-[1.15rem] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                        {actionCount > 99 ? '99+' : actionCount}
                      </span>
                    )}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-slate-700 w-full mt-1 border-t border-slate-100"
              >
                <LogOut size={18} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
