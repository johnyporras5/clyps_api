import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ONB-2: catálogo maestro de plantillas por rubro. Crea
 * `onboarding_rubro_template` y siembra los 11 rubros iniciales.
 *
 * Los `rubro_key` coinciden con los `slug` de `site_category` (lo que el dueño
 * marca al registrarse). Las plantillas traen SOLO estructura: ni precio, ni
 * comisión, ni trabajadores.
 *
 * Los `key` de categoría/servicio se comparten a propósito entre rubros
 * parecidos (salon_belleza/peluqueria, spa/masajes_bienestar) para que al
 * combinar varios rubros no salgan duplicados.
 *
 * El seed va inline (no importa código de la app) para que la migración quede
 * congelada en este punto de la historia. Mejoras posteriores del catálogo van
 * en migraciones nuevas o por el panel interno.
 */
export class CreateOnboardingRubroTemplates1780000000043 implements MigrationInterface {
  name = 'CreateOnboardingRubroTemplates1780000000043';

  private readonly seed: Array<{
    rubroKey: string;
    rubroName: string;
    sortOrder: number;
    template: unknown;
  }> = [
    {
      rubroKey: 'barberia',
      rubroName: 'Barbería',
      sortOrder: 0,
      template: {
        categories: [
          {
            key: 'cortes',
            name: 'Cortes',
            description: 'Cortes clásicos, modernos y texturizados.',
            services: [
              {
                key: 'corte_cabello',
                name: 'Corte de cabello',
                description: 'Corte de cabello a tijera y/o máquina.',
              },
              {
                key: 'corte_barba',
                name: 'Corte de cabello y barba',
                description: 'Corte completo más arreglo de barba.',
              },
              {
                key: 'corte_nino',
                name: 'Corte para niño',
                description: 'Corte infantil.',
              },
            ],
          },
          {
            key: 'barbas',
            name: 'Barbas',
            description: 'Afeitado, perfilado e hidratación de barba.',
            services: [
              {
                key: 'arreglo_barba',
                name: 'Arreglo de barba',
                description: 'Perfilado y definición de barba.',
              },
              {
                key: 'afeitado_clasico',
                name: 'Afeitado clásico',
                description:
                  'Afeitado tradicional con navaja y toalla caliente.',
              },
              {
                key: 'limpieza_barba',
                name: 'Limpieza de barba',
                description: 'Limpieza e hidratación de barba.',
              },
            ],
          },
          {
            key: 'color_barberia',
            name: 'Color',
            description: 'Tintes y cobertura para caballero.',
            services: [
              {
                key: 'tinte_cabello',
                name: 'Tinte de cabello',
                description: 'Coloración de cabello.',
              },
              {
                key: 'cobertura_canas',
                name: 'Cobertura de canas',
                description: 'Cobertura de canas natural.',
              },
              {
                key: 'pigmentacion_barba',
                name: 'Pigmentación de barba',
                description: 'Camuflaje de canas y tono uniforme en barba.',
              },
            ],
          },
        ],
      },
    },
    {
      rubroKey: 'salon_belleza',
      rubroName: 'Salón de Belleza',
      sortOrder: 1,
      template: {
        categories: [
          {
            key: 'cortes_peinados',
            name: 'Cortes y peinados',
            description: 'Cortes y peinados para dama y caballero.',
            services: [
              {
                key: 'corte_dama',
                name: 'Corte de dama',
                description: 'Corte y estilizado.',
              },
              {
                key: 'peinado',
                name: 'Peinado',
                description: 'Peinado para evento u ocasión.',
              },
              {
                key: 'cepillado',
                name: 'Cepillado / brushing',
                description: 'Secado y cepillado.',
              },
            ],
          },
          {
            key: 'color',
            name: 'Color',
            description: 'Coloración, mechas e iluminaciones.',
            services: [
              {
                key: 'tinte_coloracion',
                name: 'Tinte / coloración',
                description: 'Coloración completa.',
              },
              {
                key: 'mechas',
                name: 'Mechas / balayage',
                description: 'Mechas o balayage.',
              },
              {
                key: 'matizado',
                name: 'Matizado',
                description: 'Neutralización de tonos.',
              },
            ],
          },
          {
            key: 'tratamientos_capilares',
            name: 'Tratamientos capilares',
            description: 'Hidratación y tratamientos del cabello.',
            services: [
              {
                key: 'hidratacion',
                name: 'Hidratación capilar',
                description: 'Tratamiento de hidratación profunda.',
              },
              {
                key: 'keratina',
                name: 'Keratina / alisado',
                description: 'Tratamiento de keratina o alisado.',
              },
            ],
          },
        ],
      },
    },
    {
      rubroKey: 'centro_estetico',
      rubroName: 'Centro Estético',
      sortOrder: 2,
      template: {
        categories: [
          {
            key: 'faciales',
            name: 'Faciales',
            description: 'Limpiezas y tratamientos faciales.',
            services: [
              {
                key: 'limpieza_facial',
                name: 'Limpieza facial',
                description: 'Limpieza facial profunda.',
              },
              {
                key: 'tratamiento_facial',
                name: 'Tratamiento facial',
                description: 'Tratamiento facial especializado.',
              },
            ],
          },
          {
            key: 'corporales',
            name: 'Tratamientos corporales',
            description: 'Tratamientos reductores y reafirmantes.',
            services: [
              {
                key: 'reductor',
                name: 'Tratamiento reductor',
                description: 'Sesión de tratamiento reductor.',
              },
              {
                key: 'reafirmante',
                name: 'Tratamiento reafirmante',
                description: 'Sesión de tratamiento reafirmante.',
              },
            ],
          },
        ],
      },
    },
    {
      rubroKey: 'depilacion',
      rubroName: 'Depilación',
      sortOrder: 3,
      template: {
        categories: [
          {
            key: 'depilacion_cera',
            name: 'Depilación con cera',
            description: 'Depilación por zonas con cera.',
            services: [
              {
                key: 'depilacion_piernas',
                name: 'Depilación de piernas',
                description: 'Depilación de piernas.',
              },
              {
                key: 'depilacion_axilas',
                name: 'Depilación de axilas',
                description: 'Depilación de axilas.',
              },
              {
                key: 'depilacion_cejas',
                name: 'Depilación de cejas',
                description: 'Perfilado de cejas.',
              },
              {
                key: 'depilacion_bikini',
                name: 'Depilación bikini',
                description: 'Depilación zona bikini.',
              },
            ],
          },
          {
            key: 'depilacion_laser',
            name: 'Depilación láser',
            description: 'Depilación con láser por zonas.',
            services: [
              {
                key: 'laser_zona',
                name: 'Depilación láser por zona',
                description: 'Sesión de depilación láser.',
              },
            ],
          },
        ],
      },
    },
    {
      rubroKey: 'unas_manicure',
      rubroName: 'Uñas y Manicure',
      sortOrder: 4,
      template: {
        categories: [
          {
            key: 'manos',
            name: 'Manos',
            description: 'Manicure y esmaltado.',
            services: [
              {
                key: 'manicure',
                name: 'Manicure',
                description: 'Manicure tradicional.',
              },
              {
                key: 'unas_acrilicas',
                name: 'Uñas acrílicas',
                description: 'Aplicación de uñas acrílicas.',
              },
              {
                key: 'esmaltado_semi',
                name: 'Esmaltado semipermanente',
                description: 'Esmaltado semipermanente.',
              },
            ],
          },
          {
            key: 'pies',
            name: 'Pies',
            description: 'Pedicure y spa de pies.',
            services: [
              {
                key: 'pedicure',
                name: 'Pedicure',
                description: 'Pedicure tradicional.',
              },
              {
                key: 'spa_pies',
                name: 'Spa de pies',
                description: 'Tratamiento spa para pies.',
              },
            ],
          },
        ],
      },
    },
    {
      rubroKey: 'tatuajes_piercings',
      rubroName: 'Tatuajes y Piercings',
      sortOrder: 5,
      template: {
        categories: [
          {
            key: 'tatuajes',
            name: 'Tatuajes',
            description: 'Tatuajes por tamaño y diseño.',
            services: [
              {
                key: 'tatuaje_pequeno',
                name: 'Tatuaje pequeño',
                description: 'Tatuaje de área pequeña.',
              },
              {
                key: 'tatuaje_mediano',
                name: 'Tatuaje mediano',
                description: 'Tatuaje de área mediana.',
              },
              {
                key: 'tatuaje_grande',
                name: 'Tatuaje grande',
                description: 'Tatuaje de área grande / sesión.',
              },
            ],
          },
          {
            key: 'piercings',
            name: 'Piercings',
            description: 'Perforaciones corporales.',
            services: [
              {
                key: 'perforacion',
                name: 'Perforación',
                description: 'Aplicación de piercing.',
              },
            ],
          },
        ],
      },
    },
    {
      rubroKey: 'spa',
      rubroName: 'Spa',
      sortOrder: 6,
      template: {
        categories: [
          {
            key: 'masajes_spa',
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
      },
    },
    {
      rubroKey: 'peluqueria',
      rubroName: 'Peluquería',
      sortOrder: 7,
      template: {
        categories: [
          {
            key: 'cortes_peinados',
            name: 'Cortes y peinados',
            description: 'Cortes y peinados para dama y caballero.',
            services: [
              {
                key: 'corte_dama',
                name: 'Corte de dama',
                description: 'Corte y estilizado.',
              },
              {
                key: 'corte_caballero',
                name: 'Corte de caballero',
                description: 'Corte de caballero.',
              },
              {
                key: 'peinado',
                name: 'Peinado',
                description: 'Peinado para evento u ocasión.',
              },
            ],
          },
          {
            key: 'color',
            name: 'Color',
            description: 'Coloración y mechas.',
            services: [
              {
                key: 'tinte_coloracion',
                name: 'Tinte / coloración',
                description: 'Coloración completa.',
              },
              {
                key: 'mechas',
                name: 'Mechas / balayage',
                description: 'Mechas o balayage.',
              },
            ],
          },
        ],
      },
    },
    {
      rubroKey: 'masajes_bienestar',
      rubroName: 'Masajes y Bienestar',
      sortOrder: 8,
      template: {
        categories: [
          {
            key: 'masajes',
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
              {
                key: 'masaje_piedras',
                name: 'Masaje con piedras calientes',
                description: 'Masaje con piedras calientes.',
              },
            ],
          },
          {
            key: 'bienestar',
            name: 'Bienestar',
            description: 'Terapias de bienestar.',
            services: [
              {
                key: 'aromaterapia',
                name: 'Aromaterapia',
                description: 'Sesión de aromaterapia.',
              },
              {
                key: 'reflexologia',
                name: 'Reflexología',
                description: 'Sesión de reflexología podal.',
              },
            ],
          },
        ],
      },
    },
    {
      rubroKey: 'maquillaje_estilismo',
      rubroName: 'Maquillaje y Estilismo',
      sortOrder: 9,
      template: {
        categories: [
          {
            key: 'maquillaje',
            name: 'Maquillaje',
            description: 'Maquillaje social y para eventos.',
            services: [
              {
                key: 'maquillaje_social',
                name: 'Maquillaje social',
                description: 'Maquillaje para ocasión.',
              },
              {
                key: 'maquillaje_novia',
                name: 'Maquillaje de novia',
                description: 'Maquillaje profesional de novia.',
              },
            ],
          },
          {
            key: 'estilismo',
            name: 'Estilismo',
            description: 'Asesoría de imagen y peinado para eventos.',
            services: [
              {
                key: 'peinado_evento',
                name: 'Peinado para evento',
                description: 'Peinado profesional para evento.',
              },
              {
                key: 'asesoria_imagen',
                name: 'Asesoría de imagen',
                description: 'Sesión de asesoría de imagen.',
              },
            ],
          },
        ],
      },
    },
    {
      rubroKey: 'clinica_estetica',
      rubroName: 'Clínica Estética',
      sortOrder: 10,
      template: {
        categories: [
          {
            key: 'faciales_avanzados',
            name: 'Faciales avanzados',
            description: 'Procedimientos faciales estéticos.',
            services: [
              {
                key: 'limpieza_profunda',
                name: 'Limpieza facial profunda',
                description: 'Limpieza facial profunda.',
              },
              {
                key: 'peeling',
                name: 'Peeling',
                description: 'Peeling facial.',
              },
              {
                key: 'microdermoabrasion',
                name: 'Microdermoabrasión',
                description: 'Sesión de microdermoabrasión.',
              },
            ],
          },
          {
            key: 'procedimientos',
            name: 'Procedimientos estéticos',
            description: 'Procedimientos estéticos no quirúrgicos.',
            services: [
              {
                key: 'aplicacion_producto',
                name: 'Aplicación de producto estético',
                description: 'Aplicación de producto (según protocolo).',
              },
              {
                key: 'radiofrecuencia',
                name: 'Radiofrecuencia',
                description: 'Sesión de radiofrecuencia.',
              },
            ],
          },
        ],
      },
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`onboarding_rubro_template\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`rubro_key\` varchar(64) NOT NULL,
        \`rubro_name\` varchar(128) NOT NULL,
        \`template\` json NOT NULL,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`sort_order\` int NOT NULL DEFAULT 0,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_rubro_template_key\` (\`rubro_key\`),
        INDEX \`IDX_rubro_template_active\` (\`is_active\`, \`sort_order\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    for (const row of this.seed) {
      await queryRunner.query(
        `INSERT INTO \`onboarding_rubro_template\`
           (\`rubro_key\`, \`rubro_name\`, \`sort_order\`, \`template\`)
         VALUES (?, ?, ?, ?)`,
        [
          row.rubroKey,
          row.rubroName,
          row.sortOrder,
          JSON.stringify(row.template),
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`onboarding_rubro_template\``);
  }
}
