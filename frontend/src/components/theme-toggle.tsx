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

  if (!mounted) {
    return (
      <button
        type="button"
        className={cn('btn btn-ghost btn-square', className)}
        aria-label="Toggle theme"
        disabled
      />
    );
  }

  return (
    <button
      type="button"
      className={cn(
        'swap swap-rotate btn btn-ghost btn-square',
        dark && 'swap-active',
        className,
      )}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      <Sun aria-hidden className="swap-on size-4" />
      <Moon aria-hidden className="swap-off size-4" />
    </button>
  );
}
