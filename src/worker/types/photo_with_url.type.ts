import { Worker } from '../entities/worker.entity';
import { WorkerFeedback } from '../../worker_feedback/entities/worker_feedback.entity';
import { WorkerFeedbackStatsDto } from '../dto/worker-feedback-stats.dto';

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

   feedbackSummary?: {
    averageStars: number;
    totalReviews: number;
    recentReviews: WorkerFeedback[];
  };
};