import React, { createContext, useContext, useEffect, useState } from 'react';

import { getDebugLogsEnabled, setDebugLogsEnabled as saveSetting } from '@services/SettingsService';
import { createLogger, LogModule, setDebugEnabled } from '@utils/logger';

interface DebugLogsContextType {
  isEnabled: boolean;
  toggleDebugLogs: (value: boolean) => Promise<void>;
}

const logger = createLogger(LogModule.Hooks);

const DebugLogsContext = createContext<DebugLogsContextType>({
  isEnabled: false,
  toggleDebugLogs: async () => {},
});

export const useDebugLogs = () => useContext(DebugLogsContext);

export const DebugLogsProvider = ({ children }: { children: React.ReactNode }) => {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getDebugLogsEnabled()
      .then((enabled) => {
        if (!isMounted) {
          return;
        }
        setIsEnabled(enabled);
        setDebugEnabled(enabled);
      })
      .catch((error) => {
        logger.warn('Failed to load debug logs setting:', error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const toggleDebugLogs = async (value: boolean) => {
    setIsEnabled(value);
    setDebugEnabled(value);
    await saveSetting(value);
  };

  return <DebugLogsContext.Provider value={{ isEnabled, toggleDebugLogs }}>{children}</DebugLogsContext.Provider>;
};
