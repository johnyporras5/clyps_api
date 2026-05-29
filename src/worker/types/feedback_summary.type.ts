import { WorkerFeedback } from 'src/worker_feedback/entities/worker_feedback.entity';

export type FeedbackSummary = {
  averageStars: number;
  totalReviews: number;
  recentReviews: WorkerFeedback[]; // últimos N (ej. 5)
};
