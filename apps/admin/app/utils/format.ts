const johannesburgDateFormatter = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
  timeZone: 'Africa/Johannesburg',
});

const johannesburgDateTimeFormatter = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Johannesburg',
});

export function formatAdminDate(value: string | Date | null | undefined): string {
  return value ? johannesburgDateFormatter.format(new Date(value)) : '—';
}

export function formatAdminDateTime(value: string | Date | null | undefined): string {
  return value ? johannesburgDateTimeFormatter.format(new Date(value)) : '—';
}
