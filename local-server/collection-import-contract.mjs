import { createHash } from 'node:crypto';
export function importError(
  message,
  code = 'CREATE_ONLY_VIOLATION',
  status = 400,
) {
  return Object.assign(new Error(message), { code, status });
}
const stable = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).toSorted(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
export const importFingerprint = (value) =>
  createHash('sha256').update(stable(value)).digest('hex');
