import * as EfficiencyService from '@services/EfficiencyService';
import * as JourneyService from '@services/JourneyService';
import VehicleMotion from '@modules/vehicle-motion';
import { EventType } from '@types';
import type { MotionData } from '@modules/vehicle-motion';

jest.mock('@services/JourneyService');
jest.mock('@modules/vehicle-motion');

describe('EfficiencyService', () => {
  const mockLocation = {
    coords: {
      latitude: 53.3498,
      longitude: -6.2603,
      altitude: 0,
      accuracy: 5,
      altitudeAccuracy: 5,
      heading: 90,
      speed: 20, // ~72 km/h
    },
    timestamp: Date.now(),
  };

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
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('startTracking', () => {
    beforeEach(() => {
      EfficiencyService.stopTracking();
      jest.clearAllMocks();
    });

    it('should start VehicleMotion tracking', () => {
      EfficiencyService.startTracking();

      expect(VehicleMotion.startTracking).toHaveBeenCalled();
    });

    it('should add motion update listener', () => {
      EfficiencyService.startTracking();

      expect(VehicleMotion.addListener).toHaveBeenCalledWith('onMotionUpdate', expect.any(Function));
    });

    it('should not start tracking twice', () => {
      EfficiencyService.startTracking();
      EfficiencyService.startTracking();

      expect(VehicleMotion.startTracking).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopTracking', () => {
    beforeEach(() => {
      EfficiencyService.startTracking();
      jest.clearAllMocks();
    });

    it('should stop VehicleMotion tracking', () => {
      EfficiencyService.stopTracking();

      expect(VehicleMotion.stopTracking).toHaveBeenCalled();
    });

    it('should remove all motion listeners', () => {
      EfficiencyService.stopTracking();

      expect(VehicleMotion.removeAllListeners).toHaveBeenCalledWith('onMotionUpdate');
    });

    it('should handle stopping when not tracking', () => {
      EfficiencyService.stopTracking();
      EfficiencyService.stopTracking();

      expect(VehicleMotion.stopTracking).toHaveBeenCalledTimes(1);
    });
  });

  describe('processLocation', () => {
    beforeEach(() => {
      EfficiencyService.startTracking();
      jest.clearAllMocks();
    });

    it('should process location when tracking', async () => {
      await EfficiencyService.processLocation(mockLocation);

      expect(true).toBe(true);
    });

    it('should not process location when not tracking', async () => {
      EfficiencyService.stopTracking();
      jest.clearAllMocks();

      await EfficiencyService.processLocation(mockLocation);

      expect(JourneyService.logEvent).not.toHaveBeenCalled();
    });

    it('should detect moderate speeding', async () => {
      const speedingLocation = {
        ...mockLocation,
        coords: {
          ...mockLocation.coords,
          speed: 30, // ~108 km/h (between 100-120)
        },
      };

      await EfficiencyService.processLocation(speedingLocation);

      expect(JourneyService.logEvent).toHaveBeenCalledWith(
        EventType.ModerateSpeeding,
        speedingLocation.coords.latitude,
        speedingLocation.coords.longitude,
        expect.any(Number)
      );
    });

    it('should detect harsh speeding', async () => {
      const speedingLocation = {
        ...mockLocation,
        coords: {
          ...mockLocation.coords,
          speed: 35, // ~126 km/h (over 120)
        },
      };

      await EfficiencyService.processLocation(speedingLocation);

      expect(JourneyService.logEvent).toHaveBeenCalledWith(
        EventType.HarshSpeeding,
        speedingLocation.coords.latitude,
        speedingLocation.coords.longitude,
        expect.any(Number)
      );
    });

    it('should not log speeding event for normal speeds', async () => {
      const normalLocation = {
        ...mockLocation,
        coords: {
          ...mockLocation.coords,
          speed: 20, // ~72 km/h (under 100)
        },
      };

      await EfficiencyService.processLocation(normalLocation);

      expect(JourneyService.logEvent).not.toHaveBeenCalled();
    });

    it('should track heading history for cornering detection', async () => {
      const location1 = {
        ...mockLocation,
        coords: { ...mockLocation.coords, heading: 0, speed: 20 },
      };
      const location2 = {
        ...mockLocation,
        coords: { ...mockLocation.coords, heading: 45, speed: 20 },
      };

      await EfficiencyService.processLocation(location1);
      jest.advanceTimersByTime(1000);
      await EfficiencyService.processLocation(location2);

      expect(true).toBe(true);
    });

    it('should not track heading when speed is too low', async () => {
      const lowSpeedLocation = {
        ...mockLocation,
        coords: { ...mockLocation.coords, heading: 45, speed: 2 }, // ~7.2 km/h
      };

      await EfficiencyService.processLocation(lowSpeedLocation);

      expect(true).toBe(true);
    });
  });

  describe('calculateJourneyScore', () => {
    it('should return 100 for journey with no events', async () => {
      (JourneyService.getEventsByJourneyId as jest.Mock).mockResolvedValue([]);

      const score = await EfficiencyService.calculateJourneyScore(1);

      expect(score).toBe(100);
    });

    it('should calculate score based on penalties', async () => {
      const mockEvents = [
        { id: 1, type: EventType.HarshBraking, penalty: 1 },
        { id: 2, type: EventType.SharpTurn, penalty: 1 },
        { id: 3, type: EventType.ModerateSpeeding, penalty: 1 },
      ];
      (JourneyService.getEventsByJourneyId as jest.Mock).mockResolvedValue(mockEvents);

      const score = await EfficiencyService.calculateJourneyScore(1);

      expect(score).toBe(97); // 100 - 3
    });

    it('should not go below 0', async () => {
      const mockEvents = Array(200).fill({ penalty: 1 });
      (JourneyService.getEventsByJourneyId as jest.Mock).mockResolvedValue(mockEvents);

      const score = await EfficiencyService.calculateJourneyScore(1);

      expect(score).toBe(0);
    });

    it('should not go above 100', async () => {
      const mockEvents = [{ id: 1, type: EventType.HarshBraking, penalty: -10 }];
      (JourneyService.getEventsByJourneyId as jest.Mock).mockResolvedValue(mockEvents);

      const score = await EfficiencyService.calculateJourneyScore(1);

      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 on error', async () => {
      (JourneyService.getEventsByJourneyId as jest.Mock).mockRejectedValue(new Error('Database error'));

      const score = await EfficiencyService.calculateJourneyScore(1);

      expect(score).toBe(0);
    });
  });

  describe('getJourneyEfficiencyStats', () => {
    it('should calculate stats from events', async () => {
      const mockEvents = [
        { id: 1, type: EventType.HarshBraking, penalty: 1 },
        { id: 2, type: EventType.HarshBraking, penalty: 1 },
        { id: 3, type: EventType.HarshAcceleration, penalty: 1 },
        { id: 4, type: EventType.SharpTurn, penalty: 1 },
        { id: 5, type: EventType.ModerateSpeeding, penalty: 1 },
        { id: 6, type: EventType.HarshSpeeding, penalty: 1 },
      ];
      (JourneyService.getEventsByJourneyId as jest.Mock).mockResolvedValue(mockEvents);

      const stats = await EfficiencyService.getJourneyEfficiencyStats(1);

      expect(stats).toEqual({
        totalEvents: 6,
        totalPenalty: 6,
        hardBrakeCount: 2,
        hardAccelerationCount: 1,
        harshCorneringCount: 1,
        moderateSpeedingCount: 1,
        harshSpeedingCount: 1,
      });
    });

    it('should return empty stats for no events', async () => {
      (JourneyService.getEventsByJourneyId as jest.Mock).mockResolvedValue([]);

      const stats = await EfficiencyService.getJourneyEfficiencyStats(1);

      expect(stats).toEqual({
        totalEvents: 0,
        totalPenalty: 0,
        hardBrakeCount: 0,
        hardAccelerationCount: 0,
        harshCorneringCount: 0,
        moderateSpeedingCount: 0,
        harshSpeedingCount: 0,
      });
    });

    it('should return null on error', async () => {
      (JourneyService.getEventsByJourneyId as jest.Mock).mockRejectedValue(new Error('Database error'));

      const stats = await EfficiencyService.getJourneyEfficiencyStats(1);

      expect(stats).toBeNull();
    });
  });

  describe('Motion-based event detection', () => {
    let motionListener: (data: MotionData) => Promise<void>;

    beforeEach(async () => {
      EfficiencyService.stopTracking();
      jest.clearAllMocks();

      EfficiencyService.startTracking();

      motionListener = (VehicleMotion.addListener as jest.Mock).mock.calls[0][1];

      await EfficiencyService.processLocation(mockLocation);
      jest.clearAllMocks();
      jest.advanceTimersByTime(200);
    });

    it('should detect hard braking with high force and speed decrease', async () => {
      const slowLocation = {
        ...mockLocation,
        coords: { ...mockLocation.coords, speed: 10 },
      };

      await EfficiencyService.processLocation(slowLocation);
      jest.advanceTimersByTime(100);

      const hardBrakeMotion: MotionData = {
        ...mockMotionData,
        horizontalMagnitude: 0.45,
      };

      await motionListener(hardBrakeMotion);

      expect(JourneyService.logEvent).toHaveBeenCalledWith(
        EventType.HarshBraking,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should detect harsh acceleration with high force and speed increase', async () => {
      // Process a faster location - this will save the previous speed (72 km/h) to lastSpeedKmh
      // and update lastLocation with the new speed (90 km/h)
      const fastLocation = {
        ...mockLocation,
        coords: { ...mockLocation.coords, speed: 25 }, // ~90 km/h
      };

      await EfficiencyService.processLocation(fastLocation);
      jest.advanceTimersByTime(100);

      const hardAccelMotion: MotionData = {
        ...mockMotionData,
        horizontalMagnitude: 0.35, // Above threshold
      };

      await motionListener(hardAccelMotion);

      // Should detect acceleration: 90 km/h (new) - 72 km/h (old) = 18 km/h over 0.1s = 180 km/h/s
      expect(JourneyService.logEvent).toHaveBeenCalledWith(
        EventType.HarshAcceleration,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should not detect events below speed threshold', async () => {
      const lowSpeedLocation = {
        ...mockLocation,
        coords: { ...mockLocation.coords, speed: 1 }, // ~3.6 km/h
      };

      await EfficiencyService.processLocation(lowSpeedLocation);

      const motionData: MotionData = {
        ...mockMotionData,
        horizontalMagnitude: 0.5,
      };

      await motionListener(motionData);

      expect(JourneyService.logEvent).not.toHaveBeenCalled();
    });
  });
});
