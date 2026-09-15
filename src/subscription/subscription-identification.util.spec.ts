import { normalizeIdentification } from './subscription-identification.util';

/**
 * La forma canónica de la cédula/RIF (CLYP-343).
 *
 * Lo que se protege aquí es que el MISMO dueño no termine siendo dos clientes
 * en Cobrix por haber escrito su cédula de dos maneras.
 */
describe('normalizar la cédula o RIF', () => {
  it.each([
    ['V-12345678', 'V-12345678'],
    ['v12345678', 'V-12345678'],
    ['  v 12.345.678  ', 'V-12345678'],
    ['V_12345678', 'V-12345678'],
    ['J401234567', 'J-401234567'],
    ['J-40123456-7', 'J-401234567'],
    ['e1234567', 'E-1234567'],
  ])('%s → %s', (escrito, esperado) => {
    expect(normalizeIdentification(escrito)).toBe(esperado);
  });

  /**
   * Sin letra NO se adivina: `12345678` puede ser la cédula V-12345678 o el RIF
   * J-12345678, y elegir por él le factura a otra persona.
   */
  it.each([
    ['12345678', 'sin letra'],
    ['A12345678', 'letra que no existe'],
    ['V-12345', 'muy corto'],
    ['V-12345678901', 'muy largo'],
    ['V-ABCDEFGH', 'sin números'],
    ['', 'vacío'],
    ['   ', 'solo espacios'],
  ])('rechaza %s (%s)', (escrito) => {
    expect(normalizeIdentification(escrito)).toBeNull();
  });

  it('lo que no es texto tampoco pasa', () => {
    expect(normalizeIdentification(null)).toBeNull();
    expect(normalizeIdentification(undefined)).toBeNull();
    expect(normalizeIdentification(12345678 as unknown as string)).toBeNull();
  });

  it('dos formas de escribir lo mismo dan el mismo cliente', () => {
    const formas = ['V12345678', 'v-12345678', 'V 12.345.678', ' v12345678 '];
    const normalizadas = new Set(formas.map(normalizeIdentification));
    expect(normalizadas.size).toBe(1);
  });
});
