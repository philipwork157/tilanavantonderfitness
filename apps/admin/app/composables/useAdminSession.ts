import type { AdminSessionResponse } from '@tilana/contracts/auth';

export function useAdminUser() {
  return useState<AdminSessionResponse['user'] | null>('admin-user', () => null);
}
