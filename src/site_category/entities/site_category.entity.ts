import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * Catálogo global de tipos de negocio del sitio (Spa, Barbería, etc.).
 *
 * Antes estaba hardcodeado en el front (SITE_CATEGORIES). Es una lista fija
 * y compartida por toda la plataforma, a diferencia de `company_category`
 * que son las categorías propias de cada compañía.
 */
@Entity('site_category')
@Index('UQ_site_category_slug', ['slug'], { unique: true })
export class SiteCategory {
  @PrimaryGeneratedColumn()
  id: number;

  /** Etiqueta visible (label). Ej: "Salón de Belleza". */
  @Column({ name: 'name', length: 145 })
  name: string;

  /** Identificador estable (value). Ej: "salon_belleza". */
  @Column({ name: 'slug', length: 100 })
  slug: string;
}
