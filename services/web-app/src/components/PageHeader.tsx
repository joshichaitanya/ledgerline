import Head from 'next/head';
import { pageTitle } from '../lib/pageTitle';
import styles from './PageHeader.module.css';

// The page's main heading - every page renders exactly one PageHeader, so
// it's the <h1> screen reader users jump to when navigating by heading. It
// also sets the browser tab's <title> to match.
export function PageHeader({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`${styles.section} ${className || ''}`}>
      <Head>
        <title>{pageTitle(title)}</title>
      </Head>
      <h1 className={styles.title}>{title}</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  );
}
