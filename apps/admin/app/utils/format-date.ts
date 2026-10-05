const dateTime = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Johannesburg',
});

/** Dates are shown in South African time everywhere in the admin. */
export function formatDateTime(value: string | Date | null | undefined): string {
  return value ? dateTime.format(new Date(value)) : '';
}
