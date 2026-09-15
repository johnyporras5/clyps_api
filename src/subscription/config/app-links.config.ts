/**
 * Dónde vive Clyps en el navegador (CLYP-339 / CLYP-340).
 *
 * Es el mismo dominio que ya usan los demás correos del producto
 * (`email.service.ts`): si el aviso de cobro mandara a otra dirección, el dueño
 * vería dos "Clyps" distintos y en un correo de dinero eso se lee como fraude.
 *
 * Va como constante y no como variable de entorno obligatoria a propósito: el
 * dominio del producto no cambia por ambiente, y dejarlo en el `.env` significa
 * que el día que alguien olvide cargarlo los correos salen sin botón. La
 * variable sigue mandando cuando está puesta —para probar contra un dominio de
 * pruebas—, pero ya no hace falta para que el enlace exista.
 */
export const WEB_APP_URL = 'https://sistemaclyps.com';

/**
 * A dónde lleva el botón de los avisos de cobro: la pantalla de pago.
 *
 * Es una ruta de la app web (`/pay`), no la portada: el dueño que abre un aviso
 * de cobro viene a pagar, y dejarlo en la portada le obliga a buscar el camino
 * él solo.
 */
export const PAY_URL = `${WEB_APP_URL}/pay`;
