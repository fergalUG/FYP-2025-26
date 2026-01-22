import type { ServiceState, PermissionState } from './services';

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
