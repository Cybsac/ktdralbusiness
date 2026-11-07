import { describe, expect, it } from 'vitest';
import { canAccessReusableTokens } from '@/lib/reusable-tokens/access';
describe('acceso a QR reutilizables', () => {
  it.each([['ADMIN', null, true], ['COORDINATOR', null, true], ['STAFF', 'Animación', true], ['STAFF', 'Multimedia', true], ['STAFF', 'Caja', false], ['COLLAB', 'Animación', false]])('%s / %s', (role, area, expected) => expect(canAccessReusableTokens(role, area)).toBe(expected));
});
