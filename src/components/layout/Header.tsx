import { Monitor, Moon, Sun, Layers2, ArrowUpRight } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { useEffect, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/primitives';

export function Header() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    let isCompact = false;
    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      // Separate thresholds prevent flickering when scrolling near the transition point.
      const next = window.scrollY > 48 ? true : window.scrollY <= 8 ? false : isCompact;
      if (next !== isCompact) {
        isCompact = next;
        setCompact(next);
      }
    };
    const onScroll = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, []);
  const { pref, cycle } = useTheme();
  const Icon = pref === 'dark' ? Moon : pref === 'system' ? Monitor : Sun;
  const next = pref === 'light' ? 'dark' : pref === 'dark' ? 'system' : 'light';
  return (
    <div className="h-20 shrink-0">
      <header
        className="site-header fixed inset-x-0 top-0 z-40 border-b border-border bg-surface/95 backdrop-blur-md"
        data-compact={compact}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <div className="site-header-inner mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-base font-bold tracking-tight sm:text-lg"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-fg">
              <Layers2 className="size-5" aria-hidden />
            </span>
            <span>
              Media Toolkit<span className="text-accent">.</span>
            </span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-5">
            <NavLink
              to="/"
              end
              className="hidden min-h-11 items-center text-sm font-medium text-muted hover:text-text aria-[current=page]:text-accent sm:inline-flex"
            >
              Workspace
            </NavLink>
            <NavLink
              to="/formats"
              className="inline-flex min-h-11 items-center gap-1 text-xs text-muted hover:text-text sm:text-sm"
            >
              Formats <ArrowUpRight className="size-3.5" aria-hidden />
            </NavLink>
            <Button
              variant="ghost"
              onClick={cycle}
              aria-label={`Theme: ${pref}. Switch to ${next}.`}
              title={`Theme: ${pref}`}
              icon={<Icon className="size-4" aria-hidden />}
            />
          </nav>
        </div>
      </header>
    </div>
  );
}
