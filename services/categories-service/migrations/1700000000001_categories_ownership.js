// Shared defaults + each user's own categories (docs/adr/0015).
//
// - user_id: NULL = a shared default everyone sees; otherwise the auth-db
//   account id of the one user who added it (docs/adr/0012). No foreign key:
//   accounts live in a different database (auth-db).
// - created_at uses clock_timestamp() (not now()) so rows inserted in one
//   statement still get distinct, increasing times - it's what keeps the
//   list in a stable order (defaults in the order they were added).
// - The unique indexes stop the same user adding the same name twice
//   (case-insensitive). COALESCE(user_id, 0): auth-db ids start at 1, so 0
//   stands for "shared default". Clashing with a *default's* name is
//   checked by the service itself (one index can't span both scopes).
// - reference-db's demo `users` table is dropped: the auth-db account id is
//   the one user id now (docs/adr/0012), and nothing reads it any more.
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE categories
      ADD COLUMN user_id    integer,
      ADD COLUMN created_at timestamptz NOT NULL DEFAULT clock_timestamp();

    ALTER TABLE subcategories
      ADD COLUMN user_id    integer,
      ADD COLUMN created_at timestamptz NOT NULL DEFAULT clock_timestamp();

    CREATE UNIQUE INDEX categories_name_per_owner_idx
      ON categories (COALESCE(user_id, 0), lower(name));
    CREATE UNIQUE INDEX subcategories_name_per_owner_idx
      ON subcategories (category_id, COALESCE(user_id, 0), lower(name));

    CREATE INDEX subcategories_category_id_idx ON subcategories (category_id);

    DROP TABLE users;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    CREATE TABLE users (
      id      integer PRIMARY KEY,
      name    text NOT NULL,
      email   text NOT NULL,
      phone   text,
      city    text,
      country text
    );

    DROP INDEX subcategories_category_id_idx;
    DROP INDEX subcategories_name_per_owner_idx;
    DROP INDEX categories_name_per_owner_idx;

    DELETE FROM subcategories WHERE user_id IS NOT NULL;
    DELETE FROM categories WHERE user_id IS NOT NULL;

    ALTER TABLE subcategories DROP COLUMN created_at, DROP COLUMN user_id;
    ALTER TABLE categories DROP COLUMN created_at, DROP COLUMN user_id;
  `);
};
