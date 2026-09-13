import type { H3Event } from 'h3';
import { requireAdmin } from './admin-auth';
import { enforceSameOrigin } from './auth-security';
import { authorizeCatalogueMutation } from './catalogue-authorization';

interface AdminMutationDependencies {
  enforceSameOrigin: typeof enforceSameOrigin;
  requireAdmin: typeof requireAdmin;
}

const defaultDependencies: AdminMutationDependencies = {
  enforceSameOrigin,
  requireAdmin,
};

export async function requireAdminCatalogueMutation(
  event: H3Event,
  dependencies: AdminMutationDependencies = defaultDependencies,
) {
  return authorizeCatalogueMutation(event, dependencies);
}
