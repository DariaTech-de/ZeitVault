/**
 * Reine RBAC-Pruefung (testbar): erfuellt, wenn der Benutzer mindestens eine der
 * geforderten Rollen besitzt. Rollen stammen aus dem Auth-Token
 * (realm_access.roles, ADR-0008).
 */
export function hasRequiredRoles(
  userRoles: readonly string[],
  requiredRoles: readonly string[],
): boolean {
  if (requiredRoles.length === 0) return true;
  return requiredRoles.some((role) => userRoles.includes(role));
}
