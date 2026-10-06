// `uuid` se publica como ESM y jest no lo transforma; el servicio de archivos
// lo importa.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { BadRequestException } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { FileUploadService } from '../common/services/file_upload.service';

/**
 * El dueño edita a un trabajador que todavía no tiene cuenta (sin correo, sin
 * fila en `user`). Lo que se prueba es que no se intente actualizar un usuario
 * que no existe, y que el freno llegue ANTES de subir la foto.
 */
function setup(worker: { id: number; userId: number | null }) {
  const repo = () => ({
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  });
  const workers = repo();
  const users = repo();
  const companyWorkers = repo();
  const companies = repo();
  const files = { saveFile: jest.fn(), deleteFile: jest.fn() };

  workers.findOne.mockResolvedValue({ ...worker, picture: null, user: null });
  companies.findOne.mockResolvedValue({ id: 41 });
  companyWorkers.findOne.mockResolvedValue({ id: 7, workerId: worker.id });

  const service = new WorkerService(
    workers as never,
    users as never,
    companyWorkers as never,
    companies as never,
    repo() as never,
    repo() as never,
    files as unknown as FileUploadService,
  );
  return { service, users, workers, files };
}

const PHOTO = { originalname: 'a.jpg' } as Express.Multer.File;

describe('el dueño edita a un trabajador sin cuenta', () => {
  it('cambiarle el usuario o el correo responde 400 y no sube la foto', async () => {
    const { service, users, files } = setup({ id: 3, userId: null });

    const error = await service
      .updateWorkerByAdmin(3, 1, { username: 'nuevo' }, PHOTO)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'WORKER_HAS_NO_ACCOUNT',
    });
    expect(files.saveFile).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
  });

  it('el correo también: darle acceso es otro endpoint', async () => {
    const { service } = setup({ id: 3, userId: null });
    await expect(
      service.updateWorkerByAdmin(3, 1, { email: 'ana@x.com' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('con cuenta, cambiar el usuario sigue igual que antes', async () => {
    const { service, users } = setup({ id: 3, userId: 99 });

    // El resto del método (recargar el trabajador) no interesa aquí.
    await service
      .updateWorkerByAdmin(3, 1, { username: 'nuevo' })
      .catch(() => undefined);

    expect(users.update).toHaveBeenCalledWith(99, { username: 'nuevo' });
  });
});

describe('respuesta de la edición de un trabajador sin cuenta', () => {
  it('cambiarle el nombre no tira 500: sale con user en null', async () => {
    const { service, workers } = setup({ id: 3, userId: null });

    await expect(
      service.updateWorkerByAdmin(3, 1, { name: 'Luis' }),
    ).resolves.toMatchObject({ worker: { id: 3, user: null } });
    expect(workers.update).toHaveBeenCalledWith(3, { name: 'Luis' });
  });
});
