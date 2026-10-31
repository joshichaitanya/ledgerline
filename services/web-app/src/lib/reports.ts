import { Category } from '../types/category';
import { API_GATEWAY_URL } from './api';
import { authFetch } from './authFetch';
import { fetchCategories, findCategoryBySubcategoryId } from './categories';

export interface CategorySpend {
  category: string;
  total: number;
}

// One UTC month's totals per subcategory, from get-transactions-service's
// cached GET /transactions/summary - see docs/adr/0011-spend-summary-cache-aside.md.
interface MonthSummary {
  month: string; // 'YYYY-MM'
  bySubcategory: Record<string, number>;
}

// month is 1-12 here (the API's convention), unlike the 0-11 the pages use.
async function fetchMonthSummaries(year: number, month?: number): Promise<MonthSummary[]> {
  const monthParam = month === undefined ? '' : `&month=${month}`;
  // No userId: the server takes the user from the access token (ADR 0013).
  const response = await authFetch(`${API_GATEWAY_URL}/transactions/summary?year=${year}${monthParam}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch spend summary: ${response.status}`);
  }

  return response.json();
}

function totalsByCategory(summaries: MonthSummary[], categories: Category[]): CategorySpend[] {
  const totals = new Map<string, number>();

  for (const summary of summaries) {
    for (const [subCategoryId, amount] of Object.entries(summary.bySubcategory)) {
      const categoryName = findCategoryBySubcategoryId(categories, subCategoryId)?.category.name ?? 'Other';
      totals.set(categoryName, (totals.get(categoryName) ?? 0) + amount);
    }
  }

  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

// month is 0-11 (JS Date convention, as the pages use).
export async function fetchSpendingReport(month: number, year: number): Promise<CategorySpend[]> {
  const [summaries, categories] = await Promise.all([fetchMonthSummaries(year, month + 1), fetchCategories()]);
  return totalsByCategory(summaries, categories);
}

export interface MonthSpend {
  month: number;
  total: number;
}

export interface AnnualReport {
  monthly: MonthSpend[];
  byCategory: CategorySpend[];
}

export async function fetchAnnualReport(year: number): Promise<AnnualReport> {
  const [summaries, categories] = await Promise.all([fetchMonthSummaries(year), fetchCategories()]);

  return {
    // The API returns all 12 months in order, so index i is month i (0-11).
    monthly: summaries.map((summary, month) => ({
      month,
      total: Object.values(summary.bySubcategory).reduce((sum, amount) => sum + amount, 0),
    })),
    byCategory: totalsByCategory(summaries, categories),
  };
}
