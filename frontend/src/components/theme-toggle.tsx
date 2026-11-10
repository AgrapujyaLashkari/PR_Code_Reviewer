'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dark = mounted && resolvedTheme === 'dark';

  return (
    <button
      type="button"
      className={cn('btn btn-ghost btn-square', className)}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      disabled={!mounted}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
    </button>
  );
}
