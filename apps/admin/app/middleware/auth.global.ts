// UX guard only. Real protection is requireAdmin() in every admin API route.
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, refresh } = useAdminSession();
  if (user.value === undefined) await refresh();

  const onLogin = to.path === '/login';
  if (!user.value && !onLogin) {
    return navigateTo({ path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } });
  }
  if (user.value && onLogin) {
    return navigateTo(safeRedirectPath(to.query.redirect));
  }
});
