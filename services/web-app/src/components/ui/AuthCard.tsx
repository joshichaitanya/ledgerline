import Head from 'next/head';
import { pageTitle } from '../../lib/pageTitle';
import styles from './AuthCard.module.css';

export function AuthCard({
  title,
  subtitle,
  error,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  error?: string | null;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <Head>
          <title>{pageTitle(title)}</title>
        </Head>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.form}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
