import { useCallback, useEffect, useState } from 'react';

import * as SettingsService from '@services/SettingsService';
import { executeWithLoading } from '@utils/async';
import { DEFAULT_DRIVER_NAME } from '@constants/defaults';

interface UseDriverProfileResult {
  driverName: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setDriverName: (name: string) => Promise<boolean>;
}

export const useDriverProfile = (): UseDriverProfileResult => {
  const [driverName, setDriverNameState] = useState<string>(DEFAULT_DRIVER_NAME);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const result = await executeWithLoading(() => SettingsService.getDriverName(), setLoading, setError);
    if (typeof result === 'string') {
      setDriverNameState(result);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setDriverName = useCallback(async (name: string): Promise<boolean> => {
    const result = await executeWithLoading(() => SettingsService.setDriverName(name), setLoading, setError);
    if (result) {
      const next = name.trim().length > 0 ? name.trim() : DEFAULT_DRIVER_NAME;
      setDriverNameState(next);
      return true;
    }
    return false;
  }, []);

  return {
    driverName,
    loading,
    error,
    refresh,
    setDriverName,
  };
};
