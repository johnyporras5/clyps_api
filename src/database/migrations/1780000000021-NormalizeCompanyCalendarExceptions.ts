import { MigrationInterface, QueryRunner } from 'typeorm';
import { normalizeCompanyCalendarDetail } from '../../common/utils/company-calendar.util';

/**
 * Canoniza `calendar_company.calendar_detail` a la Forma A (excepciones en la
 * raíz, horario especial envuelto en `customSchedule`).
 *
 * Las empresas cuyo horario se guardó por última vez con el editor viejo del
 * admin web tenían las excepciones dentro de `schedule` y en formato plano. Ni
 * las pantallas de admin ni el filtro de disponibilidad las leían de ahí, así
 * que sus feriados y horarios especiales se ignoraban en silencio, y el admin
 * las habría borrado sin querer al volver a guardar (veía cero excepciones).
 *
 * Se reutiliza el mismo normalizador que usa el servicio al escribir, para que
 * la migración y el endpoint no puedan divergir.
 */
export class NormalizeCompanyCalendarExceptions1780000000021 implements MigrationInterface {
  name = 'NormalizeCompanyCalendarExceptions1780000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      'SELECT `id`, `calendar_detail` FROM `calendar_company` WHERE `calendar_detail` IS NOT NULL',
    );

    for (const row of rows as Array<{ id: number; calendar_detail: unknown }>) {
      const original = row.calendar_detail;

      const originalJson =
        typeof original === 'string' ? original : JSON.stringify(original);

      const normalized = normalizeCompanyCalendarDetail(original);
      if (!normalized) continue;

      const normalizedJson = JSON.stringify(normalized);
      // Solo tocamos las filas que realmente cambian.
      if (normalizedJson === originalJson) continue;

      await queryRunner.query(
        'UPDATE `calendar_company` SET `calendar_detail` = ? WHERE `id` = ?',
        [normalizedJson, row.id],
      );
    }
  }

  /**
   * Sin marcha atrás: la Forma A es un superconjunto de la heredada (agrega id,
   * reason y timestamps que la vieja no tenía), así que revertir perdería
   * datos. Además, volver a la forma vieja reintroduciría el bug. Dejamos el
   * down como no-op deliberado.
   */
  public async down(): Promise<void> {
    // Intencionalmente vacío.
  }
}
