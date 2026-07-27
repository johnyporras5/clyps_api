// Refleja el shape real almacenado en session.extra_services (entidad Session).
export interface ExtraServiceResponse {
  sessionDetailId: number;
  serviceId: number;
  serviceName: string;
  providerId: number;
  providerName: string;
  date: string;
  time: string;
  durationMinutes: number;
  priceOption: 'default' | 'custom' | 'free';
  price: number;
  customPrice?: number;
  description?: string;
  descriptionIA?: string;
  createdAt: string;
}

export interface OfferDetailResponse {
  id: number;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  status: number;
  logoUrl: string | null;
  originalPrice: number;
  offerPrice: number;
  discountAmount: number;
  discountPercentage: number;
}

// Cobro de la cita (POST /sessions/:id/payment). Tasas y montos históricos.
export interface SessionPaymentResponse {
  id: number;
  method: string | null;
  reference: string | null;
  tipCurrency: string | null;
  tip: number;
  tipExchangeRate: number | null;
  tipBs: number | null;
  totalBs: number | null;
  paidBy: number;
  paidAt: Date;
  lines: Array<{
    currency: string;
    subtotal: number;
    exchangeRate: number | null;
    subtotalBs: number | null;
  }>;
  tips: Array<{ companyWorkerId: number; amount: number }>;
}

// Mismo shape que cada servicio del listado de admin (findAllSessionsSimple).
export interface SessionDetailResponse {
  detailId: number;
  serviceId: number;
  serviceName: string;
  serviceDescription: string;
  serviceCost: number;
  // Código ISO de la moneda del servicio (ej. "USD", "EUR", "VES").
  currency: string | null;
  // Tiempo estimado del servicio definido por la compañía (en minutos)
  standardTime: number | null;
  // Tiempo planificado del trabajador para este servicio (en minutos)
  durationWorker: number;
  // Tiempo real del servicio (inicio→fin; 0 si no está completado)
  realDuration: number;
  startDatetime: Date;
  // Fin por detalle (CLYP-311 / B4): para dibujar el bloque en el calendario.
  endDatetime?: Date | null;
  // Hora AGENDADA original del servicio (no se mueve con Comenzar/Terminar ni
  // con el arrastre). Para mostrar "agendada X · movida a Y".
  originalStartDatetime?: Date | null;
  originalEndDatetime?: Date | null;
  companyWorkerId: number | null;
  workerId: number | null;
  workerName: string;
  originalPrice: number;
  appliedPrice: number;
  isOffer: boolean;
  offerId: number | null;
  offer: OfferDetailResponse | null;
  totalWorker: number;
  totalCompany: number;
  detailStatus: number;
  detailStatusText: string;
  isExtra: boolean;
  // Cortesía: servicio prestado sin cobrar (cost 0, sin comisión, no cuenta
  // como ingreso ni servicio pagado). Se sigue mostrando en la cita.
  isCourtesy: boolean;
  description?: string | null;
  descriptionIA?: string | null;
  descriptionWorker?: string | null;
  // Datos de cancelación del servicio (sólo cuando status = 5 = Cancelado)
  cancelReason?: string | null;
  cancelledBy?: string | null;
  cancelledByText?: string | null;
}

// Mismo shape que cada sesión del listado de admin (findAllSessionsSimple).
export interface SessionResponse {
  id: number;
  clientId: number;
  clientName: string;
  clientLastName: string;
  clientPicture: string | null;
  companyId: number;
  companyName: string;
  // Dirección de la cita (dirección de la compañía)
  address: string | null;
  sessionDatetime: Date;
  sessionStatus: number;
  sessionStatusText: string;
  totalCost: number;
  // Tiempo estimado total del trabajador para la cita (suma de durationWorker)
  workerEstimateTime: number;
  // Duración real total de la cita (suma de realDuration de cada servicio)
  realTotalTime: number;
  startDatetime: Date;
  // Hora AGENDADA original de la cita (no se mueve con Comenzar/Terminar ni con
  // el arrastre). Para mostrar la hora original en la tarjeta.
  originalStartDatetime?: Date | null;
  status: number;
  iaResponse: any;
  servicesCount: number;
  services: SessionDetailResponse[];
  extraServices?: ExtraServiceResponse[];
  // Cobro registrado al marcar la cita como pagada (POST /sessions/:id/payment).
  // Misma forma que el payload de registro + paidAt/paidBy. Null si no hay.
  payment?: SessionPaymentResponse | null;
  createdAt?: Date;
  updatedAt?: Date;
  // B1: estado de calificación del cliente para esta cita (aditivo).
  feedback?: {
    status: 'pending' | 'partial' | 'completed' | 'skipped';
    companyRated: boolean;
    ratedCompanyWorkerIds: number[];
    pendingCompanyWorkerIds: number[];
    skippedAt: Date | null;
  } | null;
  // Datos de cancelación de la cita (sólo cuando sessionStatus = 5 = Cancelada)
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  cancelledByText?: string | null;
}
