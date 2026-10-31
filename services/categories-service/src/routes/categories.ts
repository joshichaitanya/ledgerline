import { Request, Response, Router } from 'express';
import { CategoryError, createCategory, createSubcategory, listCategories } from '../services/categories.service';

const router = Router();

// userId always comes from the verified token (requireAuth, in app.ts) -
// docs/adr/0013-user-id-from-verified-token.md.

const MAX_NAME_LENGTH = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A trimmed, non-empty name of sensible length, or null.
function validName(body: unknown): string | null {
  const name = (body as { name?: unknown } | undefined)?.name;
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH ? trimmed : null;
}

function handleError(res: Response, error: unknown, action: string) {
  if (error instanceof CategoryError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(`Failed to ${action}:`, error);
  res.status(500).json({ error: `Failed to ${action}` });
}

// GET /categories - shared defaults plus the user's own, with subcategories.
router.get('/', async (req: Request, res: Response) => {
  try {
    res.json(await listCategories(req.auth!.userId));
  } catch (error) {
    handleError(res, error, 'fetch categories');
  }
});

// POST /categories { name } - a category only this user sees.
router.post('/', async (req: Request, res: Response) => {
  const name = validName(req.body);
  if (!name) {
    res.status(400).json({ error: `name is required (1-${MAX_NAME_LENGTH} characters)` });
    return;
  }
  try {
    res.status(201).json(await createCategory(req.auth!.userId, name));
  } catch (error) {
    handleError(res, error, 'create category');
  }
});

// POST /categories/:categoryId/subcategories { name } - under a default
// category or one of the user's own; only this user sees it.
router.post('/:categoryId/subcategories', async (req: Request, res: Response) => {
  const { categoryId } = req.params;
  if (!UUID.test(categoryId)) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }
  const name = validName(req.body);
  if (!name) {
    res.status(400).json({ error: `name is required (1-${MAX_NAME_LENGTH} characters)` });
    return;
  }
  try {
    res.status(201).json(await createSubcategory(req.auth!.userId, categoryId, name));
  } catch (error) {
    handleError(res, error, 'create subcategory');
  }
});

export default router;
