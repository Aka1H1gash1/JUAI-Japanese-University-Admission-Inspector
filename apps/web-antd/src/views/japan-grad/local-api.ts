export async function localApi<T>(
  route: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/japangrad${route}`, {
    ...options,
    headers: { 'X-JapanGrad-Client': '1', ...options.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new Error(
      data?.error || '无法连接本地服务，请从 JapanGrad 启动入口打开工作台。',
    );
  }
  return data as T;
}

export function jsonOptions(method: string, data: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}
