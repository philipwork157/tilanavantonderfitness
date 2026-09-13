import {
  listClientsWithProgrammes,
  listManualProgramVolumeOptions,
} from '../../services/client-management';
import { requireAdmin } from '../../utils/admin-auth';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const environment = String(useRuntimeConfig().paystackEnvironment || 'test');
  const paystackEnvironment = environment === 'live' ? 'live' as const : 'test' as const;
  const [clients, programVolumes] = await Promise.all([
    listClientsWithProgrammes(paystackEnvironment),
    listManualProgramVolumeOptions(),
  ]);
  return {
    clients,
    programVolumes,
    paystackEnvironment,
  };
});
