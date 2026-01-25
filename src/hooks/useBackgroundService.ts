import { useState, useEffect, useCallback } from 'react';
import * as BackgroundService from '@services/BackgroundService';
import type { ServiceState, PermissionState, BackgroundServiceHook } from '@types';
import { executeWithLoading } from '@utils/async';
import { createLogger, LogModule } from '@utils/logger';

const logger = createLogger(LogModule.Hooks);

export function useBackgroundService(): BackgroundServiceHook {
  const [serviceState, setServiceState] = useState<ServiceState>('stopped');
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const refreshPermissionState = useCallback(async (): Promise<PermissionState> => {
    const result = await executeWithLoading(() => BackgroundService.getLocationPermissionState(), setIsLoading);
    const nextState = result ?? 'unknown';
    setPermissionState(nextState);
    return nextState;
  }, [logger]);

  const checkPermissions = useCallback(async (): Promise<boolean> => {
    const result = await executeWithLoading(async () => {
      const hasPermissions = await BackgroundService.requestLocationPermissions();
      setPermissionState(hasPermissions ? 'granted' : 'denied');
      return hasPermissions;
    }, setIsLoading);

    if (result === null) {
      setPermissionState('denied');
      return false;
    }

    return result;
  }, [logger]);

  const startMonitoring = useCallback(async (): Promise<boolean> => {
    if (permissionState !== 'granted') {
      const hasPermissions = await checkPermissions();
      if (!hasPermissions) return false;
    }

    const result = await executeWithLoading(async () => {
      await BackgroundService.startLocationMonitoring();
      setServiceState('passive');
      return true;
    }, setIsLoading);

    return result !== null;
  }, [permissionState, checkPermissions]);

  const stopMonitoring = useCallback(async (): Promise<boolean> => {
    const result = await executeWithLoading(async () => {
      await BackgroundService.stopLocationMonitoring();
      setServiceState('stopped');
      return true;
    }, setIsLoading);

    return result !== null;
  }, [logger]);

  const startActiveTracking = useCallback(async (): Promise<boolean> => {
    if (!__DEV__) {
      logger.warn('startActiveTracking is a dev-only API.');
      return false;
    }

    const result = await executeWithLoading(async () => {
      await BackgroundService.ManualStartActiveTracking();
      setServiceState('active');
      return true;
    }, setIsLoading);

    return result !== null;
  }, [logger]);

  const stopActiveTracking = useCallback(async (): Promise<boolean> => {
    if (!__DEV__) {
      logger.warn('stopActiveTracking is a dev-only API.');
      return false;
    }

    const result = await executeWithLoading(async () => {
      await BackgroundService.ManualStopActiveTracking();
      setServiceState('passive');
      return true;
    }, setIsLoading);

    return result !== null;
  }, [logger]);

  const setupService = useCallback(async (): Promise<boolean> => {
    const hasPermissions = await checkPermissions();
    if (hasPermissions) {
      const success = await startMonitoring();
      return success;
    }
    return false;
  }, [checkPermissions, startMonitoring]);

  useEffect(() => {
    const initializeService = async () => {
      const state = await refreshPermissionState();
      if (state === 'granted' && serviceState === 'stopped') {
        const started = await startMonitoring();
        if (!started) {
          logger.warn('Location monitoring could not be started during initialization.');
        }
      }
    };

    initializeService();
  }, [refreshPermissionState, startMonitoring, serviceState]);

  return {
    serviceState,
    permissionState,
    isLoading,
    startMonitoring,
    stopMonitoring,
    startActiveTracking,
    stopActiveTracking,
    checkPermissions,
    setupService,
  };
}
