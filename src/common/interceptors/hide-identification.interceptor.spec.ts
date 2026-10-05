import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { HideIdentificationInterceptor } from './hide-identification.interceptor';

const BODY = { id: 1, client: { id: 5, identification: 'V-1234567' } };

function httpContext(user?: { companyId: number | null }): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const handler: CallHandler = { handle: () => of(BODY) };

async function respond(context: ExecutionContext): Promise<unknown> {
  return lastValueFrom(
    new HideIdentificationInterceptor().intercept(context, handler),
  );
}

describe('HideIdentificationInterceptor', () => {
  const original = process.env.LEGACY_IDENTITY_COMPANY_IDS;
  beforeEach(() => {
    process.env.LEGACY_IDENTITY_COMPANY_IDS = '12';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.LEGACY_IDENTITY_COMPANY_IDS;
    else process.env.LEGACY_IDENTITY_COMPANY_IDS = original;
  });

  it('un salón excluido no ve la cédula de su cliente', async () => {
    expect(await respond(httpContext({ companyId: 12 }))).toEqual({
      id: 1,
      client: { id: 5 },
    });
  });

  it('el mismo cliente, visto desde un salón normal, sí la trae', async () => {
    expect(await respond(httpContext({ companyId: 41 }))).toBe(BODY);
  });

  it('el cliente en su propia app (token sin salón) ve la suya', async () => {
    expect(await respond(httpContext({ companyId: null }))).toBe(BODY);
  });

  it('una ruta pública (sin usuario) queda igual', async () => {
    expect(await respond(httpContext(undefined))).toBe(BODY);
  });

  it('fuera de HTTP no hace nada', async () => {
    const context = { getType: () => 'ws' } as unknown as ExecutionContext;
    expect(await respond(context)).toBe(BODY);
  });
});
