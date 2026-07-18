import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../lib/theme-provider';

const themeConfig = {
  light: { icon: Sun, label: 'Light', next: 'dark' },
  dark: { icon: Moon, label: 'Dark', next: 'light' },
} as const;

/**
 * Theme toggle button that cycles between light and dark modes.
 */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-secondary)] bg-os-surface-dark/50"
        aria-hidden="true"
      >
        <div className="h-5 w-5 animate-pulse rounded bg-[var(--bg-tertiary)]" />
      </div>
    );
  }

  const { icon: Icon, label, next } = themeConfig[theme];

  return (
    <button
      onClick={() => setTheme(next)}
      className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-secondary)] bg-os-surface-dark/50 text-os-text-secondary-dark transition-colors duration-200 hover:border-[var(--fg-tertiary)] hover:text-os-text-primary-dark"
      aria-label={`Theme: ${label}. Click to switch to ${themeConfig[next].label} mode`}
      title={`${label} mode`}
      type="button"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={theme}
          initial={{ opacity: 0, rotate: -90, scale: 0.8 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.8 }}
          transition={{
            duration: 0.2,
            ease: [0.4, 0, 0.2, 1],
          }}
        >
          <Icon className="h-5 w-5" />
        </motion.div>
      </AnimatePresence>
    </button>
  );
}
