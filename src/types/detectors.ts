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

export interface OscillationDetectorContext {
  nowMs: number;
  speedKmh: number;
  speedBand: SpeedBand;
  speedChangeRateKmhPerSec: number | null;
  speedReliable: boolean;
  suppressed: boolean;
}

export type StopAndGoPhase = 'moving' | 'stopped' | 'unknown';

export interface StopAndGoDetectorContext {
  nowMs: number;
  speedKmh: number;
}

export interface StopAndGoDetectorState {
  phase: StopAndGoPhase;
  cycleCount: number;
  stopCandidateStartMs: number | null;
  goCandidateStartMs: number | null;
  lastEventTimeMs: number | null;
}

export type StopAndGoDetectorReason = 'none' | 'speed_band' | 'insufficient_cycles' | 'cooldown';

export interface StopAndGoDetectorResult {
  detected: boolean;
  reason: StopAndGoDetectorReason;
  state: StopAndGoDetectorState;
  metadata?: EventMetadata;
}

type DetectorRejectionReason =
  | 'rate'
  | 'force'
  | 'heading'
  | 'speed_change'
  | 'std_dev'
  | 'sign_flips'
  | 'cooldown'
  | 'missing_heading'
  | 'none';

export interface DetectorResult {
  detected: boolean;
  severity?: EventSeverity;
  reason: DetectorRejectionReason;
  metadata?: EventMetadata;
}
