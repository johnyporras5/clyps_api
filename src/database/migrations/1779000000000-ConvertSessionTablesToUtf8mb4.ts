import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Convierte las tablas `session` y `session_detail` al charset `utf8mb4`.
 *
 * El charset `utf8` de MySQL (utf8mb3) solo soporta caracteres de hasta 3 bytes,
 * por lo que los emojis (4 bytes) provocan el error
 * `ER_TRUNCATED_WRONG_VALUE_FOR_FIELD` al insertar en columnas como `description_ia`.
 *
 * `utf8mb4` soporta el rango Unicode completo, incluidos los emojis.
 */
export class ConvertSessionTablesToUtf8mb41779000000000 implements MigrationInterface {
    name = 'ConvertSessionTablesToUtf8mb41779000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE \`session\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        );
        await queryRunner.query(
            `ALTER TABLE \`session_detail\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE \`session_detail\` CONVERT TO CHARACTER SET utf8 COLLATE utf8_general_ci`,
        );
        await queryRunner.query(
            `ALTER TABLE \`session\` CONVERT TO CHARACTER SET utf8 COLLATE utf8_general_ci`,
        );
    }

}
