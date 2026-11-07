import { describe, expect, it } from 'vitest';

import { workspaceDestination } from './workspace-routing';
describe('jUAI routing boundary', () => {
  it('uses platform login for all framework auth variants, regardless of Vben token state', () => {
    for (const p of [
      '/auth',
      '/auth/login',
      '/auth/code-login',
      '/auth/register',
    ])
      expect(workspaceDestination(p, true)).toBe('/login');
  });
  it('keeps business and unknown business paths out of framework authentication', () => {
    for (const p of [
      '/welcome',
      '/',
      '/japan-grad/overview',
      '/japan-grad/unknown',
    ])
      expect(workspaceDestination(p, true)).toBeNull();
    expect(workspaceDestination('/dashboard/analytics', true)).toBe(
      '/japan-grad/overview',
    );
    expect(workspaceDestination('/auth/login', false)).toBe(
      '/japan-grad/overview',
    );
  });
});
