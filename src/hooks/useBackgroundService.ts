import { useContext } from 'react';
import { BackgroundServiceContext } from './BackgroundServiceProvider';
import type { BackgroundServiceController, TrackingState, PermissionState, ServiceState } from '@types';

type UseBackgroundServiceResult = BackgroundServiceController &
  TrackingState & {
    serviceState: ServiceState;
    permissionState: PermissionState;
    checkPermissions: () => Promise<void>;
  };

export function useBackgroundService(): UseBackgroundServiceResult {
  const context = useContext(BackgroundServiceContext);

  if (!context) {
    throw new Error('useBackgroundService must be used within a BackgroundServiceProvider');
  }

  const { service, state, permissionState, checkPermissions } = context;

  const derivedServiceState = !state.isMonitoring ? 'stopped' : state.mode === 'ACTIVE' ? 'active' : 'passive';

  return {
    ...service,
    ...state,

    permissionState,
    serviceState: derivedServiceState,

    checkPermissions,
  };
}
