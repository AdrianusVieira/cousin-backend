function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}

function camelToSnake(key: string): string {
  return key.replace(/([A-Z])/g, (char) => `_${char.toLowerCase()}`);
}

/** Shallow snake_case -> camelCase, e.g. for mapping a single DB row to an API object. */
export function rowToCamel<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [snakeToCamel(key), value]));
}

/** Shallow camelCase -> snake_case, e.g. for mapping an API payload to DB columns. */
export function objectToSnake<T extends Record<string, unknown>>(
  obj: T,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [camelToSnake(key), value]));
}
