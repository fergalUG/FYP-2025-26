import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { createBackgroundServiceController } from '@services/BackgroundService';
import { PASSIVE_ACTIVITY_PROBE_DEBOUNCE_MS, PASSIVE_START_CONFIRMATION_WINDOW_MS } from '@constants/gpsConfig';

import type { LocationObject } from 'expo-location';
import type { ActivityData } from '@modules/vehicle-motion/src/VehicleMotion.types';

const makeLocation = (latitude: number, longitude: number, speed: number, accuracy: number, timestamp: number): LocationObject =>
  ({
    coords: {
      latitude,
      longitude,
      speed,
      accuracy,
      altitude: null,
      heading: null,
      altitudeAccuracy: null,
    },
    timestamp,
  }) as LocationObject;

describe('BackgroundService passive start detection', () => {
  let controller: any;
  let nowMs = 1000000;
  const now = () => nowMs;

  const mockJourneyService: any = {
    startJourney: jest.fn().mockResolvedValue(undefined),
    endJourney: jest.fn().mockResolvedValue(undefined),
    logEvent: jest.fn().mockResolvedValue(undefined),
    getCurrentJourneyId: jest.fn().mockReturnValue(123),
    updateJourneyTitle: jest.fn().mockResolvedValue(undefined),
    deleteJourney: jest.fn().mockResolvedValue(undefined),
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

  const mockVehicleMotion: any = {
    startActivityUpdates: jest.fn(),
    stopActivityUpdates: jest.fn(),
    addListener: jest.fn(),
    removeAllListeners: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    nowMs = 1000000;

    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(makeLocation(53.0, -6.0, 0, 5, nowMs));
    (Location.reverseGeocodeAsync as jest.Mock).mockResolvedValue([{ name: 'Mock Place' }]);

    controller = createBackgroundServiceController({
      Location,
      TaskManager,
      JourneyService: mockJourneyService,
      EfficiencyService: mockEfficiencyService,
      VehicleMotion: mockVehicleMotion,
      now,
      logger: mockLogger,
    });
  });

  it('processes all batched passive locations and starts active when any sample has valid GPS speed above threshold', async () => {
    await controller.startLocationMonitoring();
    expect(controller.getState().mode).toBe('PASSIVE');

    await controller.handleLocationTask({
      data: {
        locations: [makeLocation(53.0, -6.0, 20, 5, nowMs), makeLocation(53.0001, -6.0001, -1, 5, nowMs + 1000)],
      },
    });

    expect(controller.getState().mode).toBe('ACTIVE');
    expect(mockJourneyService.startJourney).toHaveBeenCalledTimes(1);
  });

  it('uses passive calculated-speed fallback for repeated -1 GPS speeds and confirms start across updates', async () => {
    await controller.startLocationMonitoring();
    expect(controller.getState().mode).toBe('PASSIVE');

    await controller.handleLocationTask({
      data: {
        locations: [makeLocation(53.0, -6.0, -1, 5, nowMs)],
      },
    });
    expect(controller.getState().mode).toBe('PASSIVE');
    expect(controller.getState().lastLocation?.timestamp).toBe(nowMs);

    nowMs += 10000;
    await controller.handleLocationTask({
      data: {
        locations: [makeLocation(53.0, -5.9985, -1, 5, nowMs)],
      },
    });
    expect(controller.getState().mode).toBe('PASSIVE');
    expect(controller.getState().passiveStartCandidateCount).toBe(1);

    nowMs += 10000;
    await controller.handleLocationTask({
      data: {
        locations: [makeLocation(53.0, -5.997, -1, 5, nowMs)],
      },
    });

    expect(controller.getState().mode).toBe('ACTIVE');
    expect(mockJourneyService.startJourney).toHaveBeenCalledTimes(1);
  });

  it('resets passive start candidate after below-threshold sample and requires confirmation again', async () => {
    await controller.startLocationMonitoring();
    expect(controller.getState().mode).toBe('PASSIVE');

    await controller.handleLocationTask({
      data: {
        locations: [makeLocation(53.0, -6.0, -1, 5, nowMs)],
      },
    });

    nowMs += 10000;
    await controller.handleLocationTask({
      data: {
        locations: [makeLocation(53.0, -5.9985, -1, 5, nowMs)],
      },
    });
    expect(controller.getState().passiveStartCandidateCount).toBe(1);
    expect(controller.getState().mode).toBe('PASSIVE');

    nowMs += 10000;
    await controller.handleLocationTask({
      data: {
        locations: [makeLocation(53.0, -5.99845, -1, 5, nowMs)],
      },
    });
    expect(controller.getState().passiveStartCandidateCount).toBe(0);
    expect(controller.getState().passiveStartCandidateSince).toBeNull();
    expect(controller.getState().mode).toBe('PASSIVE');

    nowMs += 10000;
    await controller.handleLocationTask({
      data: {
        locations: [makeLocation(53.0, -5.99695, -1, 5, nowMs)],
      },
    });
    expect(controller.getState().passiveStartCandidateCount).toBe(1);
    expect(controller.getState().mode).toBe('PASSIVE');
    expect(mockJourneyService.startJourney).toHaveBeenCalledTimes(0);
  });

  it('resets passive start candidate when confirmation gap exceeds window', async () => {
    await controller.startLocationMonitoring();
    expect(controller.getState().mode).toBe('PASSIVE');

    await controller.handleLocationTask({
      data: {
        locations: [makeLocation(53.0, -6.0, -1, 5, nowMs)],
      },
    });

    nowMs += 10000;
    await controller.handleLocationTask({
      data: {
        locations: [makeLocation(53.0, -5.9985, -1, 5, nowMs)],
      },
    });
    expect(controller.getState().passiveStartCandidateCount).toBe(1);
    expect(controller.getState().mode).toBe('PASSIVE');

    nowMs += PASSIVE_START_CONFIRMATION_WINDOW_MS + 1000;
    await controller.handleLocationTask({
      data: {
        locations: [makeLocation(53.0, -5.9895, -1, 5, nowMs)],
      },
    });

    expect(controller.getState().passiveStartCandidateCount).toBe(1);
    expect(controller.getState().mode).toBe('PASSIVE');
    expect(mockJourneyService.startJourney).toHaveBeenCalledTimes(0);
  });

  it('propagates calculated source during active dropout fallback', async () => {
    await controller.startLocationMonitoring();
    expect(controller.getState().mode).toBe('PASSIVE');

    await controller.handleLocationTask({
      data: {
        locations: [makeLocation(53.0, -6.0, 20, 5, nowMs)],
      },
    });
    expect(controller.getState().mode).toBe('ACTIVE');

    nowMs += 11000;
    await controller.handleLocationTask({
      data: {
        locations: [makeLocation(53.001, -6.0, -1, 5, nowMs)],
      },
    });

    expect(mockEfficiencyService.processLocation).toHaveBeenCalledTimes(1);
    const [, speedMetadata] = mockEfficiencyService.processLocation.mock.calls[0];
    expect(speedMetadata).toEqual(
      expect.objectContaining({
        speedSource: 'calculated',
      })
    );
  });

  it('switches to probe profile from sustained automotive activity and uses non-deferred probe settings', async () => {
    await controller.startLocationMonitoring();

    const listener = (mockVehicleMotion.addListener as jest.Mock).mock.calls[0][1] as (data: ActivityData) => Promise<void> | void;
    const activity: ActivityData = {
      automotive: true,
      walking: false,
      running: false,
      cycling: false,
      stationary: false,
      unknown: false,
      confidence: 'high',
      timestamp: nowMs,
    };

    await listener(activity);
    expect(controller.getState().passiveTrackingProfile).toBe('COARSE');

    nowMs += PASSIVE_ACTIVITY_PROBE_DEBOUNCE_MS + 10;
    await listener({ ...activity, timestamp: nowMs });
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }

    expect(controller.getState().passiveTrackingProfile).toBe('PROBE');
    expect(Location.startLocationUpdatesAsync).toHaveBeenLastCalledWith(
      'BACKGROUND-LOCATION-TASK',
      expect.objectContaining({
        distanceInterval: 10,
        deferredUpdatesInterval: 0,
        deferredUpdatesDistance: 0,
      })
    );
  });

  it('keeps activity monitoring active when switching to active mode', async () => {
    await controller.startLocationMonitoring();
    expect(mockVehicleMotion.startActivityUpdates).toHaveBeenCalledTimes(1);

    await controller.handleLocationTask({
      data: {
        locations: [makeLocation(53.0, -6.0, 20, 5, nowMs)],
      },
    });

    expect(controller.getState().mode).toBe('ACTIVE');
    expect(mockVehicleMotion.removeAllListeners).not.toHaveBeenCalledWith('onActivityUpdate');
    expect(mockVehicleMotion.stopActivityUpdates).not.toHaveBeenCalled();
  });
});
