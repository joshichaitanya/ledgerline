import { API_GATEWAY_URL } from './playwright.config';

// Fails the whole run up front, with instructions, if the backend isn't
// reachable - rather than every test timing out on its own.
export default async function globalSetup() {
  // A protected route with no token: 401 means the gateway is up *and*
  // routing to categories-service (Kong answers 401 itself; a missing
  // route would be 404, a down gateway a connection error).
  let status: number | string;
  try {
    status = (await fetch(`${API_GATEWAY_URL}/categories`)).status;
  } catch (error) {
    status = (error as Error).message;
  }

  if (status !== 401) {
    throw new Error(
      `api-gateway isn't ready at ${API_GATEWAY_URL} (GET /categories gave ${status}, expected 401).\n` +
        'Start the full stack first - see e2e/README.md:\n' +
        '  docker compose up -d --build   (from the repo root; migrations run automatically)'
    );
  }
}
