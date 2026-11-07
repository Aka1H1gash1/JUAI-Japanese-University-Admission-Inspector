/** JUAI uses its platform cookie session; a missing Vben token is unrelated. */
export function workspaceDestination(path: string, server: boolean) {
  if (path === '/auth' || path.startsWith('/auth/'))
    return server ? '/login' : '/japan-grad/overview';
  if (path.startsWith('/japan-grad') || path === '/' || path === '/welcome')
    return null;
  return '/japan-grad/overview';
}
