// Columns the Operation consumer (src/index.ts) needs to apply events
// idempotently and tombstone-checked - see docs/adr/0009 and docs/adr/0010.
//
// last_event_at defaults to '-infinity' (not NULL) so rows written before this
// migration - e.g. by the older transaction-consumer-service - still compare
// as "older than any real event" without needing NULL handling.
//
// A delete can arrive for an id with no row yet, and still has to leave a
// tombstone behind (ADR 0009) - so subcategory_id/amount/transaction_date
// become nullable, but the CHECK keeps them required on every live row.
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE transactions
      ADD COLUMN deleted_at    timestamptz,
      ADD COLUMN last_event_at timestamptz NOT NULL DEFAULT '-infinity',
      ALTER COLUMN subcategory_id   DROP NOT NULL,
      ALTER COLUMN amount           DROP NOT NULL,
      ALTER COLUMN transaction_date DROP NOT NULL,
      ADD CONSTRAINT transactions_live_rows_complete CHECK (
        deleted_at IS NOT NULL
        OR (subcategory_id IS NOT NULL AND amount IS NOT NULL AND transaction_date IS NOT NULL)
      );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM transactions WHERE deleted_at IS NOT NULL;

    ALTER TABLE transactions
      DROP CONSTRAINT transactions_live_rows_complete,
      ALTER COLUMN subcategory_id   SET NOT NULL,
      ALTER COLUMN amount           SET NOT NULL,
      ALTER COLUMN transaction_date SET NOT NULL,
      DROP COLUMN last_event_at,
      DROP COLUMN deleted_at;
  `);
};
