// Moved unchanged from db-writer-service/migrations/reference/ when
// categories-service took over reference-db (docs/adr/0015). Same file name
// and same `reference_migrations` table, so a database that already ran it
// there won't run it again. Later migrations change it (user_id columns,
// dropping `users`) - this one stays as it was.
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE categories (
      id    uuid PRIMARY KEY,
      name  text NOT NULL
    );

    CREATE TABLE subcategories (
      id          uuid PRIMARY KEY,
      category_id uuid NOT NULL REFERENCES categories(id),
      name        text NOT NULL
    );

    CREATE TABLE users (
      id      integer PRIMARY KEY,
      name    text NOT NULL,
      email   text NOT NULL,
      phone   text,
      city    text,
      country text
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS subcategories;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS categories;
  `);
};
