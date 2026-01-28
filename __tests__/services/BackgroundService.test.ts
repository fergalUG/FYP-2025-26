describe('BackgroundService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  const importFresh = async () => {
    const svc = await import('@services/BackgroundService');
    return svc;
  };

  describe('requestLocationPermissions', () => {
    it('returns false when foreground permission denied', async () => {
      const Location = await import('expo-location');
      (Location.requestForegroundPermissionsAsync as unknown as jest.Mock).mockResolvedValueOnce({ granted: false });

      const BackgroundService = await importFresh();
      const ok = await BackgroundService.requestLocationPermissions();

      expect(ok).toBe(false);
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    });

    it('returns true when both foreground and background granted', async () => {
      const Location = await import('expo-location');
      (Location.requestForegroundPermissionsAsync as unknown as jest.Mock).mockResolvedValueOnce({ granted: true });
      (Location.requestBackgroundPermissionsAsync as unknown as jest.Mock).mockResolvedValueOnce({ granted: true });

      const BackgroundService = await importFresh();
      const ok = await BackgroundService.requestLocationPermissions();

      expect(ok).toBe(true);
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('returns false when Location API throws', async () => {
      const Location = await import('expo-location');
      (Location.requestForegroundPermissionsAsync as unknown as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      const BackgroundService = await importFresh();
      const ok = await BackgroundService.requestLocationPermissions();

      expect(ok).toBe(false);
    });
  });

  describe('getLocationPermissionState', () => {
    it("returns 'unknown' when foreground not granted but canAskAgain", async () => {
      const Location = await import('expo-location');
      (Location.getForegroundPermissionsAsync as unknown as jest.Mock).mockResolvedValueOnce({ granted: false, canAskAgain: true });

      const BackgroundService = await importFresh();
      const state = await BackgroundService.getLocationPermissionState();

      expect(state).toBe('unknown');
      expect(Location.getBackgroundPermissionsAsync).not.toHaveBeenCalled();
    });

    it("returns 'denied' when foreground not granted and cannot ask again", async () => {
      const Location = await import('expo-location');
      (Location.getForegroundPermissionsAsync as unknown as jest.Mock).mockResolvedValueOnce({ granted: false, canAskAgain: false });

      const BackgroundService = await importFresh();
      const state = await BackgroundService.getLocationPermissionState();

      expect(state).toBe('denied');
      expect(Location.getBackgroundPermissionsAsync).not.toHaveBeenCalled();
    });

    it("returns 'unknown' when background not granted but canAskAgain", async () => {
      const Location = await import('expo-location');
      (Location.getForegroundPermissionsAsync as unknown as jest.Mock).mockResolvedValueOnce({ granted: true, canAskAgain: true });
      (Location.getBackgroundPermissionsAsync as unknown as jest.Mock).mockResolvedValueOnce({ granted: false, canAskAgain: true });

      const BackgroundService = await importFresh();
      const state = await BackgroundService.getLocationPermissionState();

      expect(state).toBe('unknown');
    });

    it("returns 'denied' when background not granted and cannot ask again", async () => {
      const Location = await import('expo-location');
      (Location.getForegroundPermissionsAsync as unknown as jest.Mock).mockResolvedValueOnce({ granted: true, canAskAgain: true });
      (Location.getBackgroundPermissionsAsync as unknown as jest.Mock).mockResolvedValueOnce({ granted: false, canAskAgain: false });

      const BackgroundService = await importFresh();
      const state = await BackgroundService.getLocationPermissionState();

      expect(state).toBe('denied');
    });

    it("returns 'granted' when both foreground and background granted", async () => {
      const Location = await import('expo-location');
      (Location.getForegroundPermissionsAsync as unknown as jest.Mock).mockResolvedValueOnce({ granted: true, canAskAgain: true });
      (Location.getBackgroundPermissionsAsync as unknown as jest.Mock).mockResolvedValueOnce({ granted: true, canAskAgain: true });

      const BackgroundService = await importFresh();
      const state = await BackgroundService.getLocationPermissionState();

      expect(state).toBe('granted');
    });

    it("returns 'unknown' when Location API throws", async () => {
      const Location = await import('expo-location');
      (Location.getForegroundPermissionsAsync as unknown as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      const BackgroundService = await importFresh();
      const state = await BackgroundService.getLocationPermissionState();

      expect(state).toBe('unknown');
    });
  });

  describe('startLocationMonitoring / stopLocationMonitoring', () => {
    it('does not start tracking if permissions are not granted', async () => {
      const Location = await import('expo-location');
      (Location.getForegroundPermissionsAsync as unknown as jest.Mock).mockResolvedValueOnce({ granted: false, canAskAgain: true });

      const BackgroundService = await importFresh();
      await BackgroundService.startLocationMonitoring();

      expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
      expect(BackgroundService.getTrackingStatus().isMonitoring).toBe(false);
    });

    it('starts passive tracking once and sets monitoring state', async () => {
      const Location = await import('expo-location');
      (Location.getForegroundPermissionsAsync as unknown as jest.Mock).mockResolvedValue({ granted: true });
      (Location.getBackgroundPermissionsAsync as unknown as jest.Mock).mockResolvedValue({ granted: true });

      const BackgroundService = await importFresh();

      expect(BackgroundService.getTrackingStatus()).toEqual({ mode: 'PASSIVE', isMonitoring: false });

      await BackgroundService.startLocationMonitoring();

      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
        'BACKGROUND-LOCATION-TASK',
        expect.objectContaining({ accuracy: Location.Accuracy.Balanced, distanceInterval: 50 })
      );

      expect(BackgroundService.getTrackingStatus()).toEqual({ mode: 'PASSIVE', isMonitoring: true });
    });

    it('is idempotent: calling startLocationMonitoring twice does not re-register updates', async () => {
      const Location = await import('expo-location');
      (Location.getForegroundPermissionsAsync as unknown as jest.Mock).mockResolvedValue({ granted: true });
      (Location.getBackgroundPermissionsAsync as unknown as jest.Mock).mockResolvedValue({ granted: true });

      const BackgroundService = await importFresh();

      await BackgroundService.startLocationMonitoring();
      await BackgroundService.startLocationMonitoring();

      expect(Location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    });

    it('stops monitoring and clears monitoring state', async () => {
      const Location = await import('expo-location');
      (Location.getForegroundPermissionsAsync as unknown as jest.Mock).mockResolvedValue({ granted: true });
      (Location.getBackgroundPermissionsAsync as unknown as jest.Mock).mockResolvedValue({ granted: true });

      const BackgroundService = await importFresh();

      await BackgroundService.startLocationMonitoring();
      jest.clearAllMocks();

      await BackgroundService.stopLocationMonitoring();

      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledTimes(1);
      expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith('BACKGROUND-LOCATION-TASK');
      expect(BackgroundService.getTrackingStatus()).toEqual({ mode: 'PASSIVE', isMonitoring: false });
    });
  });
});
