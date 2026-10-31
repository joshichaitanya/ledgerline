// The browser tab's <title> - "Page · app". Screen readers announce it when a
// page loads, and it's how users tell tabs apart; axe flags a page without one.
export function pageTitle(page: string): string {
  return `${page} · scalable-demo`;
}
