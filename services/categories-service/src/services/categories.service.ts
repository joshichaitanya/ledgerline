import { randomUUID } from 'crypto';
import { pool } from '../db';
import { Category, Subcategory } from '../types/category';

// Shared defaults (user_id NULL) plus the user's own - see
// docs/adr/0015-categories-shared-defaults-plus-custom.md.

// Thrown for the API's expected failures, so the route can map them to a status.
export class CategoryError extends Error {
  constructor(
    readonly status: 404 | 409,
    message: string
  ) {
    super(message);
  }
}

interface Row {
  category_id: string;
  category_name: string;
  category_user_id: number | null;
  subcategory_id: string | null;
  subcategory_name: string | null;
  subcategory_user_id: number | null;
}

// Every category the user can see, each with the subcategories the user can
// see - in the order they were added (defaults first, as they're oldest).
export async function listCategories(userId: number): Promise<Category[]> {
  const { rows } = await pool.query<Row>(
    `SELECT c.id AS category_id, c.name AS category_name, c.user_id AS category_user_id,
            s.id AS subcategory_id, s.name AS subcategory_name, s.user_id AS subcategory_user_id
     FROM categories c
     LEFT JOIN subcategories s
       ON s.category_id = c.id AND (s.user_id IS NULL OR s.user_id = $1)
     WHERE c.user_id IS NULL OR c.user_id = $1
     ORDER BY c.created_at, c.id, s.created_at, s.id`,
    [userId]
  );

  const byId = new Map<string, Category>();
  for (const row of rows) {
    let category = byId.get(row.category_id);
    if (!category) {
      category = { id: row.category_id, name: row.category_name, custom: row.category_user_id !== null, subcategories: [] };
      byId.set(row.category_id, category);
    }
    if (row.subcategory_id) {
      category.subcategories.push({
        id: row.subcategory_id,
        name: row.subcategory_name!,
        custom: row.subcategory_user_id !== null,
      });
    }
  }
  return [...byId.values()];
}

const isUniqueViolation = (error: unknown) => (error as { code?: string }).code === '23505';

// The NOT EXISTS stops a name that clashes (case-insensitively) with one the
// user can already see - a default or their own. The unique index
// (migrations/1700000000001) only covers their own, and also catches two
// identical requests racing each other.
export async function createCategory(userId: number, name: string): Promise<Category> {
  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO categories (id, name, user_id)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM categories WHERE lower(name) = lower($2) AND (user_id IS NULL OR user_id = $3)
       )
       RETURNING id`,
      [randomUUID(), name, userId]
    );
    if (rows.length === 0) throw new CategoryError(409, `A category named "${name}" already exists`);
    return { id: rows[0].id, name, custom: true, subcategories: [] };
  } catch (error) {
    if (isUniqueViolation(error)) throw new CategoryError(409, `A category named "${name}" already exists`);
    throw error;
  }
}

// Allowed under a default category or one of the user's own - not under
// another user's (to this user, that one doesn't exist: 404, not 403, so
// its existence isn't revealed).
export async function createSubcategory(userId: number, categoryId: string, name: string): Promise<Subcategory> {
  const { rows: visible } = await pool.query(
    `SELECT 1 FROM categories WHERE id = $1 AND (user_id IS NULL OR user_id = $2)`,
    [categoryId, userId]
  );
  if (visible.length === 0) throw new CategoryError(404, 'Category not found');

  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO subcategories (id, category_id, name, user_id)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM subcategories
         WHERE category_id = $2 AND lower(name) = lower($3) AND (user_id IS NULL OR user_id = $4)
       )
       RETURNING id`,
      [randomUUID(), categoryId, name, userId]
    );
    if (rows.length === 0) throw new CategoryError(409, `A subcategory named "${name}" already exists in this category`);
    return { id: rows[0].id, name, custom: true };
  } catch (error) {
    if (isUniqueViolation(error)) throw new CategoryError(409, `A subcategory named "${name}" already exists in this category`);
    throw error;
  }
}
