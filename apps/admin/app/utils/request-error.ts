interface RequestErrorShape {
  data?: {
    statusMessage?: string;
    data?: { issues?: Array<{ message?: string }> };
  };
  statusMessage?: string;
  message?: string;
}

export function requestErrorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;
  const error = value as RequestErrorShape;
  return error.data?.data?.issues?.[0]?.message
    || error.data?.statusMessage
    || error.statusMessage
    || error.message
    || fallback;
}
