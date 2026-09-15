import {
  ClientEmailExistsError,
  ClientNotEditableError,
  ProgramVolumeUnavailableError,
} from '../services/client-management';
import {
  CheckinDateExistsError,
  ClientNotFoundError,
  MissingHealthProfileError,
} from '../services/coaching';

export function throwClientManagementRouteError(error: unknown): never {
  if (
    error instanceof ClientEmailExistsError
    || error instanceof ClientNotEditableError
    || error instanceof ProgramVolumeUnavailableError
  ) {
    throw createError({ statusCode: 409, statusMessage: error.message });
  }
  throw error;
}

export function throwCoachingRouteError(error: unknown): never {
  if (error instanceof ClientNotFoundError) {
    throw createError({ statusCode: 404, statusMessage: error.message });
  }
  if (error instanceof CheckinDateExistsError || error instanceof MissingHealthProfileError) {
    throw createError({ statusCode: 409, statusMessage: error.message });
  }
  throw error;
}
