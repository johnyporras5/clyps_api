import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { PanelHiddenOwner } from './entities/panel-hidden-owner.entity';

/**
 * Ocultar / volver a mostrar filas en la lista de compañías del panel.
 *
 * Es puramente visual para el panel: nada en la app lee esta tabla, así que
 * ocultar un salón no le cambia nada al salón.
 *
 * Ambas operaciones son idempotentes: ocultar dos veces (doble clic, dos
 * administradores a la vez) no falla ni duplica; mostrar algo que ya se veía
 * tampoco.
 */
@Injectable()
export class PanelHiddenOwnersService {
  private readonly logger = new Logger(PanelHiddenOwnersService.name);

  constructor(
    @InjectRepository(PanelHiddenOwner)
    private readonly hidden: Repository<PanelHiddenOwner>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /** Ids de las cuentas ocultas, de la más reciente a la más vieja. */
  async list(): Promise<number[]> {
    const rows = await this.hidden.find({
      select: { userId: true },
      order: { hiddenAt: 'DESC' },
    });
    return rows.map((row) => row.userId);
  }

  async hide(userId: number, actorUserId: number): Promise<void> {
    const exists = await this.users.exists({ where: { id: userId } });
    if (!exists) throw new NotFoundException('La cuenta no existe.');

    // `orIgnore`: si ya estaba oculta, no hace nada (y no pisa quién la ocultó).
    await this.hidden
      .createQueryBuilder()
      .insert()
      .into(PanelHiddenOwner)
      .values({ userId, hiddenBy: actorUserId })
      .orIgnore()
      .execute();
    this.logger.log(
      `Cuenta ${userId} oculta del panel por el usuario ${actorUserId}.`,
    );
  }

  async unhide(userId: number, actorUserId: number): Promise<void> {
    await this.hidden.delete({ userId });
    this.logger.log(
      `Cuenta ${userId} vuelve a mostrarse en el panel (usuario ${actorUserId}).`,
    );
  }
}
