// En types/session-response.type.ts
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
}

export interface SessionResponse {
  id: number;
  clientId: number;
  clientName: string;
  clientLastName: string;
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
  createdAt?: Date;
  updatedAt?: Date;
  details: SessionDetailResponse[]; 
}