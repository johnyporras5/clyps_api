import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ONB-2 (fix de datos): Spa traía su categoría de masajes con la key
 * `masajes_spa` mientras Masajes y Bienestar usaba `masajes`. Como la
 * deduplicación agrupa por `category.key`, un negocio que marcara ambos rubros
 * veía DOS categorías llamadas "Masajes" (una con masaje_relajante +
 * masaje_descontracturante y otra con masaje_piedras).
 *
 * El ticket es explícito: `masaje_relajante` y `masaje_descontracturante` se
 * comparten entre Spa y Masajes y Bienestar "para evitar catálogos duplicados
 * cuando el negocio marca rubros solapados". Para que eso funcione la categoría
 * que los contiene también tiene que compartir key → se unifica en `masajes`.
 *
 * Solo cambia la key de la categoría en el rubro `spa`; nombres, descripciones y
 * servicios quedan igual.
 */
export class FixSpaMassageCategoryKey1780000000044 implements MigrationInterface {
  name = 'FixSpaMassageCategoryKey1780000000044';

  private async setSpaMassageKey(
    queryRunner: QueryRunner,
    key: string,
  ): Promise<void> {
    const template = {
      categories: [
        {
          key,
          name: 'Masajes',
          description: 'Masajes de relajación y terapéuticos.',
          services: [
            {
              key: 'masaje_relajante',
              name: 'Masaje relajante',
              description: 'Masaje corporal relajante.',
            },
            {
              key: 'masaje_descontracturante',
              name: 'Masaje descontracturante',
              description: 'Masaje terapéutico.',
            },
          ],
        },
        {
          key: 'rituales',
          name: 'Rituales y circuitos',
          description: 'Rituales de spa y circuitos.',
          services: [
            {
              key: 'circuito_spa',
              name: 'Circuito de spa',
              description: 'Circuito de hidroterapia / sauna.',
            },
            {
              key: 'exfoliacion_corporal',
              name: 'Exfoliación corporal',
              description: 'Exfoliación e hidratación corporal.',
            },
          ],
        },
      ],
    };

    await queryRunner.query(
      `UPDATE \`onboarding_rubro_template\`
          SET \`template\` = ?
        WHERE \`rubro_key\` = 'spa'`,
      [JSON.stringify(template)],
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.setSpaMassageKey(queryRunner, 'masajes');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.setSpaMassageKey(queryRunner, 'masajes_spa');
  }
}
