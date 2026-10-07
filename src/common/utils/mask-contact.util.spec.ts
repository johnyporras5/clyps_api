import { maskEmail, maskPhone } from './mask-contact.util';

describe('contacto tapado', () => {
  it('correo: deja 2 letras y el dominio', () => {
    expect(maskEmail('ana.perez@gmail.com')).toBe('an***@gmail.com');
    expect(maskEmail('a@x.com')).toBe('a***@x.com');
    expect(maskEmail('')).toBeNull();
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail('sin-arroba')).toBeNull();
  });

  it('teléfono: solo los últimos 4', () => {
    expect(maskPhone('+58 414-123-4567')).toBe('••• 4567');
    expect(maskPhone('123')).toBeNull();
    expect(maskPhone(undefined)).toBeNull();
  });
});
