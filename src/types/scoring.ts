export interface ScoringStats {
  durationMs: number;

  score: number;
  avgScore: number;
  blendedAvgScore: number;
  endScore: number;
  minScore: number;

  harshBrakingCount: number;
  moderateBrakingCount: number;
  lightBrakingCount: number;
  harshAccelerationCount: number;
  moderateAccelerationCount: number;
  lightAccelerationCount: number;
  sharpTurnCount: number;
  moderateTurnCount: number;
  lightTurnCount: number;
  stopAndGoCount: number;

  lightSpeedingEpisodeCount: number;
  moderateSpeedingEpisodeCount: number;
  harshSpeedingEpisodeCount: number;
  lightSpeedingSeconds: number;
  moderateSpeedingSeconds: number;
  harshSpeedingSeconds: number;

  avgSpeed: number;
  maxSpeed: number;
}
