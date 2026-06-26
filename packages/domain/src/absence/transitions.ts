export type AbsenceStatus = 'requested' | 'approved' | 'rejected' | 'cancelled';
export type AbsenceAction = 'approve' | 'reject' | 'cancel';

export class AbsenceTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbsenceTransitionError';
  }
}

const TRANSITIONS: Record<AbsenceStatus, Partial<Record<AbsenceAction, AbsenceStatus>>> = {
  requested: { approve: 'approved', reject: 'rejected', cancel: 'cancelled' },
  approved: { cancel: 'cancelled' },
  rejected: {},
  cancelled: {},
};

/** Naechster Status eines Abwesenheitsantrags; wirft bei unzulaessiger Aktion. */
export function nextAbsenceStatus(current: AbsenceStatus, action: AbsenceAction): AbsenceStatus {
  const next = TRANSITIONS[current][action];
  if (next === undefined) {
    throw new AbsenceTransitionError(`Aktion '${action}' im Status '${current}' nicht zulaessig.`);
  }
  return next;
}

const AUDIT_ACTION: Record<AbsenceAction, 'absence.approve' | 'absence.reject' | 'absence.cancel'> =
  {
    approve: 'absence.approve',
    reject: 'absence.reject',
    cancel: 'absence.cancel',
  };

export function absenceAuditAction(action: AbsenceAction): 'absence.approve' | 'absence.reject' | 'absence.cancel' {
  return AUDIT_ACTION[action];
}
