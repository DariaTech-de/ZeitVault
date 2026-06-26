import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'zeitvault:roles';

/** Markiert einen Handler/Controller mit den geforderten Rollen (RBAC). */
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
