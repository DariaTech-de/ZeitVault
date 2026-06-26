import { describe, expect, it } from 'vitest';
import { hasRequiredRoles } from './roles';

describe('hasRequiredRoles', () => {
  it('erlaubt, wenn keine Rolle gefordert ist', () => {
    expect(hasRequiredRoles([], [])).toBe(true);
    expect(hasRequiredRoles(['employee'], [])).toBe(true);
  });

  it('erlaubt bei mindestens einer passenden Rolle', () => {
    expect(hasRequiredRoles(['employee', 'admin'], ['admin'])).toBe(true);
    expect(hasRequiredRoles(['manager'], ['admin', 'manager'])).toBe(true);
  });

  it('verweigert ohne passende Rolle', () => {
    expect(hasRequiredRoles(['employee'], ['admin'])).toBe(false);
    expect(hasRequiredRoles([], ['admin'])).toBe(false);
  });
});
