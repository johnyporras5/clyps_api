import { request as httpsRequest } from 'node:https';

export interface HttpGetOptions {
  timeoutMs: number;
  /**
   * Acepta un certificado que Node no puede validar. Se usa SOLO para el sitio
   * del BCV: sirve la cadena incompleta (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`) y
   * sin esto el respaldo oficial no se puede leer desde Node.
   */
  insecureTls?: boolean;
}

/**
 * GET de texto con timeout duro (SUB-2).
 *
 * Es el único punto de red del módulo: tenerlo aparte permite que los servicios
 * se prueben sin tocar internet, y que la excepción de TLS del BCV quede
 * acotada a una sola función en vez de contaminar el proceso entero (que es lo
 * que haría NODE_TLS_REJECT_UNAUTHORIZED=0).
 */
export async function httpGetText(
  url: string,
  options: HttpGetOptions,
): Promise<string> {
  return options.insecureTls
    ? getInsecure(url, options.timeoutMs)
    : getWithFetch(url, options.timeoutMs);
}

/** Camino normal: fetch nativo, con AbortController para cortar la espera. */
async function getWithFetch(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json, text/html' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Camino para el BCV: `fetch` no permite relajar la validación del certificado
 * sin dependencias extra, así que se baja a `node:https`, que sí acepta la
 * opción por request. Lo que se lee es un número público, no hay credenciales
 * en juego, y la tasa igual pasa por la banda de cordura antes de usarse.
 */
function getInsecure(url: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: 'GET',
        rejectUnauthorized: false,
        headers: { accept: 'text/html' },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        res.setEncoding('utf8');
        let body = '';
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => resolve(body));
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}
