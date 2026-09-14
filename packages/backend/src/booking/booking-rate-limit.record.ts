export interface BookingRateLimitRecord {
  _id: string;
  hits: number;
  expiresAt: Date;
}
