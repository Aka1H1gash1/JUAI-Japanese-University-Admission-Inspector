/** Guard values whose existence has already been established by the caller. */
export function requireValue<T>(value: T): NonNullable<T> {
  if (value === undefined || value === null) {
    throw new TypeError('所需内容已不可用，请重新打开页面后重试。');
  }
  return value;
}
