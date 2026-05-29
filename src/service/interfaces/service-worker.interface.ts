export interface ServiceWorker {
  id: number;
  percentage?: number;
  time?: number;
}

export interface ServiceWorkerWithInfo extends ServiceWorker {
  workerInfo?: {
    id: number;
    name: string;
    lastName: string;
    picture?: string;
    phone?: string;
  };
  userInfo?: {
    id: number;
    username: string;
    email: string;
  };
}
