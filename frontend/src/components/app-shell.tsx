'use client';

import { FolderGit2, LayoutDashboard, LogOut, Menu, Plus, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/ui/logo';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Reviews', icon: LayoutDashboard },
  { href: '/repos', label: 'Repositories', icon: FolderGit2 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({
  email,
  onSignOut,
  children,
}: {
  email: string;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerId = 'app-drawer';
  const initial = email.trim().charAt(0).toUpperCase() || '?';

  function close() {
    setOpen(false);
  }

  return (
    <div className="drawer lg:drawer-open min-h-screen">
      <input
        id={drawerId}
        type="checkbox"
        className="drawer-toggle"
        checked={open}
        onChange={(event) => setOpen(event.target.checked)}
      />

      <div className="drawer-content bg-base-200 flex min-h-screen flex-col">
        <header className="navbar bg-base-100/90 border-base-300 sticky top-0 z-30 min-h-14 border-b backdrop-blur-md lg:hidden">
          <div className="navbar-start">
            <label
              htmlFor={drawerId}
              className="btn btn-ghost btn-square drawer-button"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </label>
          </div>
          <div className="navbar-center">
            <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Logo size={18} />
              ReviewPulse
            </Link>
          </div>
          <div className="navbar-end gap-1">
            <ThemeToggle />
            <Link href="/reviews/new" className="btn btn-primary btn-square" aria-label="New review">
              <Plus className="size-4" />
            </Link>
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>

      <div className="drawer-side z-40">
        <label htmlFor={drawerId} aria-label="Close menu" className="drawer-overlay" />
        <aside className="bg-base-100 border-base-300 flex min-h-full w-[var(--sidebar-width)] flex-col border-r">
          <div className="flex h-16 items-center px-5">
            <Link href="/dashboard" onClick={close} className="flex items-center gap-2.5">
              <Logo size={22} />
              <span className="text-[0.9375rem] font-semibold tracking-tight">ReviewPulse</span>
            </Link>
          </div>

          <ul className="menu w-full gap-0.5 px-3">
            {NAV.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`) ||
                (item.href === '/dashboard' && pathname.startsWith('/reviews'));
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={active ? 'page' : undefined}
                    className={cn('rounded-field', active && 'menu-active')}
                  >
                    <Icon aria-hidden className="size-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="px-3 pt-3">
            <Link href="/reviews/new" onClick={close} className="btn btn-primary btn-block">
              <Plus aria-hidden className="size-4" />
              New review
            </Link>
          </div>

          <div className="flex-1" />

          <div className="border-base-300 mx-3 mb-3 rounded-box border p-2">
            <div className="flex items-center gap-2">
              <div className="avatar avatar-placeholder">
                <div className="bg-primary text-primary-content w-9 rounded-full text-sm font-medium">
                  <span>{initial}</span>
                </div>
              </div>
              <p className="text-muted min-w-0 flex-1 truncate text-xs" title={email}>
                {email}
              </p>
              <ThemeToggle className="hidden lg:inline-flex" />
              <div className="tooltip tooltip-left" data-tip="Sign out">
                <button
                  type="button"
                  className="btn btn-ghost btn-square btn-sm"
                  aria-label="Sign out"
                  onClick={onSignOut}
                >
                  <LogOut aria-hidden className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
