import type { AdminSessionResponse } from '@tilana/contracts/auth';

export default defineNuxtRouteMiddleware(async (to) => {
  const adminUser = useAdminUser();
  const isLoginPage = to.path === '/login';

  try {
    const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined;
    const session = await $fetch<AdminSessionResponse>('/api/auth/session', { headers });
    adminUser.value = session.user;

    if (isLoginPage) return navigateTo('/dashboard');
  } catch {
    adminUser.value = null;
    if (!isLoginPage) return navigateTo('/login');
  }
});
