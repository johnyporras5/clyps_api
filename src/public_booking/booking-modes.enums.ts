export const BOOKING_MODES = ['free', 'approval', 'deposit'] as const;
export type BookingMode = (typeof BOOKING_MODES)[number];

export const DEPOSIT_TYPES = ['fixed', 'percent'] as const;
export type DepositType = (typeof DEPOSIT_TYPES)[number];

export const BOOKING_REQUEST_STATUSES = [
  'confirmed',
  'pending_approval',
  'pending_payment',
  'rejected',
  'expired',
] as const;
export type BookingRequestStatus = (typeof BOOKING_REQUEST_STATUSES)[number];

export const PENDING_STATUSES: BookingRequestStatus[] = [
  'pending_approval',
  'pending_payment',
];

export const DEFAULT_LEAD_MINUTES = 60;
export const DEFAULT_HOLD_HOURS = 24;
