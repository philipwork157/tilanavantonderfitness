const dateTime = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Johannesburg',
});

const dateOnly = new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeZone: 'Africa/Johannesburg' });

/** Dates are shown in South African time everywhere in the admin. */
export function formatDateTime(value: string | Date | null | undefined): string {
  return value ? dateTime.format(new Date(value)) : '';
}

export function formatDate(value: string | Date | null | undefined): string {
  return value ? dateOnly.format(new Date(value)) : '';
}

/** "1 enquiry" / "3 enquiries". */
export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString('en-ZA')} ${count === 1 ? one : many}`;
}
