import { validatePersonName } from './person-name.util';

describe('validatePersonName', () => {
  it.each([
    'María González',
    'José Ángel Peña',
    'Luis de la Rosa',
    "O'Neil Smith",
    'Jean-Pierre Duarte',
    'Ana Schwarz',
    'Ng Tran',
    'Pedro Melano',
  ])('acepta %s', (name) => {
    expect(validatePersonName(name)).toBeNull();
  });

  it.each([
    ['Teorino Eloyo', 'Escribe tu nombre real.'],
    ['Lomas turbas', 'Escribe tu nombre real.'],
    ['Rosa Melano', 'Escribe tu nombre real.'],
    ['Jwosnsjsjs', 'Escribe tu nombre y apellido.'],
    ['aaaa bbbb', 'Escribe tu nombre real.'],
    ['Juan 123', 'Usa solo letras en tu nombre.'],
  ])('rechaza %s', (name, message) => {
    expect(validatePersonName(name)).toBe(message);
  });
});
