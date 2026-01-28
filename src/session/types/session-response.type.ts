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
  workerName?: string;
  workerLastName?: string;
  serviceName?: string;
  createdAt?: Date;
  updatedAt?: Date;
}