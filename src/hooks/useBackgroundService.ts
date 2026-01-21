import { useState, useEffect, useCallback } from 'react';
import * as BackgroundService from '../services/BackgroundService';
import type { ServiceState, PermissionState, BackgroundServiceHook } from '../types/types';
import { executeWithLoading } from '../utils/async';

export function useBackgroundService(): BackgroundServiceHook {
  const [serviceState, setServiceState] = useState<ServiceState>('stopped');
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown');
  const [isLoading, setIsLoading] = useState<boolean>(false);

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
  }, []);

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
  }, []);

  const startActiveTracking = useCallback(async (): Promise<boolean> => {
    const result = await executeWithLoading(async () => {
      await BackgroundService.ManualStartActiveTracking();
      setServiceState('active');
      return true;
    }, setIsLoading);

    return result !== null;
  }, []);

  const stopActiveTracking = useCallback(async (): Promise<boolean> => {
    const result = await executeWithLoading(async () => {
      await BackgroundService.ManualStopActiveTracking();
      setServiceState('passive');
      return true;
    }, setIsLoading);

    return result !== null;
  }, []);

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
      const hasPermissions = await checkPermissions();
      if (hasPermissions && serviceState === 'stopped') {
        await startMonitoring();
      }
    };

    initializeService();
  }, [checkPermissions, startMonitoring, serviceState]);

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
