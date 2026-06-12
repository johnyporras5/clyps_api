/** Slot válido de "Antes y después". */
export type BeforeAfterSlot = 'before' | 'after';

/** Información de quién subió una foto (inferida del token por el backend). */
export interface BeforeAfterUploadedBy {
  id: string;
  name: string;
}

/** Una foto de un slot (before / after). `null` cuando aún no hay foto. */
export interface BeforeAfterPhoto {
  url: string;
  uploadedAt: string; // ISO 8601
  uploadedBy: BeforeAfterUploadedBy;
}

/** Modelo de respuesta del recurso "Antes y después" de una sesión. */
export interface AppointmentBeforeAfterResponse {
  sessionId: string;
  before: BeforeAfterPhoto | null;
  after: BeforeAfterPhoto | null;
}
