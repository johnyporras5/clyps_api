export interface ExtraServiceResponse {
  id: number;
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

export interface SessionDetailResponse {
  id: number;
  cost: number;
  serviceId: number;
  serviceName: string;
  serviceDescription: string;
  companyWorkerId: number | null;
  workerName: string | null;
  startDatetime: Date;
  totalTime: number;
  totalWorker: number;
  totalCompany: number;
  status: number;
  workerPercentage: number;
  companyPercentage: number;
  description?: string | null;
  descriptionIA?: string | null;
  descriptionWorker?: string | null;
  isOffer: boolean;
  offerId: number | null;
  offer: OfferDetailResponse | null;
  originalPrice: number;
  appliedPrice: number;
  // Datos de cancelación del servicio (sólo cuando status = 5 = Cancelado)
  cancelReason?: string | null;
  cancelledBy?: string | null;
  cancelledByText?: string | null;
}

export interface SessionResponse {
  id: number;
  clientId: number;
  clientName: string;
  clientLastName: string;
  clientPicture: string | null;
  companyId: number;
  companyName: string;
  sessionDatetime: Date;
  sessionStatus: number;
  sessionStatusText: string;
  totalCost: number;
  totalTime: number;
  startDatetime: Date;
  status: number;
  iaResponse: any;
  descriptionIA?: string | null;
  description?: string | null;
  extraServices?: ExtraServiceResponse[];
  createdAt?: Date;
  updatedAt?: Date;
  // Datos de cancelación de la cita (sólo cuando sessionStatus = 5 = Cancelada)
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  cancelledByText?: string | null;
  details: SessionDetailResponse[];
}
