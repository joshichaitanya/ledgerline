import { formatDDMMMYYYY, isSameDay, toDateInputValue } from '../lib/formatDate';
import styles from './DateNav.module.css';

export function DateNav({
  date,
  onChange,
}: {
  date: Date;
  onChange: (date: Date) => void;
}) {
  const today = new Date();
  const isToday = isSameDay(date, today);

  function shiftDay(delta: number) {
    const next = new Date(date);
    next.setDate(date.getDate() + delta);
    if (next > today && !isSameDay(next, today)) return;
    onChange(next);
  }

  return (
    <div className={styles.nav}>
      <button className={styles.arrowButton} onClick={() => shiftDay(-1)} aria-label="Previous day">
        <ChevronLeftIcon />
      </button>

      <div className={styles.dateDisplay}>
        <span>{formatDDMMMYYYY(date)}</span>
        <input
          type="date"
          aria-label="Choose date"
          className={styles.hiddenInput}
          value={toDateInputValue(date)}
          max={toDateInputValue(today)}
          onChange={(e) => {
            if (e.target.value) {
              const [year, month, day] = e.target.value.split('-').map(Number);
              const next = new Date(year, month - 1, day);
              if (next > today && !isSameDay(next, today)) return;
              onChange(next);
            }
          }}
        />
      </div>

      <button
        className={styles.arrowButton}
        onClick={() => shiftDay(1)}
        aria-label="Next day"
        disabled={isToday}
      >
        <ChevronRightIcon />
      </button>

      <button className={styles.todayButton} onClick={() => onChange(new Date())}>
        Today
      </button>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
