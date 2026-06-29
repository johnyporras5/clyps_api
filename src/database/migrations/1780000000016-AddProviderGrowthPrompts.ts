import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProviderGrowthPrompts1780000000016 implements MigrationInterface {
  name = 'AddProviderGrowthPrompts1780000000016';

  // Prompts del mini chat de IA del home del worker (type 'pg' = provider-growth),
  // enfocados en conseguir más citas / mejorar el negocio.
  private readonly PROMPTS = [
    '¿Cómo puedo conseguir más citas esta semana?',
    'Dame ideas para atraer nuevos clientes a mi negocio.',
    '¿Qué servicios debería promocionar para aumentar mis reservas?',
    '¿Cómo mejorar mi perfil para destacar entre otros profesionales?',
    'Dame consejos para fidelizar a mis clientes actuales.',
    '¿Qué horarios tienen más demanda y cómo aprovecharlos?',
    '¿Cómo usar promociones u ofertas para llenar mi agenda?',
    'Estrategias para conseguir reseñas positivas y mejorar mi reputación.',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 'pg' tiene 2 caracteres; la columna era varchar(1).
    await queryRunner.query(
      'ALTER TABLE `ia_prompts` MODIFY `tipo` varchar(5) NOT NULL',
    );

    for (const text of this.PROMPTS) {
      await queryRunner.query(
        'INSERT INTO `ia_prompts` (`text`, `tipo`) VALUES (?, ?)',
        [text, 'pg'],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DELETE FROM `ia_prompts` WHERE `tipo` = ?', [
      'pg',
    ]);
    // Revertir el ancho de la columna (seguro: ya no quedan filas 'pg').
    await queryRunner.query(
      'ALTER TABLE `ia_prompts` MODIFY `tipo` varchar(1) NOT NULL',
    );
  }
}
