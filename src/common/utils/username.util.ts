import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';

/**
 * Usernames generados para cuentas que no lo eligió su dueño: el cliente
 * invitado del enlace público y el trabajador o cliente al que el salón le
 * da acceso asignándole un correo. No hay índice único en `user.username`,
 * así que la unicidad se busca aquí.
 */

/** Minúsculas, sin acentos ni nada que no sea letra o número. */
export function normalizeForUsername(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** "María González" → "mariagonzalez4821" (único). */
export async function generateUniqueUsername(
  users: Repository<User>,
  name: string | null | undefined,
  email: string,
): Promise<string> {
  const fromName = normalizeForUsername(name ?? '');
  const base =
    (fromName.length >= 3
      ? fromName
      : normalizeForUsername(email.split('@')[0])
    ).slice(0, 20) || 'cliente';

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    const taken = await users.findOne({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base}${Date.now().toString(36)}`;
}
