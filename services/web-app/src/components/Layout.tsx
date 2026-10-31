import { useState } from 'react';
import { Sidebar, SIDEBAR_ID } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import styles from './Layout.module.css';

const MAIN_ID = 'main-content';

export function Layout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={styles.page}>
      {/* First thing Tab reaches: lets keyboard users jump past the sidebar
          nav straight to the page's content. Hidden until focused. */}
      <a href={`#${MAIN_ID}`} className={styles.skipLink}>
        Skip to content
      </a>
      <div className={styles.frame}>
        <div className={styles.accentCard} />
        <div className={styles.mainCard}>
          <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className={styles.content}>
            <div className={styles.topBar}>
              <button
                className={styles.hamburger}
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
                aria-expanded={isSidebarOpen}
                aria-controls={SIDEBAR_ID}
              >
                <HamburgerIcon />
              </button>
              <div style={{ flex: 1 }} />
              <ThemeToggle />
            </div>
            {/* tabIndex -1 so the skip link can move focus here, not just scroll. */}
            <main id={MAIN_ID} tabIndex={-1} className={styles.main}>
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
    </svg>
  );
}
