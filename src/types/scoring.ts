export interface ScoringStats {
  durationMs: number;
  speedLimitDetectionEnabled: boolean;

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

  lightOscillationEpisodeCount: number;
  moderateOscillationEpisodeCount: number;
  harshOscillationEpisodeCount: number;
  lightOscillationSeconds: number;
  moderateOscillationSeconds: number;
  harshOscillationSeconds: number;

  avgSpeed: number;
  maxSpeed: number;
}
