const MAX_LENGTH = 60;

const BLOCKED_WORDS = new Set([
  'puta',
  'puto',
  'putas',
  'putos',
  'mierda',
  'cono',
  'verga',
  'pinga',
  'culo',
  'cuca',
  'marico',
  'marica',
  'maricon',
  'mamaguevo',
  'mamaguebo',
  'guevon',
  'guebon',
  'huevon',
  'webon',
  'gueva',
  'guevo',
  'pajuo',
  'pajua',
  'cabron',
  'pendejo',
  'pendeja',
  'carajo',
  'joder',
  'follar',
  'polla',
  'pene',
  'vagina',
  'tetas',
  'sexo',
  'mamada',
  'culiao',
  'perra',
  'zorra',
  'idiota',
  'estupido',
  'imbecil',
  'malparido',
  'gonorrea',
]);

const BLOCKED_FRAGMENTS = [
  'masturb',
  'mamaguev',
  'mamagueb',
  'hijodeputa',
  'hijueputa',
  'malparid',
  'pendej',
  'conoetumadre',
  'teorino',
  'rosamelano',
  'rozamelano',
  'tuculo',
  'tuputa',
];

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const looksLikeGibberish = (word: string) => {
  const letters = word.replace(/[^a-z]/g, '');
  if (letters.length < 3) return false;
  if (!/[aeiouy]/.test(letters)) return true;
  if (/(.)\1\1/.test(letters)) return true;
  if (/(..)\1\1/.test(letters)) return true;
  if (/[^aeiouy]{5,}/.test(letters)) return true;
  return false;
};

export function validatePersonName(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (!value) return 'Escribe tu nombre y apellido.';
  if (value.length > MAX_LENGTH) return 'El nombre es demasiado largo.';

  const normalized = normalize(value);
  if (!/^[a-z' .-]+$/.test(normalized.replace(/’/g, "'"))) {
    return 'Usa solo letras en tu nombre.';
  }

  const words = normalized.split(' ').filter(Boolean);
  if (words.filter((w) => w.replace(/[^a-z]/g, '').length >= 2).length < 2) {
    return 'Escribe tu nombre y apellido.';
  }

  const compact = normalized.replace(/[^a-z]/g, '');
  if (
    words.some((w) => BLOCKED_WORDS.has(w.replace(/[^a-z]/g, ''))) ||
    BLOCKED_FRAGMENTS.some((f) => compact.includes(f)) ||
    words.some(looksLikeGibberish)
  ) {
    return 'Escribe tu nombre real.';
  }

  return null;
}
