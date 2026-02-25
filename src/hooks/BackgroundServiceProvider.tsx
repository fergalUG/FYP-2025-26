import React, { createContext, useEffect, useState, useCallback, ReactNode, useRef } from 'react';

import { singleton as BackgroundService } from '@services/BackgroundService';
import type { BackgroundServiceController, TrackingState, PermissionState } from '@types';
import type { TrackingMode } from '@/types/tracking';
import { AppState, AppStateStatus } from 'react-native';
import { createLogger, LogModule } from '@utils/logger';
import { useToast } from '@hooks/ToastProvider';

const logger = createLogger(LogModule.Provider);

interface BackgroundServiceContextType {
  service: BackgroundServiceController;
  state: TrackingState;
  permissionState: PermissionState;
  checkPermissions: () => Promise<void>;
}

export const BackgroundServiceContext = createContext<BackgroundServiceContextType | null>(null);

export const BackgroundServiceProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<TrackingState>(BackgroundService.getState());
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown');
  const { showToast } = useToast();
  const previousModeRef = useRef<TrackingMode>(state.mode);

  const checkPermissions = useCallback(async () => {
    try {
      const permState = await BackgroundService.getLocationPermissionState();
      setPermissionState(permState);

      if (permState === 'granted') {
        const currentState = BackgroundService.getState();
        if (!currentState.isMonitoring) {
          logger.info('Permissions granted, starting location monitoring');
          await BackgroundService.startLocationMonitoring();
        }
      }
    } catch (error) {
      logger.error('Error checking permissions:', error);
    }
  }, []);

  useEffect(() => {
    checkPermissions();

    const unsubscribeService = BackgroundService.addStateListener((newState) => {
      const previousMode = previousModeRef.current;
      if (previousMode !== newState.mode) {
        if (newState.mode === 'ACTIVE') {
          showToast({
            title: 'Journey started',
            message: 'Active tracking is on. Drive safely!',
            variant: 'success',
          });
        } else if (previousMode === 'ACTIVE' && newState.mode === 'PASSIVE') {
          showToast({
            title: 'Journey ended',
            message: 'Your drive summary is ready.',
            variant: 'info',
          });
        }
      }

      previousModeRef.current = newState.mode;
      setState(newState);
    });

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      //checks permissions to update listeners when app is return to
      if (nextAppState === 'active') {
        checkPermissions();
      }
    });

    return () => {
      unsubscribeService();
      subscription.remove();
    };
  }, [checkPermissions, showToast]);

  return (
    <BackgroundServiceContext.Provider value={{ service: BackgroundService, state, permissionState, checkPermissions }}>
      {children}
    </BackgroundServiceContext.Provider>
  );
};
