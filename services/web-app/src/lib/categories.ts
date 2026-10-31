import { Category, Subcategory } from '../types/category';
import { API_GATEWAY_URL } from './api';
import { authFetch } from './authFetch';

// categories-service: shared defaults plus the user's own (docs/adr/0015).
// The user comes from the access token authFetch sends - never sent here.

// The server's own message (e.g. 'A category named "X" already exists'),
// so the form can show it as-is.
async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.error === 'string') return body.error;
  } catch {
    // not JSON - use the fallback
  }
  return fallback;
}

export async function createCategory(name: string): Promise<Category> {
  const response = await authFetch(`${API_GATEWAY_URL}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response, `Failed to create category: ${response.status}`));
  }

  return response.json();
}

export async function createSubcategory(categoryId: string, name: string): Promise<Subcategory> {
  const response = await authFetch(`${API_GATEWAY_URL}/categories/${categoryId}/subcategories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response, `Failed to create subcategory: ${response.status}`));
  }

  return response.json();
}

export async function fetchCategories(): Promise<Category[]> {
  const response = await authFetch(`${API_GATEWAY_URL}/categories`);

  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.status}`);
  }

  return response.json();
}

export function findCategoryBySubcategoryId(
  categories: Category[],
  subCategoryId: string
): { category: Category; subcategory: Category['subcategories'][number] } | null {
  for (const category of categories) {
    const subcategory = category.subcategories.find((sub) => sub.id === subCategoryId);
    if (subcategory) {
      return { category, subcategory };
    }
  }
  return null;
}
