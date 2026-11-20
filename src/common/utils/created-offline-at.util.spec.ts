import { BadRequestException } from '@nestjs/common';
import {
  OFFLINE_MAX_AGE_DAYS,
  parseCreatedOfflineAt,
} from './created-offline-at.util';

/** BE-OFF-3: validación de `createdOfflineAt`. */
const NOW = new Date('2026-11-20T15:00:00.000Z');
const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    return (e as BadRequestException).getResponse()['code'] as string;
  }
  return undefined;
};

describe('parseCreatedOfflineAt', () => {
  it.each([undefined, null, ''])(
    'sin valor (%p): null, reglas de siempre',
    (v) => {
      expect(parseCreatedOfflineAt(v, NOW)).toBeNull();
    },
  );

  it('acepta ISO UTC con Z, con y sin milisegundos', () => {
    expect(parseCreatedOfflineAt('2026-11-20T13:00:00.000Z', NOW)).toEqual(
      new Date('2026-11-20T13:00:00.000Z'),
    );
    expect(parseCreatedOfflineAt('2026-11-20T13:00:00Z', NOW)).toEqual(
      new Date('2026-11-20T13:00:00.000Z'),
    );
  });

  it.each([
    '2026-11-20T13:00:00', // sin Z: hora local ambigua
    '2026-11-20T09:00:00-04:00', // con desfase en vez de Z
    '2026-11-20',
    'ayer',
    '2026-13-45T99:00:00Z', // forma correcta, fecha imposible
  ])('formato inválido (%p): 400 CREATED_OFFLINE_AT_INVALID', (v) => {
    expect(codeOf(() => parseCreatedOfflineAt(v, NOW))).toBe(
      'CREATED_OFFLINE_AT_INVALID',
    );
  });

  it('no texto (número): 400 CREATED_OFFLINE_AT_INVALID', () => {
    expect(codeOf(() => parseCreatedOfflineAt(1763650800000, NOW))).toBe(
      'CREATED_OFFLINE_AT_INVALID',
    );
  });

  it('hasta 5 min en el futuro se acepta (reloj del teléfono adelantado)', () => {
    expect(
      parseCreatedOfflineAt('2026-11-20T15:05:00.000Z', NOW),
    ).not.toBeNull();
  });

  it('más de 5 min en el futuro: 400 CREATED_OFFLINE_AT_IN_FUTURE', () => {
    expect(
      codeOf(() => parseCreatedOfflineAt('2026-11-20T15:05:01.000Z', NOW)),
    ).toBe('CREATED_OFFLINE_AT_IN_FUTURE');
  });

  it(`hasta ${OFFLINE_MAX_AGE_DAYS} días atrás se acepta`, () => {
    expect(
      parseCreatedOfflineAt('2026-11-13T15:00:00.000Z', NOW),
    ).not.toBeNull();
  });

  it(`más de ${OFFLINE_MAX_AGE_DAYS} días: 400 CREATED_OFFLINE_AT_TOO_OLD`, () => {
    expect(
      codeOf(() => parseCreatedOfflineAt('2026-11-13T14:59:59.000Z', NOW)),
    ).toBe('CREATED_OFFLINE_AT_TOO_OLD');
  });
});
