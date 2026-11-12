'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export type ThemeMode = 'dark' | 'light';

/** Breakpoint that activates the mobile sidebar-drawer behaviour. */
const MOBILE_BREAKPOINT = 900;

interface ShellContextType {
  isSidebarHidden: boolean;
  isMobile: boolean;
  toggleSidebar: () => void;
  setSidebarHidden: (hidden: boolean) => void;
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ShellContext = createContext<ShellContextType>({
  isSidebarHidden: false,
  isMobile: false,
  toggleSidebar: () => {},
  setSidebarHidden: () => {},
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
});

export function useSidebar() {
  return useContext(ShellContext);
}

export function useTheme() {
  const { theme, toggleTheme, setTheme } = useContext(ShellContext);
  return { theme, toggleTheme, setTheme };
}

export function ThemeToggle({
  className = '',
  style = {},
  compact = false,
}: {
  className?: string;
  style?: React.CSSProperties;
  compact?: boolean;
}) {
  const { theme, toggleTheme } = useContext(ShellContext);
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`btn-theme-toggle ${className}`}
      style={style}
      title={`Switch to ${theme === 'dark' ? 'White (Light)' : 'Dark'} mode`}
      aria-label="Toggle theme mode"
    >
      <span className="theme-toggle-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
    </button>
  );
}

/**
 * Mobile hamburger button — only visible on screens ≤ 900 px.
 * Placed inside the topbar so the user always has a way to open the drawer.
 */
export function MobileMenuButton() {
  const { toggleSidebar } = useContext(ShellContext);
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className="btn-mobile-menu"
      aria-label="Open navigation menu"
      title="Open navigation menu"
    >
      <span className="bar" />
      <span className="bar" />
      <span className="bar" />
    </button>
  );
}

export function HubShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isSidebarHidden, setIsSidebarHidden] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  // Track whether the initial mobile detection has happened to avoid SSR mismatch.
  const mobileInitialized = useRef(false);

  // ── Detect mobile and auto-hide sidebar on small screens ───────────────
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);

    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const nowMobile = e.matches;
      setIsMobile(nowMobile);

      if (!mobileInitialized.current) {
        mobileInitialized.current = true;
        // On first detection: on mobile start hidden (drawer closed).
        if (nowMobile) {
          setIsSidebarHidden(true);
          return;
        }
        // On desktop: restore persisted preference.
        try {
          const stored = localStorage.getItem('sentinel_sidebar_hidden');
          if (stored !== null) setIsSidebarHidden(stored === 'true');
        } catch {
          // Ignore
        }
        return;
      }

      // Crossing the breakpoint during use: auto-close when going mobile.
      if (nowMobile) setIsSidebarHidden(true);
    };

    handleChange(mq); // initial check
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // ── Theme initialisation ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem('sentinel_theme') as ThemeMode | null;
      if (storedTheme === 'light' || storedTheme === 'dark') {
        setThemeState(storedTheme);
        document.documentElement.setAttribute('data-theme', storedTheme);
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // ── Keyboard shortcut: Ctrl+B / Cmd+B ─────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarHidden((prev) => {
          const next = !prev;
          try {
            // Only persist desktop preference; mobile state is ephemeral.
            if (!isMobile) localStorage.setItem('sentinel_sidebar_hidden', String(next));
          } catch {
            // Ignore
          }
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile]);

  // ── Auto-close drawer on navigation (mobile only) ─────────────────────
  useEffect(() => {
    if (isMobile) setIsSidebarHidden(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ── Sidebar toggle ─────────────────────────────────────────────────────
  const toggleSidebar = useCallback(() => {
    setIsSidebarHidden((prev) => {
      const next = !prev;
      try {
        if (!isMobile) localStorage.setItem('sentinel_sidebar_hidden', String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, [isMobile]);

  const setSidebarHidden = useCallback(
    (hidden: boolean) => {
      setIsSidebarHidden(hidden);
      try {
        if (!isMobile) localStorage.setItem('sentinel_sidebar_hidden', String(hidden));
      } catch {
        // Ignore
      }
    },
    [isMobile],
  );

  // ── Theme helpers ──────────────────────────────────────────────────────
  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    try {
      localStorage.setItem('sentinel_theme', newTheme);
    } catch {
      // Ignore
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  }, [theme, setTheme]);

  return (
    <ShellContext.Provider
      value={{ isSidebarHidden, isMobile, toggleSidebar, setSidebarHidden, theme, toggleTheme, setTheme }}
    >
      <div className={`shell ${isSidebarHidden ? 'sidebar-hidden' : ''}`}>
        <Sidebar />
        {/* Backdrop: tapping it closes the drawer on mobile */}
        {!isSidebarHidden && isMobile && (
          <div
            className="sidebar-backdrop"
            role="presentation"
            aria-hidden="true"
            onClick={toggleSidebar}
          />
        )}
        <div className="main">{children}</div>
      </div>
    </ShellContext.Provider>
  );
}
