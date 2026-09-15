import { mapCatalogueServiceError } from '@server/services/program-catalogue';
import { mapCatalogueStorageError } from '@server/services/program-storage';

export function throwCatalogueRouteError(error: unknown): never {
  const mapped = mapCatalogueStorageError(error) ?? mapCatalogueServiceError(error);
  if (mapped) throw createError(mapped);
  throw error;
}
