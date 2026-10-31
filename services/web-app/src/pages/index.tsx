import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAnnualReport } from '../lib/reports';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { PageHeader } from '../components/PageHeader';
import { SummaryPanel } from '../components/ui/SummaryPanel';
import tableStyles from '../components/ui/Table.module.css';
import styles from './index.module.css';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export default function Home() {
  const { ready } = useRequireAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const { data: report, isLoading } = useQuery({
    queryKey: ['annual-report', year],
    queryFn: () => fetchAnnualReport(year),
    enabled: ready,
  });

  const total = report?.monthly.reduce((sum, m) => sum + m.total, 0) ?? 0;
  const maxMonth = Math.max(1, ...(report?.monthly.map((m) => m.total) ?? [0]));

  if (!ready) {
    return null;
  }

  return (
    <div>
      <div className={styles.row}>
        <PageHeader title="Dashboard" subtitle="Your yearly spending at a glance" />
        <SummaryPanel label={`Total Spent in ${year}`} value={`₹${total.toFixed(2)}`} />
      </div>

      <div className={styles.yearPicker}>
        {/* No visible <label> - aria-label stops it being just "combo box". */}
        <select
          aria-label="Year"
          className={styles.select}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p>Loading...</p>}

      {report && total === 0 && <p>No transactions in {year}.</p>}

      {report && total > 0 && (
        <>
          <h2 className={styles.sectionTitle}>Monthly Trend</h2>
          <div className={styles.monthlyList}>
            {report.monthly.map(({ month, total: monthTotal }) => (
              <div key={month} className={styles.monthRow}>
                <span className={styles.monthLabel}>{MONTH_NAMES[month]}</span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{ width: `${(monthTotal / maxMonth) * 100}%` }}
                  />
                </div>
                <span className={styles.monthValue}>₹{monthTotal.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <h2 className={styles.sectionTitle}>Spend by Category</h2>
          <table className={tableStyles.table}>
            <thead>
              <tr className={tableStyles.headRow}>
                <th>Category</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {report.byCategory.map((row) => (
                <tr key={row.category} className={tableStyles.row}>
                  <td>{row.category}</td>
                  <td>₹{row.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
