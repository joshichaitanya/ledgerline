// user_id and subcategory_id used to be REFERENCES to users(id)/subcategories(id),
// but those tables now live in a separate database (reference-db), and Postgres
// can't enforce a foreign key across two different databases. Referential
// integrity for these two columns is now the application's responsibility
// (db-writer-service must check the IDs it's given are real), not the DB's.
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE transactions (
      id                uuid PRIMARY KEY,
      user_id           integer NOT NULL,
      subcategory_id    uuid NOT NULL,
      amount            numeric(12,2) NOT NULL,
      description       text,
      transaction_date  timestamptz NOT NULL
    );

    CREATE INDEX transactions_user_id_idx ON transactions (user_id);
    CREATE INDEX transactions_subcategory_id_idx ON transactions (subcategory_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS transactions;
  `);
};
