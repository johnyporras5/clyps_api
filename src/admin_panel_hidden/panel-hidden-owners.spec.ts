import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { User } from '../user/entities/user.entity';
import type { PanelHiddenOwner } from './entities/panel-hidden-owner.entity';
import { PanelHiddenOwnersController } from './panel-hidden-owners.controller';
import { PanelHiddenOwnersService } from './panel-hidden-owners.service';

function build(userExists = true) {
  const execute = jest.fn().mockResolvedValue({});
  const qb = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute,
  };
  const remove = jest.fn().mockResolvedValue({});
  const hidden = {
    find: jest.fn().mockResolvedValue([{ userId: 7 }, { userId: 3 }]),
    delete: remove,
    createQueryBuilder: jest.fn(() => qb),
  } as unknown as Repository<PanelHiddenOwner>;
  const users = {
    exists: jest.fn().mockResolvedValue(userExists),
  } as unknown as Repository<User>;
  return {
    service: new PanelHiddenOwnersService(hidden, users),
    remove,
    qb,
  };
}

describe('PanelHiddenOwnersService', () => {
  it('lista solo los ids', async () => {
    await expect(build().service.list()).resolves.toEqual([7, 3]);
  });

  it('ocultar es idempotente (INSERT IGNORE) y guarda quién lo hizo', async () => {
    const t = build();
    await t.service.hide(7, 1);
    expect(t.qb.values).toHaveBeenCalledWith({ userId: 7, hiddenBy: 1 });
    expect(t.qb.orIgnore).toHaveBeenCalled();
  });

  it('404 si la cuenta no existe', async () => {
    const t = build(false);
    await expect(t.service.hide(99, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(t.qb.execute).not.toHaveBeenCalled();
  });

  it('mostrar de nuevo borra solo la marca', async () => {
    const t = build();
    await t.service.unhide(7, 1);
    expect(t.remove).toHaveBeenCalledWith({ userId: 7 });
  });
});

describe('PanelHiddenOwnersController', () => {
  // El RolesGuard lee la metadata del HANDLER: si un método la pierde, cualquier
  // dueño logueado podría ocultar filas del panel.
  it.each(['list', 'hide', 'unhide'] as const)('%s exige padm', (method) => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      PanelHiddenOwnersController.prototype,
      method,
    )?.value;
    expect(Reflect.getMetadata('roles', handler as object)).toEqual(['padm']);
  });
});
