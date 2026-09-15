import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import {
  ClientEmailExistsError,
  ClientNotEditableError,
  ProgramVolumeUnavailableError,
} from '../server/services/client-management.ts';
import {
  CheckinDateExistsError,
  ClientNotFoundError,
  MissingHealthProfileError,
} from '../server/services/coaching.ts';
import {
  throwClientManagementRouteError,
  throwCoachingRouteError,
} from '../server/utils/client-route.ts';

beforeEach(() => {
  vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(input.statusMessage), input));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('client API error boundaries', () => {
  it.each([
    new ClientEmailExistsError(),
    new ClientNotEditableError(),
    new ProgramVolumeUnavailableError(),
  ])('maps editable-client conflicts to HTTP 409', (error) => {
    assert.throws(() => throwClientManagementRouteError(error), {
      statusCode: 409,
      statusMessage: error.message,
    });
  });

  it('maps a missing coaching client to HTTP 404', () => {
    const error = new ClientNotFoundError();
    assert.throws(() => throwCoachingRouteError(error), {
      statusCode: 404,
      statusMessage: error.message,
    });
  });

  it.each([
    new CheckinDateExistsError(),
    new MissingHealthProfileError(),
  ])('maps coaching conflicts to HTTP 409', (error) => {
    assert.throws(() => throwCoachingRouteError(error), {
      statusCode: 409,
      statusMessage: error.message,
    });
  });

  it('does not disguise unexpected errors', () => {
    const error = new Error('Database connection failed.');
    try {
      throwCoachingRouteError(error);
      assert.fail('Expected the original error to be thrown.');
    } catch (caught) {
      assert.equal(caught, error);
    }
  });
});
