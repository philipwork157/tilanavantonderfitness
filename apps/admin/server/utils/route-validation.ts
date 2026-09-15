import type { H3Event } from 'h3';
import { parseDatabaseId } from './database-id';

interface ValidationIssue {
  message?: string;
}

type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: readonly ValidationIssue[] } };

export interface RequestSchema<T> {
  safeParse(value: unknown): SafeParseResult<T>;
}

interface ZodBodyOptions {
  defaultToEmptyObject?: boolean;
  exposeIssueMessage?: boolean;
}

export function requireDatabaseId(value: string | undefined, resourceName: string): number {
  const id = parseDatabaseId(value);
  if (id === null) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid ${resourceName} identifier.`,
    });
  }
  return id;
}

export function requireRouteDatabaseId(
  event: H3Event,
  resourceName: string,
  parameterName = 'id',
): number {
  return requireDatabaseId(getRouterParam(event, parameterName), resourceName);
}

export function validateRequestBody<T>(
  value: unknown,
  schema: RequestSchema<T>,
  fallbackMessage: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? fallbackMessage,
    });
  }
  return parsed.data;
}

export async function readZodBody<T>(
  event: H3Event,
  schema: RequestSchema<T>,
  fallbackMessage: string,
  options: ZodBodyOptions = {},
): Promise<T> {
  const body = await readBody(event);
  const value = body ?? (options.defaultToEmptyObject ? {} : body);
  if (options.exposeIssueMessage === false) {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: fallbackMessage });
    }
    return parsed.data;
  }
  return validateRequestBody(
    value,
    schema,
    fallbackMessage,
  );
}
