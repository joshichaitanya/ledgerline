import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSpendingReport } from '../lib/reports';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { PageHeader } from '../components/PageHeader';
import tableStyles from '../components/ui/Table.module.css';
import styles from './view-reports.module.css';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export default function ViewReports() {
  const { ready } = useRequireAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const { data: report, isLoading } = useQuery({
    queryKey: ['spending-report', month, year],
    queryFn: () => fetchSpendingReport(month, year),
    enabled: ready,
  });

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  if (!ready) {
    return null;
  }

  return (
    <div>
      <PageHeader title="View Reports" subtitle="Spending by category" />

      <div className={styles.monthYearPicker}>
        {/* aria-label: there's no visible <label>, so without it a screen
            reader would announce these only as "combo box". */}
        <select
          aria-label="Month"
          className={styles.select}
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
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
      {report && (
        <table className={tableStyles.table}>
          <thead>
            <tr className={tableStyles.headRow}>
              <th>Category</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {report.map((row) => (
              <tr key={row.category} className={tableStyles.row}>
                <td>{row.category}</td>
                <td>₹{row.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {report && report.length === 0 && <p>No transactions in this month.</p>}
    </div>
  );
}
