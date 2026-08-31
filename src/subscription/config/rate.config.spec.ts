import { RATE_SOURCES, parseRateNumber } from './rate.config';

describe('parseRateNumber', () => {
  it('acepta el formato del BCV: coma decimal y punto de millar', () => {
    expect(parseRateNumber('794,99170000')).toBe(794.9917);
    expect(parseRateNumber('1.234,56')).toBe(1234.56);
  });

  it('acepta números y decimales con punto', () => {
    expect(parseRateNumber(794.9917)).toBe(794.9917);
    expect(parseRateNumber('794.9917')).toBe(794.9917);
  });

  it('descarta lo que no es un número', () => {
    expect(parseRateNumber('no disponible')).toBeNull();
    expect(parseRateNumber(null)).toBeNull();
    expect(parseRateNumber(undefined)).toBeNull();
  });
});

describe('fuente dolarapi', () => {
  const source = RATE_SOURCES.dolarapi;

  it('apunta a la moneda pedida', () => {
    expect(source.url('oficial')).toBe(
      'https://ve.dolarapi.com/v1/dolares/oficial',
    );
    expect(source.url('euro')).toBe('https://ve.dolarapi.com/v1/euros/oficial');
  });

  it('lee promedio (respuesta real del 2026-08-31)', () => {
    const body = JSON.stringify({
      moneda: 'USD',
      fuente: 'oficial',
      compra: null,
      venta: null,
      promedio: 794.9917,
      fechaActualizacion: '2026-08-31T00:00:00-04:00',
    });
    expect(source.parse(body, 'oficial')).toBe(794.9917);
  });

  it('promedia compra y venta si un día dejan de publicar promedio', () => {
    expect(source.parse('{"compra":790,"venta":800}', 'oficial')).toBe(795);
  });

  it('devuelve null si la respuesta no trae tasa', () => {
    expect(source.parse('{}', 'oficial')).toBeNull();
    expect(source.parse('<html>404</html>', 'oficial')).toBeNull();
  });
});

describe('fuente erapi', () => {
  const source = RATE_SOURCES.erapi;

  it('consulta con la moneda base que corresponde a la tasa pedida', () => {
    expect(source.url('oficial')).toBe('https://open.er-api.com/v6/latest/USD');
    expect(source.url('euro')).toBe('https://open.er-api.com/v6/latest/EUR');
  });

  it('lee rates.VES', () => {
    const body = JSON.stringify({
      result: 'success',
      base_code: 'USD',
      rates: { EUR: 0.85, VES: 794.9917 },
    });
    expect(source.parse(body, 'oficial')).toBe(794.9917);
  });

  it('devuelve null si desaparece la moneda', () => {
    expect(source.parse('{"rates":{"EUR":0.85}}', 'oficial')).toBeNull();
  });
});

describe('fuente bcv', () => {
  const source = RATE_SOURCES.bcv;

  it('lee las dos tasas de la misma portada', () => {
    expect(source.url('oficial')).toBe('https://www.bcv.org.ve/');
    expect(source.url('euro')).toBe('https://www.bcv.org.ve/');
  });

  it('scrapea el strong de #dolar tal como lo sirve el sitio hoy', () => {
    // HTML real del 2026-08-31: el strong lleva class="strong-tb".
    const html = `
      <div id="dolar" class="col-sm-12 col-xs-12 ">
        <div class="field-content"><div class="row recuadrotsmc">
          <div class="col-sm-6 col-xs-6"><span> USD</span></div>
          <div class="col-sm-6 col-xs-6 centrado textp">
            <strong class="strong-tb">794,99170000</strong>
          </div>
        </div></div>
      </div>`;
    expect(source.parse(html, 'oficial')).toBe(794.9917);
  });

  it('lee el bloque del euro cuando se cobra en euros', () => {
    // La portada trae los dos bloques; se elige por la tasa pedida.
    const html = `
      <div id="dolar"><strong class="strong-tb">794,99170000</strong></div>
      <div id="euro"><strong class="strong-tb"> 922,69121677</strong></div>`;
    expect(source.parse(html, 'euro')).toBe(922.69121677);
    expect(source.parse(html, 'oficial')).toBe(794.9917);
  });

  it('sigue funcionando si el strong no lleva atributos', () => {
    const html = '<div id="dolar"><strong> 36,50 </strong></div>';
    expect(source.parse(html, 'oficial')).toBe(36.5);
  });

  it('devuelve null si el bloque ya no existe', () => {
    expect(
      source.parse('<html><body>mantenimiento</body></html>', 'oficial'),
    ).toBeNull();
  });
});
