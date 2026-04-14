
export interface ExtraServiceResponse {
  id: number;
  serviceId: number;
  serviceName: string;
  providerId: number;
  providerName: string;
  date: string;
  time: string;
  durationMinutes: number;
  priceOption: "default" | "custom" | "free";
  price: number;
  customPrice?: number;
  createdAt: string;
}

export interface SessionDetailResponse {
  id: number;
  cost: number;
  serviceId: number;
  serviceName: string;
  serviceDescription: string;
  companyWorkerId: number;
  workerName: string;
  workerLastName: string;
  startDatetime: Date;
  totalTime: number;
  totalWorker: number;
  totalCompany: number;
  status: number;
  workerPercentage: number;
  companyPercentage: number;
  descriptionWorker?: string;

  
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
  descriptionIA?: string;
  description?: string;
  extraServices?: ExtraServiceResponse[]; createdAt?: Date;
  updatedAt?: Date;
  details: SessionDetailResponse[];

}