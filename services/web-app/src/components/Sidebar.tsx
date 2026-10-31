import Link from 'next/link';
import { useRouter } from 'next/router';
import { useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import styles from './Sidebar.module.css';

export const SIDEBAR_ID = 'sidebar';

// `public: true` items show regardless of login state; everything else is
// account-specific data and only makes sense once logged in.
const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: HomeIcon, public: false },
  { href: '/view-transactions', label: 'View Transactions', icon: ListIcon, public: false },
  { href: '/view-reports', label: 'View Reports', icon: ChartIcon, public: false },
  { href: '/about', label: 'About Us', icon: InfoIcon, public: true },
];

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const { user, logOut } = useAuth();
  const sidebarRef = useRef<HTMLElement>(null);

  // isOpen is only ever true on mobile (the hamburger is hidden on desktop,
  // where the sidebar is always visible). Opened, it behaves like a dialog:
  // focus moves in and stays in, Escape closes it, focus returns to the hamburger.
  useFocusTrap(sidebarRef, isOpen, onClose);

  async function handleLogout() {
    await logOut();
    onClose();
    router.push('/login');
  }

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}
      <aside
        ref={sidebarRef}
        id={SIDEBAR_ID}
        tabIndex={-1}
        className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}
        {...(isOpen ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Menu' } : {})}
      >
        <button className={styles.closeButton} onClick={onClose} aria-label="Close menu">
          <CloseIcon />
        </button>

        {user ? (
          <div className={styles.profile}>
            <div className={styles.avatar}>{initials(user.name)}</div>
            <div>
              <div className={styles.name}>{user.name}</div>
              <div className={styles.handle}>{user.email}</div>
            </div>
          </div>
        ) : (
          <div className={styles.profile}>
            <div>
              <div className={styles.name}>Not logged in</div>
              <Link href="/login" onClick={onClose} className={styles.handle}>
                Log in
              </Link>
            </div>
          </div>
        )}

        <nav className={styles.nav}>
          {NAV_ITEMS.filter((item) => item.public || user).map(({ href, label, icon: Icon }) => {
            const isActive = router.pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
              >
                <Icon className={styles.icon} />
                {label}
              </Link>
            );
          })}
          {user && (
            <Link
              href="/change-password"
              onClick={onClose}
              className={`${styles.navItem} ${router.pathname === '/change-password' ? styles.navItemActive : ''}`}
            >
              <KeyIcon className={styles.icon} />
              Change Password
            </Link>
          )}
        </nav>

        {user ? (
          <button className={styles.logout} onClick={handleLogout}>
            <LogoutIcon className={styles.icon} />
            Log out
          </button>
        ) : (
          <Link href="/register" onClick={onClose} className={styles.logout}>
            <LogoutIcon className={styles.icon} />
            Sign up
          </Link>
        )}
      </aside>
    </>
  );
}

function HomeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M3 11l9-8 9 8M5 10v10h14V10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ListIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M3 3v18h18M7 15v3M12 10v8M17 6v12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KeyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.5 12.5 20 3M17 6l2 2M14 9l2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}
