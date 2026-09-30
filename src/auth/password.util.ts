/**
 * Genera una contraseña simple y fácil de escribir:
 * una palabra sencilla en minúscula seguida de números.
 * Ejemplo: "gato4821"
 *
 * Se usa para las cuentas que se crean en nombre de alguien (cliente dado de
 * alta por el admin, trabajador, reserva desde el enlace público) y se le
 * envía por correo.
 */
export function generateSimplePassword(): string {
  const words = [
    'gato',
    'sol',
    'luna',
    'casa',
    'flor',
    'mar',
    'rio',
    'pan',
    'cielo',
    'verde',
    'rojo',
    'pez',
    'uva',
    'oso',
    'lago',
  ];

  const word = words[Math.floor(Math.random() * words.length)];

  // 4 dígitos (sin ceros a la izquierda) -> entre 1000 y 9999
  const digits = Math.floor(1000 + Math.random() * 9000).toString();

  return `${word}${digits}`;
}
