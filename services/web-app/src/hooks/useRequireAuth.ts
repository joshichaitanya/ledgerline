import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';

// Guards a page that only makes sense for a logged-in user (matches the
// Sidebar hiding that page's nav item for logged-out users) - redirects to
// /login if there's no user once the initial auth check finishes. Returns
// `ready: false` while that check is still in flight or a redirect is about
// to happen, so the page can render nothing instead of a flash of content.
export function useRequireAuth() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  return { user, ready: !isLoading && !!user };
}
