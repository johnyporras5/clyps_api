import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashTransaction } from './entities/cash-transaction.entity';
import { Company } from '../company/entities/company.entity';
import { normalizeSupplierName } from './cash-supplier.util';

/** Una sugerencia del autocompletado de proveedores. */
export interface SupplierSuggestion {
  /** Nombre tal como se escribió la última vez (lo que se muestra). */
  name: string;
  /** Clave normalizada con la que se agrupa. */
  key: string;
  /** Cuántos movimientos lleva ese proveedor. */
  usageCount: number;
  /** Fecha del movimiento más reciente. */
  lastUsedAt: string;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

@Injectable()
export class CashSupplierService {
  constructor(
    @InjectRepository(CashTransaction)
    private readonly transactionRepository: Repository<CashTransaction>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  private async getCompanyOrFail(adminId: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company)
      throw new UnauthorizedException('No tienes una compañía asignada');
    return company;
  }

  /**
   * Proveedores que la company ya usó, filtrados por lo que se va escribiendo
   * (CLYP-355). No hay catálogo: las sugerencias salen del histórico de
   * movimientos.
   *
   * Se busca sobre `supplier_key`, así que escribir "lopez" encuentra
   * "Ferretería López". Cada proveedor aparece UNA vez — con la grafía de su
   * movimiento más reciente, que es la que el dueño usa hoy.
   *
   * Sin `q` devuelve los más usados: sirve para mostrar algo apenas el campo
   * recibe el foco.
   */
  async suggest(
    adminId: number,
    q?: string,
    limit?: number,
  ): Promise<SupplierSuggestion[]> {
    const company = await this.getCompanyOrFail(adminId);

    // El límite se interpola en el SQL, así que se sanea a entero acotado.
    const safeLimit = Math.min(
      Math.max(Math.trunc(Number(limit) || DEFAULT_LIMIT), 1),
      MAX_LIMIT,
    );

    // Se busca por la clave normalizada, no por lo escrito crudo: así "LOPEZ",
    // "lópez" y " lopez " llegan todas a la misma búsqueda.
    const needle = normalizeSupplierName(q);
    const params: unknown[] = [company.id];
    let filter = '';
    if (needle !== null) {
      filter = `AND supplier_key LIKE ? ESCAPE '!'`;
      params.push(`%${escapeLike(needle)}%`);
    }

    const rows: Array<{
      name: string;
      key: string;
      usageCount: number | string;
      lastUsedAt: string | Date;
    }> = await this.transactionRepository.query(
      `SELECT k.supplier_key AS \`key\`,
              k.name AS name,
              k.usage_count AS usageCount,
              k.last_used_at AS lastUsedAt
         FROM (
           SELECT supplier_key,
                  FIRST_VALUE(supplier_name) OVER (
                    PARTITION BY supplier_key ORDER BY \`date\` DESC, id DESC
                  ) AS name,
                  COUNT(*) OVER (PARTITION BY supplier_key) AS usage_count,
                  MAX(\`date\`) OVER (PARTITION BY supplier_key) AS last_used_at,
                  ROW_NUMBER() OVER (
                    PARTITION BY supplier_key ORDER BY \`date\` DESC, id DESC
                  ) AS rn
             FROM cash_transaction
            WHERE company_id = ?
              AND supplier_key IS NOT NULL
              ${filter}
         ) k
        WHERE k.rn = 1
        ORDER BY k.usage_count DESC, k.last_used_at DESC, k.name ASC
        LIMIT ${safeLimit}`,
      params,
    );

    return rows.map((r) => ({
      name: r.name,
      key: r.key,
      usageCount: Number(r.usageCount),
      lastUsedAt:
        r.lastUsedAt instanceof Date
          ? r.lastUsedAt.toISOString().slice(0, 10)
          : String(r.lastUsedAt),
    }));
  }
}

/** Neutraliza los comodines del LIKE para que se busquen como texto normal. */
function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, (char) => `!${char}`);
}
