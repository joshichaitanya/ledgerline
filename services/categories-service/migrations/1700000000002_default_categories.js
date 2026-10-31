// The shared default categories everyone sees (user_id NULL) - replaces the
// old seed script (db-writer-service/scripts/seed.ts), so every environment
// gets the same list, with the same ids, just by migrating (docs/adr/0015).
//
// Ids are the ones the seed script used (from
// create-transaction-service/src/data/categories.json), so a database that
// was already seeded keeps them - ON CONFLICT DO NOTHING skips rows that
// exist. Inserted one by one, in order, so created_at keeps this order.
const DEFAULTS = [
  ['0cb7dfea-2a07-445d-841b-0a56f42dd4f2', 'Food & Dining', [
    ['47b4e756-585b-4706-b635-1bc67cd0827d', 'Groceries'],
    ['856c18d0-8536-4f1d-bb08-ed7e538cdabc', 'Restaurants'],
    ['c1419384-01a0-41c8-85ea-6997cf0182df', 'Cafe'],
    ['1f66bf56-0f63-4758-84e8-53532b94d466', 'Food Delivery'],
    ['33e557e3-87d2-4276-87fe-69874a5fc9ab', 'Snacks'],
  ]],
  ['4e005005-08a0-4dca-9bd9-a77162235ed7', 'Transport', [
    ['6798fbef-9e45-423d-aecf-00909b7fb290', 'Fuel'],
    ['bf941785-004b-4f6a-bec2-8ef570654627', 'Public Transport'],
    ['f8a36d3c-5f37-43f7-9c6e-8551728cb6cb', 'Cab / Taxi'],
    ['aac07dcc-0a5e-4f50-8fdd-4c3135f73620', 'Parking'],
    ['e4e3b440-074d-4540-a072-fec4c067873c', 'Tolls'],
    ['0d62927f-812a-4e88-bf20-559027cde7c6', 'Vehicle Maintenance'],
  ]],
  ['505e4e1e-af53-4b95-9b9f-c2138d69cc65', 'Shopping', [
    ['386292ad-44e1-4c01-a6de-2b2278565592', 'Clothing'],
    ['dcfc573e-b3d9-459b-9e64-7e9ac6cc983d', 'Electronics'],
    ['925d37e6-566d-4a87-b0ac-9b636b31ea73', 'Home & Kitchen'],
    ['7a5a22c1-1cc3-46d1-ae8e-299cbd4d633d', 'Gifts'],
    ['9f4c4e39-3c11-41af-a8ef-2b265f7c976d', 'Personal Care'],
  ]],
  ['c0a0070d-d5fb-45a3-b6eb-c507288de7e3', 'Bills & Utilities', [
    ['f87cb17e-ee4c-4c55-89a3-482ff26b536a', 'Rent'],
    ['d654fc58-15b2-40ab-803b-6b536a3b864e', 'Electricity'],
    ['e6393f92-9d4e-426d-b0d7-69f8dc7788a6', 'Water'],
    ['72e7bdce-7a1d-41a9-991d-ceee48a6372f', 'Gas'],
    ['39bdd3f2-7068-4b39-9d16-85e01d6d379a', 'Internet'],
    ['14655949-a21f-45d0-a59a-e1c16ad1f958', 'Mobile'],
  ]],
  ['b98edf41-995e-4385-911d-d8ed6c7f1969', 'Health', [
    ['d18ce4d7-9eee-4d25-9b9b-9ad0d1d7ac8e', 'Doctor'],
    ['a6af6ce0-ff1d-45b8-93f5-ec4b1282ec7e', 'Medicine'],
    ['7cc99930-e69e-45d8-a1e2-ad2e07449714', 'Insurance'],
    ['9450f649-1251-48a4-977c-69286ff80ee1', 'Fitness'],
    ['4a3f697f-0f13-4ad2-b91c-1d0cbc887a5e', 'Lab Tests'],
  ]],
  ['83646836-87b0-4b3f-b101-7e1c8c8500e1', 'Entertainment', [
    ['f2b49a2a-5417-45d7-bb80-a23364985948', 'Movies'],
    ['5966d6b5-0f2c-41c0-bdb5-0828c68b49a1', 'OTT Subscriptions'],
    ['2d7d02eb-49f1-41a7-aadb-8e5ce29d9c9f', 'Gaming'],
    ['b1631293-8ec5-4166-940f-7ccd0eba47d6', 'Events'],
    ['f8964585-f06d-421f-b1ae-a827e96b2d25', 'Books'],
  ]],
  ['45179d44-ac56-4b1b-94ed-60b2574fc7fb', 'Travel', [
    ['c4132f4a-f649-4ea1-a186-103662c6a848', 'Flights'],
    ['382350c2-c583-454c-b162-4a96240ef0ea', 'Hotels'],
    ['c02b54cc-c730-4a72-a65c-71d08748cbb1', 'Local Transport'],
    ['a3e98369-da4c-45ca-b9b2-1a6f84562694', 'Activities'],
    ['32dcb091-59f3-48e4-b74b-d5eea01a8c0b', 'Visa'],
  ]],
  ['380e4edc-a2ac-4090-b181-8418bcec3180', 'Education', [
    ['4b50dd8b-0901-49f4-bcb9-78d2eb72bab0', 'Courses'],
    ['393e3315-5786-42e4-b2ad-dc77524cf183', 'Books'],
    ['564f3766-cc66-42d6-8e4b-3697a1b2bf7a', 'Certifications'],
    ['719a89ed-533a-4be2-a51a-3b58b573b894', 'Software'],
  ]],
  ['42efeb5d-82dd-41df-8d98-f2b06faa55d9', 'Family', [
    ['2b02579b-f8b3-4ed0-822d-e81b2e83fabb', 'Kids'],
    ['76e1ab66-02ad-4f7b-8c26-7bdef644cb78', 'Parents'],
    ['4d9c1832-2696-478f-a209-959bf419567c', 'Pets'],
    ['7476c61c-b238-4441-a761-574c12c5bec9', 'Household'],
  ]],
  ['8b86c076-8c2c-46eb-9dcc-daa3fb7c672a', 'Finance', [
    ['90ec34d9-e7de-408f-8b8d-f2835b6a07ff', 'Loan EMI'],
    ['79c5f02b-5740-458a-b194-823613448922', 'Investment'],
    ['0808258c-29d7-422e-a42f-1c86486e093e', 'Tax'],
    ['48b822fd-c687-40a7-b735-d071c059e9ee', 'Bank Charges'],
  ]],
  ['677297cb-10a3-4c36-ba6c-1fcf05a24868', 'Income', [
    ['a5a4e057-9866-4df0-a470-7fa1eda5bed1', 'Salary'],
    ['03e350d3-48f4-48e8-add0-72ce09fd72b0', 'Bonus'],
    ['2c4dee52-df18-4020-857a-c147f4438ad4', 'Freelance'],
    ['59178cc0-effd-4e80-901f-16415f13e5c7', 'Interest'],
    ['402270ce-11f2-4b9d-a2a3-baf6915d0ac6', 'Refund'],
    ['b5927511-786e-4284-94b0-a8173208d71d', 'Other Income'],
  ]],
  ['df44bd78-a8fb-4f0e-9314-7420588fee1f', 'Other', [
    ['4d261f80-6209-4cf8-a633-fc3ed859b9c7', 'Donation'],
    ['daecf4e3-a5a1-452a-a5bf-09596eefdd80', 'Fees'],
    ['f324bb0f-7412-48fd-92c0-46582e7efda9', 'Miscellaneous'],
  ]],
];

// node-pg-migrate's pgm.sql takes no query parameters, so values are
// embedded - safe here because every value is a fixed literal in this file.
const quote = (s) => `'${s.replace(/'/g, "''")}'`;

exports.up = (pgm) => {
  for (const [id, name, subcategories] of DEFAULTS) {
    pgm.sql(`INSERT INTO categories (id, name) VALUES (${quote(id)}, ${quote(name)}) ON CONFLICT (id) DO NOTHING;`);
    for (const [subId, subName] of subcategories) {
      pgm.sql(
        `INSERT INTO subcategories (id, category_id, name) VALUES (${quote(subId)}, ${quote(id)}, ${quote(subName)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
  }
};

exports.down = (pgm) => {
  const ids = DEFAULTS.map(([id]) => quote(id)).join(', ');
  pgm.sql(`
    DELETE FROM subcategories WHERE category_id IN (${ids}) AND user_id IS NULL;
    DELETE FROM categories WHERE id IN (${ids}) AND user_id IS NULL;
  `);
};
