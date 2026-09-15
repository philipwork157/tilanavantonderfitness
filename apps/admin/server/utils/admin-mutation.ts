import type { H3Event } from 'h3';
import { requireAdmin } from './admin-auth';
import { authorizeAdminMutation } from './admin-mutation-authorization';
import { enforceSameOrigin } from './auth-security';

export function requireAdminMutation(event: H3Event) {
  return authorizeAdminMutation(event, { enforceSameOrigin, requireAdmin });
}
