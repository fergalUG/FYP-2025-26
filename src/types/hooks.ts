export type ServiceState = 'stopped' | 'passive' | 'active';
export type PermissionState = 'unknown' | 'granted' | 'denied';
export type TrackingMode = 'PASSIVE' | 'ACTIVE';

export interface TrackingStatus {
  mode: TrackingMode;
  isMonitoring: boolean;
}

export interface BackgroundServiceHook {
  serviceState: ServiceState;
  permissionState: PermissionState;
  isLoading: boolean;
  startMonitoring: () => Promise<boolean>;
  stopMonitoring: () => Promise<boolean>;
  startActiveTracking: () => Promise<boolean>;
  stopActiveTracking: () => Promise<boolean>;
  checkPermissions: () => Promise<boolean>;
  setupService: () => Promise<boolean>;
}