import type { EventMetadata, EventSeverity } from '@/types/db';
import type { SpeedBand } from '@/types/tracking';

export interface DetectorContext {
  nowMs: number;
  speedKmh: number;
  speedBand: SpeedBand;
  speedChangeRateKmhPerSec: number;
  horizontalForceG: number;
}

export interface CorneringDetectorContext extends DetectorContext {
  headingChangeDeg: number | null;
}

export type DetectorRejectionReason = 'rate' | 'force' | 'heading' | 'speed_change' | 'cooldown' | 'missing_heading' | 'none';

export interface DetectorResult {
  detected: boolean;
  severity?: EventSeverity;
  reason: DetectorRejectionReason;
  metadata?: EventMetadata;
}
