import React, { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { useBackgroundService } from './useBackgroundService';
import type { BackgroundServiceHook } from '@types';

const BackgroundServiceContext = createContext<BackgroundServiceHook | null>(null);

interface BackgroundServiceProviderProps {
  children: ReactNode;
}

export const BackgroundServiceProvider = (props: BackgroundServiceProviderProps) => {
  const { children } = props;
  const backgroundService = useBackgroundService();

  return <BackgroundServiceContext.Provider value={backgroundService}>{children}</BackgroundServiceContext.Provider>;
};

export const useBackgroundServiceContext = (): BackgroundServiceHook => {
  const ctx = useContext(BackgroundServiceContext);
  if (!ctx) {
    throw new Error('useBackgroundServiceContext must be used within BackgroundServiceProvider');
  }
  return ctx;
};
