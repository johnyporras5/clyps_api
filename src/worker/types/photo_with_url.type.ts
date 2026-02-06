import { Worker } from '../entities/worker.entity';

export type PhotoWithUrl = Worker & {
  photoUrl: string;

  user?: {
    id: number;
    username: string;
    email: string;
    userType: string;
    lastLogin: Date;
    lastLogout: Date;
    createdAt: Date;
    updatedAt: Date;
    emailVerified: number;
  };
};