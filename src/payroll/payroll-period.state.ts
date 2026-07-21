import type { PeriodStatus } from './payroll.enums';

// Máquina de estados del periodo (PAY-2): flujo lineal hacia adelante.
// Cualquier otra transición (saltar pasos, retroceder, quedarse igual) es ilegal.
// Única marcha atrás: review → open, porque en review todavía no se congela
// nada y hay que poder deshacer un "enviar a revisión" por error.
const ALLOWED: Record<PeriodStatus, PeriodStatus[]> = {
  open: ['review'],
  review: ['approved', 'open'],
  approved: ['paid'],
  paid: ['closed'],
  closed: [],
};

/** ¿Se puede pasar de `from` a `to`? */
export function canTransition(from: PeriodStatus, to: PeriodStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}
