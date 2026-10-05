import {
  isLegacyIdentityCompany,
  legacyIdentityCompanyIds,
  withoutLegacyIdentityCompanies,
} from './legacy-identity.util';

describe('salones excluidos del cambio de identidad', () => {
  const original = process.env.LEGACY_IDENTITY_COMPANY_IDS;
  afterEach(() => {
    if (original === undefined) delete process.env.LEGACY_IDENTITY_COMPANY_IDS;
    else process.env.LEGACY_IDENTITY_COMPANY_IDS = original;
  });

  it('sin la variable no queda nadie fuera', () => {
    delete process.env.LEGACY_IDENTITY_COMPANY_IDS;
    expect(legacyIdentityCompanyIds()).toEqual([]);
    expect(isLegacyIdentityCompany(12)).toBe(false);
  });

  it('vacía tampoco', () => {
    process.env.LEGACY_IDENTITY_COMPANY_IDS = '  ';
    expect(legacyIdentityCompanyIds()).toEqual([]);
  });

  it('lee la lista con espacios y descarta lo que no es un id', () => {
    process.env.LEGACY_IDENTITY_COMPANY_IDS = ' 12, 34 ,abc,-1,0,';
    expect(legacyIdentityCompanyIds()).toEqual([12, 34]);
  });

  it('reconoce a los de la lista y a nadie más', () => {
    process.env.LEGACY_IDENTITY_COMPANY_IDS = '12,34';
    expect(isLegacyIdentityCompany(12)).toBe(true);
    expect(isLegacyIdentityCompany(34)).toBe(true);
    expect(isLegacyIdentityCompany(41)).toBe(false);
  });

  it('sin salón (el token de un cliente) nunca es excluido', () => {
    process.env.LEGACY_IDENTITY_COMPANY_IDS = '12';
    expect(isLegacyIdentityCompany(null)).toBe(false);
    expect(isLegacyIdentityCompany(undefined)).toBe(false);
  });

  it('filtra los excluidos de una lista de salones', () => {
    process.env.LEGACY_IDENTITY_COMPANY_IDS = '12';
    expect(withoutLegacyIdentityCompanies([12, 41, 7])).toEqual([41, 7]);
  });
});
