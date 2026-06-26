import { describe, expect, it } from 'vitest';
import { mapToLineItems, toPayrollCsv } from './mapping';
import type { DatevMapping, PayrollAggregate } from './types';

const aggregates: PayrollAggregate[] = [
  { personnelNumber: 'P-001', category: 'work_time', value: 9600, unit: 'minutes' },
  { personnelNumber: 'P-001', category: 'vacation', value: 5, unit: 'days' },
  { personnelNumber: 'P-001', category: 'sick', value: 2, unit: 'days' },
];

const mapping: DatevMapping = {
  work_time: { lohnart: '1000', kostenstelle: 'KST-10' },
  vacation: { lohnart: '2100' },
  // 'sick' bewusst ohne Mapping.
};

describe('mapToLineItems', () => {
  it('bildet zugeordnete Kategorien ab und meldet nicht zugeordnete', () => {
    const result = mapToLineItems(aggregates, mapping);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ lohnart: '1000', kostenstelle: 'KST-10', value: 9600 });
    expect(result.items[1]).toMatchObject({ lohnart: '2100', kostenstelle: null });
    expect(result.unmapped).toEqual([{ category: 'sick', value: 2 }]);
  });

  it('Nullwerte ohne Mapping erzeugen keinen unmapped-Eintrag', () => {
    const result = mapToLineItems(
      [{ personnelNumber: 'P-002', category: 'special', value: 0, unit: 'days' }],
      {},
    );
    expect(result.items).toHaveLength(0);
    expect(result.unmapped).toHaveLength(0);
  });
});

describe('toPayrollCsv', () => {
  it('erzeugt generisches CSV mit fester Kopfzeile', () => {
    const { items } = mapToLineItems(aggregates, mapping);
    const csv = toPayrollCsv(items);
    expect(csv.split('\n')[0]).toBe(
      'personnel_number,category,lohnart,kostenstelle,ausfallschluessel,value,unit',
    );
    expect(csv).toContain('P-001,work_time,1000,KST-10,,9600,minutes');
  });
});
