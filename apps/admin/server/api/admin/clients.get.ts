import {
  listClientsWithProgrammes,
  listManualProgramVolumeOptions,
} from '@server/services/client-management';
import { requireAdmin } from '@server/utils/admin-auth';
import { adminClientListQuerySchema } from '@tilana/contracts/clients';
import { getPaystackEnvironment } from '@server/utils/paystack-configuration';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const query = adminClientListQuerySchema.safeParse(getQuery(event));
  if (!query.success) throw createError({ statusCode: 400, statusMessage: 'Choose a valid client source.' });
  const paystackEnvironment = getPaystackEnvironment();
  const [clients, programVolumes] = await Promise.all([
    listClientsWithProgrammes(paystackEnvironment, query.data.source),
    listManualProgramVolumeOptions(),
  ]);
  return {
    clients,
    programVolumes,
    paystackEnvironment,
  };
});
