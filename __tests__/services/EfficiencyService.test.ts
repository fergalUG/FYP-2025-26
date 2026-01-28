import { createEfficiencyServiceController } from '@services/EfficiencyService';
import type { EfficiencyServiceDeps } from '@types';
import { EventType } from '@types';
import type { MotionData } from '@modules/vehicle-motion/src/VehicleMotion.types';

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
      VehicleMotion: mockVehicleMotion,
      now,
      logger: mockLogger,
    });

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

  beforeEach(() => {
    jest.clearAllMocks();
    nowMs = 0;
  });

  describe('startTracking', () => {
    it('starts VehicleMotion tracking and registers listener', () => {
      const svc = createService();

      svc.startTracking();

      expect(mockVehicleMotion.startTracking).toHaveBeenCalledTimes(1);
      expect(mockVehicleMotion.addListener).toHaveBeenCalledWith('onMotionUpdate', expect.any(Function));
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

      await svc.processLocation(mockLocation);

      expect(mockJourneyService.logEvent).not.toHaveBeenCalled();
    });

    it('detects moderate speeding', async () => {
      const svc = createService();
      svc.startTracking();

      const speedingLocation = {
        ...mockLocation,
        coords: {
          ...mockLocation.coords,
          speed: 30,
        },
      };

      await svc.processLocation(speedingLocation);

      expect(mockJourneyService.logEvent).toHaveBeenCalledWith(
        EventType.ModerateSpeeding,
        speedingLocation.coords.latitude,
        speedingLocation.coords.longitude,
        expect.any(Number)
      );
    });

    it('detects harsh speeding', async () => {
      const svc = createService();
      svc.startTracking();

      const speedingLocation = {
        ...mockLocation,
        coords: {
          ...mockLocation.coords,
          speed: 35,
        },
      };

      await svc.processLocation(speedingLocation);

      expect(mockJourneyService.logEvent).toHaveBeenCalledWith(
        EventType.HarshSpeeding,
        speedingLocation.coords.latitude,
        speedingLocation.coords.longitude,
        expect.any(Number)
      );
    });

    it('does not log speeding for normal speeds', async () => {
      const svc = createService();
      svc.startTracking();

      await svc.processLocation(mockLocation);

      expect(mockJourneyService.logEvent).not.toHaveBeenCalled();
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
        { id: 2, journeyId: 1, timestamp: 0, type: EventType.HarshBraking, latitude: 0, longitude: 0, speed: 0 },
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

        score: 100,
        avgScore: 100,
        blendedAvgScore: 100,
        endScore: 100,
        minScore: 100,

        harshBrakingCount: 0,
        harshAccelerationCount: 0,
        sharpTurnCount: 0,

        moderateSpeedingEpisodeCount: 0,
        harshSpeedingEpisodeCount: 0,
        moderateSpeedingSeconds: 0,
        harshSpeedingSeconds: 0,

        avgSpeed: 0,
        maxSpeed: 0,
      });
    });

    it('returns normalized incident/episode counts', async () => {
      const svc = createService();
      const events = [
        { id: 1, journeyId: 1, timestamp: 0, type: EventType.JourneyStart, latitude: 0, longitude: 0, speed: 0 },
        { id: 2, journeyId: 1, timestamp: 0, type: EventType.HarshBraking, latitude: 0, longitude: 0, speed: 0 },
        { id: 3, journeyId: 1, timestamp: 2000, type: EventType.HarshBraking, latitude: 0, longitude: 0, speed: 0 },
        { id: 4, journeyId: 1, timestamp: 100000, type: EventType.HarshAcceleration, latitude: 0, longitude: 0, speed: 0 },
        { id: 5, journeyId: 1, timestamp: 200000, type: EventType.ModerateSpeeding, latitude: 0, longitude: 0, speed: 0 },
        { id: 6, journeyId: 1, timestamp: 210000, type: EventType.ModerateSpeeding, latitude: 0, longitude: 0, speed: 0 },
        { id: 7, journeyId: 1, timestamp: 400000, type: EventType.HarshSpeeding, latitude: 0, longitude: 0, speed: 0 },
        { id: 8, journeyId: 1, timestamp: 410000, type: EventType.HarshSpeeding, latitude: 0, longitude: 0, speed: 0 },
        { id: 9, journeyId: 1, timestamp: 600000, type: EventType.JourneyEnd, latitude: 0, longitude: 0, speed: 0 },
      ];

      (mockJourneyService.getEventsByJourneyId as jest.Mock).mockResolvedValueOnce(events);

      const stats = await svc.getJourneyEfficiencyStats(1);
      expect(stats).not.toBeNull();
      expect(stats?.harshBrakingCount).toBe(1);
      expect(stats?.harshAccelerationCount).toBe(1);
      expect(stats?.sharpTurnCount).toBe(0);
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
    it('detects harsh braking when speed drops and force is high', async () => {
      const svc = createService();
      svc.startTracking();

      const motionListener = (mockVehicleMotion.addListener as jest.Mock).mock.calls[0][1] as (d: MotionData) => Promise<void> | void;

      nowMs = 0;
      await svc.processLocation({ ...mockLocation, coords: { ...mockLocation.coords, speed: 20 } });
      nowMs = 200;
      await svc.processLocation({ ...mockLocation, coords: { ...mockLocation.coords, speed: 10 } });
      nowMs = 300;

      await motionListener({ ...mockMotionData, horizontalMagnitude: 0.45 });

      expect(mockJourneyService.logEvent).toHaveBeenCalledWith(
        EventType.HarshBraking,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('detects harsh acceleration when speed rises and force is high', async () => {
      const svc = createService();
      svc.startTracking();

      const motionListener = (mockVehicleMotion.addListener as jest.Mock).mock.calls[0][1] as (d: MotionData) => Promise<void> | void;

      nowMs = 0;
      await svc.processLocation({ ...mockLocation, coords: { ...mockLocation.coords, speed: 20 } });
      nowMs = 200;
      await svc.processLocation({ ...mockLocation, coords: { ...mockLocation.coords, speed: 25 } });
      nowMs = 300;

      await motionListener({ ...mockMotionData, horizontalMagnitude: 0.35 });

      expect(mockJourneyService.logEvent).toHaveBeenCalledWith(
        EventType.HarshAcceleration,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('does not detect events below speed threshold', async () => {
      const svc = createService();
      svc.startTracking();

      const motionListener = (mockVehicleMotion.addListener as jest.Mock).mock.calls[0][1] as (d: MotionData) => Promise<void> | void;

      nowMs = 0;
      await svc.processLocation({ ...mockLocation, coords: { ...mockLocation.coords, speed: 1 } });
      nowMs = 300;

      await motionListener({ ...mockMotionData, horizontalMagnitude: 0.5 });

      expect(mockJourneyService.logEvent).not.toHaveBeenCalled();
    });
  });
});
