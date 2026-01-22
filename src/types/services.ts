export type ServiceState = 'stopped' | 'passive' | 'active';
export type PermissionState = 'unknown' | 'granted' | 'denied';
export type TrackingMode = 'PASSIVE' | 'ACTIVE';

export interface TrackingStatus {
  mode: TrackingMode;
  isMonitoring: boolean;
}
