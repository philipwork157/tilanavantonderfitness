import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { formatAdminDate, formatAdminDateTime } from '../app/utils/format.ts';
import { requestErrorMessage } from '../app/utils/request-error.ts';

describe('shared admin UI utilities', () => {
  it('formats dates consistently in the Johannesburg timezone', () => {
    const instant = '2026-09-15T23:30:00.000Z';
    assert.match(formatAdminDate(instant), /16 Sept? 2026/);
    assert.match(formatAdminDateTime(instant), /16 Sept? 2026/);
    assert.equal(formatAdminDate(null), '—');
  });

  it('prefers detailed contract errors over generic request messages', () => {
    assert.equal(requestErrorMessage({
      data: {
        statusMessage: 'Generic request error.',
        data: { issues: [{ message: 'Specific field error.' }] },
      },
    }, 'Fallback'), 'Specific field error.');
    assert.equal(requestErrorMessage(null, 'Fallback'), 'Fallback');
  });
});
