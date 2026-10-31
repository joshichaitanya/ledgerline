import styles from './SummaryPanel.module.css';

export function SummaryPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.panel}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
  );
}
