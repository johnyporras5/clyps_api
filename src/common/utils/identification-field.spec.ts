// Los decoradores del DTO leen metadata: fuera de Nest hay que cargarla a mano.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterWorkerDto } from '../../auth/dto/register-worker.dto';
import { UpdateClientDto } from '../../client/dto/update-client.dto';

/** Lo que recibiría el servicio, o los campos con error si el pipe lo frena. */
function parse(body: Record<string, unknown>): {
  identification: unknown;
  errors: string[];
} {
  const dto = plainToInstance(RegisterWorkerDto, body, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((error) => error.property);
  return { identification: dto.identification, errors };
}

describe('campo identification de los DTO', () => {
  const base = { username: 'maria' };

  it.each([
    ['V-12345678', 'V-12345678'],
    ['v 12.345.678', 'V-12345678'],
    ['j401234567', 'J-401234567'],
    ['J-40123456-7', 'J-401234567'],
  ])('%s llega al servicio como %s', (escrita, guardada) => {
    expect(parse({ ...base, identification: escrita })).toEqual({
      identification: guardada,
      errors: [],
    });
  });

  it.each([
    ['12345678', 'sin letra'],
    ['X-12345678', 'letra que no existe'],
    ['V-123', 'muy corta'],
  ])('rechaza %s (%s)', (escrita) => {
    expect(parse({ ...base, identification: escrita }).errors).toEqual([
      'identification',
    ]);
  });

  it('es opcional', () => {
    expect(parse(base)).toEqual({ identification: undefined, errors: [] });
  });

  it('vacía llega como null, para que una edición la borre', () => {
    expect(parse({ ...base, identification: '   ' })).toEqual({
      identification: null,
      errors: [],
    });
  });

  it('un número suelto (form-data sin letra) se rechaza, no se adivina', () => {
    expect(parse({ ...base, identification: 12345678 }).errors).toEqual([
      'identification',
    ]);
  });

  it('está también en la edición del cliente', () => {
    const dto = plainToInstance(UpdateClientDto, {
      identification: 'e 1234567',
    });
    expect(validateSync(dto)).toEqual([]);
    expect(dto.identification).toBe('E-1234567');
  });
});
