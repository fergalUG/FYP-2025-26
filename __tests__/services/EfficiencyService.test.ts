import { createEfficiencyServiceController } from '@services/EfficiencyService';
import type { EfficiencyServiceDeps, ProcessLocationOptions } from '@types';
import { EventType } from '@types';
import type { MotionData } from '@modules/vehicle-motion/src/VehicleMotion.types';

const MOCK_PACK_SNAPSHOT = {
  regionId: 'ie-ni',
  version: '20260317',
  filePath: 'mock://documents/SpeedLimitPacks/ie-ni.sqlite',
  checksum: 'checksum',
  installedAt: 1,
} as const;

describe('EfficiencyService', () => {
  const mockJourneyService: EfficiencyServiceDeps['JourneyService'] = {
    logEvent: jest.fn(),
    getEventsByJourneyId: jest.fn(),
  };

  const mockVehicleMotion: EfficiencyServiceDeps['VehicleMotion'] = {
    startTracking: jest.fn(),
    stopTracking: jest.fn(),
    addListener: jest.fn(),
    removeAllListeners: jest.fn(),
  };

  const mockRoadSpeedLimitService: EfficiencyServiceDeps['RoadSpeedLimitService'] = {
    getSpeedLimit: jest.fn(),
    setPackSnapshot: jest.fn(),
    reset: jest.fn(),
  };

  const mockLogger: EfficiencyServiceDeps['logger'] = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  let nowMs = 0;
  const now = () => nowMs;

  const createService = () =>
    createEfficiencyServiceController({
      JourneyService: mockJourneyService,
      RoadSpeedLimitService: mockRoadSpeedLimitService,
      VehicleMotion: mockVehicleMotion,
      now,
      logger: mockLogger,
    });

  const startTracking = (
    service: ReturnType<typeof createService>,
    speedLimitDetectionEnabled: boolean = true,
    speedLimitPackSnapshot: typeof MOCK_PACK_SNAPSHOT | null = MOCK_PACK_SNAPSHOT
  ) => {
    service.startTracking({ speedLimitDetectionEnabled, speedLimitPackSnapshot });
  };

  const mockLocation = {
    coords: {
      latitude: 53.3498,
      longitude: -6.2603,
      altitude: 0,
      accuracy: 5,
      altitudeAccuracy: 5,
      heading: 90,
      speed: 20,
    },
    timestamp: 0,
  } as any;

  const mockMotionData: MotionData = {
    x: 0,
    y: 0,
    z: 0,
    rawX: 0,
    rawY: 0,
    rawZ: 0,
    horizontalMagnitude: 0,
  };

  const buildOptions = (location: typeof mockLocation): ProcessLocationOptions => ({
    speedMs: Number(location.coords.speed ?? 0),
    speedConfidence: 'medium',
    speedSource: 'gps',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    nowMs = 0;
    (mockRoadSpeedLimitService.getSpeedLimit as jest.Mock).mockResolvedValue(null);
  });

  describe('startTracking', () => {
    it('starts VehicleMotion tracking and registers listener', () => {
      const svc = createService();

      svc.startTracking();

      expect(mockVehicleMotion.startTracking).toHaveBeenCalledTimes(1);
      expect(mockVehicleMotion.addListener).toHaveBeenCalledWith('onMotionUpdate', expect.any(Function));
      expect(mockRoadSpeedLimitService.setPackSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          regionId: 'legacy',
        })
      );
    });

    it('is idempotent', () => {
      const svc = createService();

      svc.startTracking();
      svc.startTracking();

      expect(mockVehicleMotion.startTracking).toHaveBeenCalledTimes(1);
      expect(mockVehicleMotion.addListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopTracking', () => {
    it('stops VehicleMotion and removes listeners', () => {
      const svc = createService();
      svc.startTracking();
      jest.clearAllMocks();

      svc.stopTracking();

      expect(mockVehicleMotion.removeAllListeners).toHaveBeenCalledWith('onMotionUpdate');
      expect(mockVehicleMotion.stopTracking).toHaveBeenCalledTimes(1);
      expect(mockRoadSpeedLimitService.setPackSnapshot).toHaveBeenLastCalledWith(null);
    });

    it('is idempotent when not tracking', () => {
      const svc = createService();

      svc.stopTracking();
      svc.stopTracking();

      expect(mockVehicleMotion.stopTracking).not.toHaveBeenCalled();
    });
  });

  describe('processLocation', () => {
    it('does nothing when not tracking', async () => {
      const svc = createService();

      await svc.processLocation(mockLocation, buildOptions(mockLocation));

      expect(mockJourneyService.logEvent).not.toHaveBeenCalled();
    });

    it('detects moderate speeding', async () => {
      const svc = createService();
      svc.startTracking();
      (mockRoadSpeedLimitService.getSpeedLimit as jest.Mock).mockResolvedValue({
        speedLimitKmh: 95,
        source: 'offline_osm',
        fromCache: false,
      });

      const speedingLocation = {
        ...mockLocation,
        coords: {
          ...mockLocation.coords,
          speed: 30.5,
        },
      };

      nowMs = 0;
      await svc.processLocation(speedingLocation, buildOptions(speedingLocation));
      nowMs = 2500;
      await svc.processLocation(speedingLocation, buildOptions(speedingLocation));

      expect(mockJourneyService.logEvent).toHaveBeenCalledWith(
        EventType.DrivingEvent,
        speedingLocation.coords.latitude,
        speedingLocation.coords.longitude,
        expect.any(Number),
        expect.objectContaining({
          family: 'speeding',
          severity: 'moderate',
        })
      );
    });

    it('detects harsh speeding', async () => {
      const svc = createService();
      svc.startTracking();
      (mockRoadSpeedLimitService.getSpeedLimit as jest.Mock).mockResolvedValue({
        speedLimitKmh: 95,
        source: 'offline_osm',
        fromCache: false,
      });

      const speedingLocation = {
        ...mockLocation,
        coords: {
          ...mockLocation.coords,
          speed: 35,
        },
      };

      nowMs = 0;
      await svc.processLocation(speedingLocation, buildOptions(speedingLocation));
      nowMs = 2500;
      await svc.processLocation(speedingLocation, buildOptions(speedingLocation));

      expect(mockJourneyService.logEvent).toHaveBeenCalledWith(
        EventType.DrivingEvent,
        speedingLocation.coords.latitude,
        speedingLocation.coords.longitude,
        expect.any(Number),
        expect.objectContaining({
          family: 'speeding',
          severity: 'harsh',
        })
      );
    });

    it('skips speed limit lookups and speeding events when speed limit detection is disabled', async () => {
      const svc = createService();
      startTracking(svc, false);

      const speedingLocation = {
        ...mockLocation,
        coords: {
          ...mockLocation.coords,
          speed: 35,
        },
      };

      nowMs = 0;
      await svc.processLocation(speedingLocation, buildOptions(speedingLocation));
      nowMs = 2500;
      await svc.processLocation(speedingLocation, buildOptions(speedingLocation));

      expect(mockRoadSpeedLimitService.getSpeedLimit).not.toHaveBeenCalled();
      expect(mockJourneyService.logEvent).not.toHaveBeenCalledWith(
        EventType.DrivingEvent,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({
          family: 'speeding',
        })
      );
    });

    it('does not log speeding for normal speeds', async () => {
      const svc = createService();
      svc.startTracking();
      (mockRoadSpeedLimitService.getSpeedLimit as jest.Mock).mockResolvedValue({
        speedLimitKmh: 80,
        source: 'offline_osm',
        fromCache: false,
      });

      await svc.processLocation(mockLocation, buildOptions(mockLocation));

      expect(mockJourneyService.logEvent).not.toHaveBeenCalled();
    });

    it('detects stop and go cycles', async () => {
      const svc = createService();
      svc.startTracking();

      const buildLocationForSpeed = (speedKmh: number) => ({
        ...mockLocation,
        coords: {
          ...mockLocation.coords,
          speed: speedKmh / 3.6,
        },
      });

      const processAt = async (timeMs: number, speedKmh: number) => {
        nowMs = timeMs;
        const location = buildLocationForSpeed(speedKmh);
        await svc.processLocation(location, buildOptions(location));
      };

      await processAt(0, 0);
      await processAt(5000, 0);
      await processAt(6000, 20);
      await processAt(11000, 20);

      expect(mockJourneyService.logEvent).not.toHaveBeenCalled();

      await processAt(12000, 0);
      await processAt(17000, 0);
      await processAt(18000, 20);
      await processAt(23000, 20);

      expect(mockJourneyService.logEvent).toHaveBeenCalledTimes(1);
      expect(mockJourneyService.logEvent).toHaveBeenCalledWith(
        EventType.StopAndGo,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({
          metadata: expect.objectContaining({
            cycleCount: 2,
            detectionWindowMs: expect.any(Number),
            stopSpeedThresholdKmh: expect.any(Number),
            goSpeedThresholdKmh: expect.any(Number),
          }),
        })
      );

      await processAt(24000, 0);
      await processAt(29000, 0);
      await processAt(30000, 20);
      await processAt(35000, 20);

      expect(mockJourneyService.logEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('calculateJourneyScore', () => {
    it('returns 100 for journey with no events', async () => {
      const svc = createService();
      (mockJourneyService.getEventsByJourneyId as jest.Mock).mockResolvedValueOnce([]);

      const score = await svc.calculateJourneyScore(1);

      expect(score).toBe(100);
    });

    it('calculates score from events using recovery-based scoring', async () => {
      const svc = createService();

      const events = [
        { id: 1, journeyId: 1, timestamp: 0, type: EventType.JourneyStart, latitude: 0, longitude: 0, speed: 0 },
        {
          id: 2,
          journeyId: 1,
          timestamp: 0,
          type: EventType.DrivingEvent,
          family: 'braking',
          severity: 'harsh',
          latitude: 0,
          longitude: 0,
          speed: 0,
        },
        { id: 3, journeyId: 1, timestamp: 600000, type: EventType.JourneyEnd, latitude: 0, longitude: 0, speed: 0 },
      ];

      (mockJourneyService.getEventsByJourneyId as jest.Mock).mockResolvedValueOnce(events);

      const score = await svc.calculateJourneyScore(1);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBe(98);
    });

    it('returns 0 on error', async () => {
      const svc = createService();
      (mockJourneyService.getEventsByJourneyId as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const score = await svc.calculateJourneyScore(1);

      expect(score).toBe(0);
    });
  });

  describe('getJourneyEfficiencyStats', () => {
    it('returns empty stats for no events', async () => {
      const svc = createService();
      (mockJourneyService.getEventsByJourneyId as jest.Mock).mockResolvedValueOnce([]);

      const stats = await svc.getJourneyEfficiencyStats(1);

      expect(stats).toEqual({
        durationMs: 0,
        speedLimitDetectionEnabled: true,

        score: 100,
        avgScore: 100,
        blendedAvgScore: 100,
        endScore: 100,
        minScore: 100,

        harshBrakingCount: 0,
        moderateBrakingCount: 0,
        lightBrakingCount: 0,
        harshAccelerationCount: 0,
        moderateAccelerationCount: 0,
        lightAccelerationCount: 0,
        sharpTurnCount: 0,
        moderateTurnCount: 0,
        lightTurnCount: 0,
        stopAndGoCount: 0,

        lightSpeedingEpisodeCount: 0,
        moderateSpeedingEpisodeCount: 0,
        harshSpeedingEpisodeCount: 0,
        lightSpeedingSeconds: 0,
        moderateSpeedingSeconds: 0,
        harshSpeedingSeconds: 0,

        lightOscillationEpisodeCount: 0,
        moderateOscillationEpisodeCount: 0,
        harshOscillationEpisodeCount: 0,
        lightOscillationSeconds: 0,
        moderateOscillationSeconds: 0,
        harshOscillationSeconds: 0,

        avgSpeed: 0,
        maxSpeed: 0,
      });
    });

    it('stores speed limit detection state in journey stats for the active journey', async () => {
      const svc = createService();
      startTracking(svc, false);
      (mockJourneyService.getEventsByJourneyId as jest.Mock).mockResolvedValueOnce([]);

      const stats = await svc.getJourneyEfficiencyStats(1);

      expect(stats?.speedLimitDetectionEnabled).toBe(false);
      expect(stats?.speedLimitDataStatus).toBe('disabled');
    });

    it('marks speed limit data as unavailable until an offline lookup succeeds', async () => {
      const svc = createService();
      startTracking(svc, true, null);
      (mockJourneyService.getEventsByJourneyId as jest.Mock).mockResolvedValueOnce([]);

      const stats = await svc.getJourneyEfficiencyStats(1);

      expect(stats?.speedLimitDetectionEnabled).toBe(true);
      expect(stats?.speedLimitDataStatus).toBe('unavailable');
    });

    it('returns normalized incident/episode counts', async () => {
      const svc = createService();
      const events = [
        { id: 1, journeyId: 1, timestamp: 0, type: EventType.JourneyStart, latitude: 0, longitude: 0, speed: 0 },
        {
          id: 2,
          journeyId: 1,
          timestamp: 0,
          type: EventType.DrivingEvent,
          family: 'braking',
          severity: 'harsh',
          latitude: 0,
          longitude: 0,
          speed: 0,
        },
        {
          id: 3,
          journeyId: 1,
          timestamp: 2000,
          type: EventType.DrivingEvent,
          family: 'braking',
          severity: 'harsh',
          latitude: 0,
          longitude: 0,
          speed: 0,
        },
        {
          id: 4,
          journeyId: 1,
          timestamp: 100000,
          type: EventType.DrivingEvent,
          family: 'acceleration',
          severity: 'harsh',
          latitude: 0,
          longitude: 0,
          speed: 0,
        },
        {
          id: 5,
          journeyId: 1,
          timestamp: 200000,
          type: EventType.DrivingEvent,
          family: 'speeding',
          severity: 'moderate',
          latitude: 0,
          longitude: 0,
          speed: 0,
        },
        {
          id: 6,
          journeyId: 1,
          timestamp: 210000,
          type: EventType.DrivingEvent,
          family: 'speeding',
          severity: 'moderate',
          latitude: 0,
          longitude: 0,
          speed: 0,
        },
        {
          id: 7,
          journeyId: 1,
          timestamp: 400000,
          type: EventType.DrivingEvent,
          family: 'speeding',
          severity: 'harsh',
          latitude: 0,
          longitude: 0,
          speed: 0,
        },
        {
          id: 8,
          journeyId: 1,
          timestamp: 410000,
          type: EventType.DrivingEvent,
          family: 'speeding',
          severity: 'harsh',
          latitude: 0,
          longitude: 0,
          speed: 0,
        },
        { id: 9, journeyId: 1, timestamp: 600000, type: EventType.JourneyEnd, latitude: 0, longitude: 0, speed: 0 },
      ];

      (mockJourneyService.getEventsByJourneyId as jest.Mock).mockResolvedValueOnce(events);

      const stats = await svc.getJourneyEfficiencyStats(1);
      expect(stats).not.toBeNull();
      expect(stats?.harshBrakingCount).toBe(1);
      expect(stats?.harshAccelerationCount).toBe(1);
      expect(stats?.sharpTurnCount).toBe(0);
      expect(stats?.stopAndGoCount).toBe(0);
      expect(stats?.moderateSpeedingEpisodeCount).toBe(1);
      expect(stats?.harshSpeedingEpisodeCount).toBe(1);
      expect(stats?.moderateSpeedingSeconds).toBe(10);
      expect(stats?.harshSpeedingSeconds).toBe(10);
    });

    it('returns null on error', async () => {
      const svc = createService();
      (mockJourneyService.getEventsByJourneyId as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const stats = await svc.getJourneyEfficiencyStats(1);

      expect(stats).toBeNull();
    });
  });

  describe('Motion-based event detection', () => {
    it('uses eventSpeedMs for harsh braking detection when speedMs is smoothed/flat', async () => {
      const svc = createService();
      svc.startTracking();

      const motionListener = (mockVehicleMotion.addListener as jest.Mock).mock.calls[0][1] as (d: MotionData) => Promise<void> | void;

      nowMs = 0;
      const firstLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 20 } };
      await svc.processLocation(firstLocation, {
        ...buildOptions(firstLocation),
        speedMs: 20,
        eventSpeedMs: 20,
      });

      nowMs = 200;
      const secondLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 20 } };
      await svc.processLocation(secondLocation, {
        ...buildOptions(secondLocation),
        speedMs: 20,
        eventSpeedMs: 8,
      });

      nowMs = 300;
      await motionListener({ ...mockMotionData, horizontalMagnitude: 0.45 });

      expect(mockJourneyService.logEvent).toHaveBeenCalledWith(
        EventType.DrivingEvent,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({
          family: 'braking',
          severity: 'harsh',
        })
      );
    });

    it('detects harsh braking when speed drops and force is high', async () => {
      const svc = createService();
      svc.startTracking();

      const motionListener = (mockVehicleMotion.addListener as jest.Mock).mock.calls[0][1] as (d: MotionData) => Promise<void> | void;

      nowMs = 0;
      const firstLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 20 } };
      await svc.processLocation(firstLocation, buildOptions(firstLocation));
      nowMs = 200;
      const secondLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 10 } };
      await svc.processLocation(secondLocation, buildOptions(secondLocation));
      nowMs = 300;

      await motionListener({ ...mockMotionData, horizontalMagnitude: 0.45 });

      expect(mockJourneyService.logEvent).toHaveBeenCalledWith(
        EventType.DrivingEvent,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({
          family: 'braking',
          severity: 'harsh',
        })
      );
    });

    it('detects harsh acceleration when speed rises and force is high', async () => {
      const svc = createService();
      svc.startTracking();

      const motionListener = (mockVehicleMotion.addListener as jest.Mock).mock.calls[0][1] as (d: MotionData) => Promise<void> | void;

      nowMs = 0;
      const firstLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 20 } };
      await svc.processLocation(firstLocation, buildOptions(firstLocation));
      nowMs = 200;
      const secondLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 25 } };
      await svc.processLocation(secondLocation, buildOptions(secondLocation));
      nowMs = 300;

      await motionListener({ ...mockMotionData, horizontalMagnitude: 0.35 });

      expect(mockJourneyService.logEvent).toHaveBeenCalledWith(
        EventType.DrivingEvent,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({
          family: 'acceleration',
          severity: 'harsh',
        })
      );
    });

    it('applies cooldown for repeated harsh acceleration motion updates', async () => {
      const svc = createService();
      svc.startTracking();

      const motionListener = (mockVehicleMotion.addListener as jest.Mock).mock.calls[0][1] as (d: MotionData) => Promise<void> | void;

      nowMs = 0;
      const firstLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 8 } };
      await svc.processLocation(firstLocation, buildOptions(firstLocation));
      nowMs = 1000;
      const secondLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 12 } };
      await svc.processLocation(secondLocation, buildOptions(secondLocation));

      nowMs = 1100;
      await motionListener({ ...mockMotionData, horizontalMagnitude: 0.5 });
      nowMs = 1200;
      await motionListener({ ...mockMotionData, horizontalMagnitude: 0.5 });

      const harshAccelerationCalls = (mockJourneyService.logEvent as jest.Mock).mock.calls.filter((call) => {
        if (call[0] !== EventType.DrivingEvent) {
          return false;
        }
        const details = call[4] as { family?: string; severity?: string } | undefined;
        return details?.family === 'acceleration' && details?.severity === 'harsh';
      });
      expect(harshAccelerationCalls).toHaveLength(1);
    });

    it('detects and logs one oscillation episode after stability', async () => {
      const svc = createService();
      svc.startTracking();

      const motionListener = (mockVehicleMotion.addListener as jest.Mock).mock.calls[0][1] as (d: MotionData) => Promise<void> | void;

      const processSample = async (timeMs: number, speedKmh: number, forceG: number) => {
        nowMs = timeMs;
        const location = {
          ...mockLocation,
          timestamp: timeMs,
          coords: {
            ...mockLocation.coords,
            speed: speedKmh / 3.6,
          },
        };

        await svc.processLocation(location, buildOptions(location));

        for (let i = 0; i < 3; i++) {
          nowMs = timeMs + i + 1;
          await motionListener({ ...mockMotionData, horizontalMagnitude: forceG });
        }
      };

      let timeMs = 0;

      for (let i = 0; i < 6; i++) {
        await processSample(timeMs, 62, 0.08);
        timeMs += 1000;
      }

      const oscillatingSpeeds = [60, 75, 60, 76, 61, 75, 60, 76, 61, 75, 60, 76, 61, 75, 60, 76];
      for (const speedKmh of oscillatingSpeeds) {
        await processSample(timeMs, speedKmh, 0.25);
        timeMs += 1000;
      }

      for (let i = 0; i < 26; i++) {
        await processSample(timeMs, 67, 0.05);
        timeMs += 1000;
      }

      const oscillationCalls = (mockJourneyService.logEvent as jest.Mock).mock.calls.filter((call) => {
        if (call[0] !== EventType.DrivingEvent) {
          return false;
        }
        const details = call[4] as { family?: string; severity?: string; metadata?: Record<string, unknown> } | undefined;
        return details?.family === 'oscillation';
      });

      expect(oscillationCalls).toHaveLength(1);
      const details = oscillationCalls[0][4] as { severity?: string; metadata?: Record<string, unknown> };
      expect(details.severity).toBe('harsh');
      expect(details.metadata).toEqual(
        expect.objectContaining({
          episodeDurationMs: expect.any(Number),
          speedStdDevKmh: expect.any(Number),
          signFlipCount: expect.any(Number),
          forceP90G: expect.any(Number),
          forceMeanG: expect.any(Number),
        })
      );
    });

    it('does not detect events below speed threshold', async () => {
      const svc = createService();
      svc.startTracking();

      const motionListener = (mockVehicleMotion.addListener as jest.Mock).mock.calls[0][1] as (d: MotionData) => Promise<void> | void;

      nowMs = 0;
      const slowLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 1 } };
      await svc.processLocation(slowLocation, buildOptions(slowLocation));
      nowMs = 300;

      await motionListener({ ...mockMotionData, horizontalMagnitude: 0.5 });

      expect(mockJourneyService.logEvent).not.toHaveBeenCalled();
    });

    describe('Harsh Cornering', () => {
      it('detects harsh cornering with force and heading change', async () => {
        const svc = createService();
        svc.startTracking();
        const motionListener = (mockVehicleMotion.addListener as jest.Mock).mock.calls[0][1] as (d: MotionData) => Promise<void> | void;

        nowMs = 10000;
        const firstLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 10, heading: 0 } };
        await svc.processLocation(firstLocation, buildOptions(firstLocation));
        nowMs = 11000;
        const secondLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 10, heading: 30 } };
        await svc.processLocation(secondLocation, buildOptions(secondLocation));

        nowMs += 10;
        await motionListener({ ...mockMotionData, horizontalMagnitude: 0.6 });

        expect(mockJourneyService.logEvent).toHaveBeenCalledWith(
          EventType.DrivingEvent,
          expect.any(Number),
          expect.any(Number),
          expect.any(Number),
          expect.objectContaining({
            family: 'cornering',
            severity: 'harsh',
          })
        );
      });

      it('filters out cornering when heading change is too small', async () => {
        const svc = createService();
        svc.startTracking();
        const motionListener = (mockVehicleMotion.addListener as jest.Mock).mock.calls[0][1] as (d: MotionData) => Promise<void> | void;

        nowMs = 10000;
        const firstLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 10, heading: 0 } };
        await svc.processLocation(firstLocation, buildOptions(firstLocation));
        nowMs = 11000;
        const secondLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 10, heading: 5 } };
        await svc.processLocation(secondLocation, buildOptions(secondLocation));

        nowMs += 10;
        await motionListener({ ...mockMotionData, horizontalMagnitude: 0.9 });

        const corneringCalls = (mockJourneyService.logEvent as jest.Mock).mock.calls.filter((call) => {
          if (call[0] !== EventType.DrivingEvent) {
            return false;
          }
          const details = call[4] as { family?: string } | undefined;
          return details?.family === 'cornering';
        });
        expect(corneringCalls).toHaveLength(0);
      });

      it('respects event cooldown', async () => {
        const svc = createService();
        svc.startTracking();
        const motionListener = (mockVehicleMotion.addListener as jest.Mock).mock.calls[0][1] as (d: MotionData) => Promise<void> | void;

        nowMs = 10000;
        const firstLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 10, heading: 0 } };
        await svc.processLocation(firstLocation, buildOptions(firstLocation));
        nowMs = 11000;
        const secondLocation = { ...mockLocation, coords: { ...mockLocation.coords, speed: 10, heading: 30 } };
        await svc.processLocation(secondLocation, buildOptions(secondLocation));

        nowMs += 10;
        await motionListener({ ...mockMotionData, horizontalMagnitude: 0.6 });
        const firstCallCount = (mockJourneyService.logEvent as jest.Mock).mock.calls.length;
        expect(firstCallCount).toBeGreaterThan(0);

        // Immediate second attempt (within cooldown)
        nowMs += 10;
        await motionListener({ ...mockMotionData, horizontalMagnitude: 0.6 });
        expect(mockJourneyService.logEvent).toHaveBeenCalledTimes(firstCallCount);
      });
    });
  });
});
