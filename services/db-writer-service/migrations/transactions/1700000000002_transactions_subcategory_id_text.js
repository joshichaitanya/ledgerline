// subcategory_id was uuid, matching reference-db's subcategories.id - but
// that's not what the app actually sends today. web-app's category picker
// uses get-categories-service's mock ids ('groceries', 'fuel', ...), so a
// uuid column made db-writer-service's insert fail on every real
// transaction (and retry it forever, blocking its Kafka partition).
//
// text matches what's sent today. Revisit once categories come from
// reference-db with real uuids (docs/TODO.md item 9).
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE transactions ALTER COLUMN subcategory_id TYPE text;
  `);
};

// Fails if any row holds a non-uuid subcategory_id (e.g. 'groceries') -
// those rows would have to be fixed or removed first.
exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE transactions ALTER COLUMN subcategory_id TYPE uuid USING subcategory_id::uuid;
  `);
};
