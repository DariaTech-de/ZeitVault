import { describe, expect, it } from 'vitest';
import { claimsToContext } from './claims';

const opts = { tenantClaim: 'tenant_id', defaultTenantId: 'default' };

describe('claimsToContext', () => {
  it('leitet tenantId, userId und Rollen aus den Claims ab', () => {
    const ctx = claimsToContext(
      {
        sub: 'user-123',
        tenant_id: 'acme',
        realm_access: { roles: ['employee', 'admin'] },
      },
      opts,
    );
    expect(ctx).toEqual({ tenantId: 'acme', userId: 'user-123', roles: ['employee', 'admin'] });
  });

  it('faellt ohne Tenant-Claim auf den Default-Mandanten zurueck', () => {
    const ctx = claimsToContext({ sub: 'u1' }, opts);
    expect(ctx.tenantId).toBe('default');
    expect(ctx.roles).toEqual([]);
  });

  it('wirft ohne sub-Claim', () => {
    expect(() => claimsToContext({ tenant_id: 'acme' }, opts)).toThrow();
  });

  it('ignoriert nicht-string Rollen', () => {
    const ctx = claimsToContext(
      { sub: 'u1', realm_access: { roles: ['ok', 42, null] } },
      opts,
    );
    expect(ctx.roles).toEqual(['ok']);
  });
});
