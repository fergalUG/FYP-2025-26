export interface ScoringStats {
  durationMs: number;

  score: number;
  avgScore: number;
  blendedAvgScore: number;
  endScore: number;
  minScore: number;

  harshBrakingCount: number;
  harshAccelerationCount: number;
  sharpTurnCount: number;

  moderateSpeedingEpisodeCount: number;
  harshSpeedingEpisodeCount: number;
  moderateSpeedingSeconds: number;
  harshSpeedingSeconds: number;

  avgSpeed: number;
  maxSpeed: number;
}
