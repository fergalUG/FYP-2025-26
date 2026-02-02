import type { TrackingState } from '@/types/services/backgroundService';
import type { GpsDropoutState, ServiceHealth } from '@/types/tracking';

export const checkServiceHealth = (state: TrackingState, dropoutState: GpsDropoutState, now: number): ServiceHealth => {
  const issues: string[] = [];
  const lastLocationTimestamp = state.lastLocation?.timestamp ?? null;
  const timeSinceLastLocationMs = lastLocationTimestamp ? now - lastLocationTimestamp : null;

  if (timeSinceLastLocationMs !== null && timeSinceLastLocationMs > 30000) {
    issues.push(`No location updates for ${Math.round(timeSinceLastLocationMs / 1000)}s`);
  }

  if (state.consecutiveInvalidSpeeds >= 5) {
    issues.push(`GPS speed invalid ${state.consecutiveInvalidSpeeds} times in a row`);
  }

  const gpsDropoutDurationMs =
    dropoutState.isInDropout && dropoutState.dropoutStartTime !== null ? now - dropoutState.dropoutStartTime : null;
  if (gpsDropoutDurationMs !== null) {
    issues.push(`GPS dropout ongoing (${Math.round(gpsDropoutDurationMs / 1000)}s)`);
  }

  return {
    isHealthy: issues.length === 0,
    issues,
    lastLocationTimestamp,
    consecutiveInvalidSpeeds: state.consecutiveInvalidSpeeds,
    timeSinceLastLocationMs,
    gpsDropoutDurationMs,
  };
};
