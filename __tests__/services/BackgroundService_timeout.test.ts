import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { createBackgroundServiceController } from '@services/BackgroundService';

describe('BackgroundService Timeout Logic', () => {
  let controller: any;
  let nowMs = 1000000;
  const now = () => nowMs;

  const mockJourneyService: any = {
    startJourney: jest.fn().mockResolvedValue(undefined),
    endJourney: jest.fn().mockResolvedValue(undefined),
    logEvent: jest.fn().mockResolvedValue(undefined),
    getCurrentJourneyId: jest.fn().mockReturnValue('journey-123'),
    updateJourneyTitle: jest.fn().mockResolvedValue(undefined),
  };

  const mockEfficiencyService: any = {
    startTracking: jest.fn(),
    stopTracking: jest.fn(),
    processLocation: jest.fn().mockResolvedValue(undefined),
    calculateJourneyScore: jest.fn().mockResolvedValue(100),
    getJourneyEfficiencyStats: jest.fn().mockResolvedValue({}),
  };

  const mockLogger: any = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    nowMs = 1000000;

    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 0, longitude: 0, speed: 0, accuracy: 5 },
      timestamp: 1000000,
    });
    (Location.reverseGeocodeAsync as jest.Mock).mockResolvedValue([{ name: 'Mock Place' }]);

    controller = createBackgroundServiceController({
      Location,
      TaskManager,
      JourneyService: mockJourneyService,
      EfficiencyService: mockEfficiencyService,
      now,
      logger: mockLogger,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('switches to PASSIVE mode after timeout when low speed location update received', async () => {
    await controller.startLocationMonitoring();
    expect(controller.getState().mode).toBe('PASSIVE');

    await controller.handleLocationTask({
      data: {
        locations: [{ coords: { latitude: 0, longitude: 0, speed: 20, accuracy: 5 }, timestamp: nowMs }],
      },
    });
    expect(controller.getState().mode).toBe('ACTIVE');

    nowMs += 1000;
    await controller.handleLocationTask({
      data: {
        locations: [{ coords: { latitude: 0, longitude: 0, speed: 1, accuracy: 5 }, timestamp: nowMs }],
      },
    });
    expect(controller.getState().mode).toBe('ACTIVE');
    expect(controller.getState().lowSpeedStartTime).toBe(nowMs);

    // Advance time past the timeout threshold
    nowMs += 121000;

    // Send another low speed location update to trigger the timeout check
    await controller.handleLocationTask({
      data: {
        locations: [{ coords: { latitude: 0, longitude: 0, speed: 1, accuracy: 5 }, timestamp: nowMs }],
      },
    });

    expect(controller.getState().mode).toBe('PASSIVE');
    expect(mockJourneyService.endJourney).toHaveBeenCalled();
  });

  it('cancels timeout if speed increases', async () => {
    await controller.startLocationMonitoring();

    await controller.handleLocationTask({
      data: {
        locations: [{ coords: { latitude: 0, longitude: 0, speed: 20, accuracy: 5 }, timestamp: nowMs }],
      },
    });

    nowMs += 1000;
    await controller.handleLocationTask({
      data: {
        locations: [{ coords: { latitude: 0, longitude: 0, speed: 1, accuracy: 5 }, timestamp: nowMs }],
      },
    });
    expect(controller.getState().lowSpeedStartTime).toBe(nowMs);

    nowMs += 5000;
    await controller.handleLocationTask({
      data: {
        locations: [{ coords: { latitude: 0, longitude: 0, speed: 10, accuracy: 5 }, timestamp: nowMs }],
      },
    });
    expect(controller.getState().lowSpeedStartTime).toBeNull();

    nowMs += 100000;
    jest.advanceTimersByTime(100000);
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }

    expect(controller.getState().mode).toBe('ACTIVE');
    expect(mockJourneyService.endJourney).not.toHaveBeenCalled();
  });
});
