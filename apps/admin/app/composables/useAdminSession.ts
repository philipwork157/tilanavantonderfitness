import type { AdminSessionResponse, AdminUser } from '@tilana/contracts/admin-auth';

/**
 * Signed-in admin, shared between server render and browser.
 * `undefined` means not checked yet, `null` means signed out.
 */
export function useAdminSession() {
  const user = useState<AdminUser | null | undefined>('admin-user', () => undefined);
  const requestFetch = useRequestFetch();

  async function refresh() {
    try {
      const session = await requestFetch<AdminSessionResponse>('/api/auth/session');
      user.value = session.user;
    }
    catch {
      user.value = null;
    }
    return user.value;
  }

  async function signOut() {
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    user.value = null;
    await navigateTo('/login');
  }

  return { user, refresh, signOut };
}
