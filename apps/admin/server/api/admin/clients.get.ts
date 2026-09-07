import { listClientsWithProgrammes } from '../../services/client-management';
import { requireAdmin } from '../../utils/admin-auth';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const environment = String(useRuntimeConfig().paystackEnvironment || 'test');
  const paystackEnvironment = environment === 'live' ? 'live' as const : 'test' as const;
  return {
    clients: await listClientsWithProgrammes(paystackEnvironment),
    paystackEnvironment,
  };
});
