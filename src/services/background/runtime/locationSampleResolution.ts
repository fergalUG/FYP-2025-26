import { resolvePassiveEffectiveSpeed } from '@services/background/location/passiveSpeed';
import { calculateSpeedFromLocations, type GpsValidationOptions, type ValidatedSpeed, validateGpsSpeed } from '@utils/gpsValidation';
import { handleGpsDropout } from '@utils/tracking/gpsDropoutHandler';

import type { GpsDropoutState, TrackingMode } from '@/types/tracking';
import type { createLogger } from '@utils/logger';
import type * as Location from 'expo-location';

interface ResolveLocationSampleInput {
  mode: TrackingMode;
  lastLocation: Location.LocationObject | null;
  location: Location.LocationObject;
  gpsDropoutState: GpsDropoutState;
  gpsValidationOptions: GpsValidationOptions;
  logger: ReturnType<typeof createLogger>;
}

export interface ResolvedLocationSample {
  locationForProcessing: Location.LocationObject;
  effectiveSpeed: ValidatedSpeed;
  speedSource: 'gps' | 'calculated';
  nextGpsDropoutState: GpsDropoutState;
  shouldEndJourneyForDropout: boolean;
}

export const resolveLocationSample = (input: ResolveLocationSampleInput): ResolvedLocationSample => {
  const { mode, lastLocation, location, gpsDropoutState, gpsValidationOptions, logger } = input;

  if (mode === 'ACTIVE') {
    const dropoutResult = handleGpsDropout(lastLocation, location, gpsDropoutState);
    let locationForProcessing = location;
    let speedSource: 'gps' | 'calculated' = 'gps';

    if (dropoutResult.useCalculatedSpeed && lastLocation) {
      const calculatedSpeed = calculateSpeedFromLocations(lastLocation, location);
      locationForProcessing = {
        ...location,
        coords: { ...location.coords, speed: calculatedSpeed },
      };
      speedSource = 'calculated';
      logger.debug('Using calculated speed during GPS dropout', {
        calculatedSpeed,
      });
    }

    const effectiveSpeed = validateGpsSpeed(
      locationForProcessing.coords.speed,
      locationForProcessing.coords.accuracy,
      gpsValidationOptions,
      speedSource
    );

    return {
      locationForProcessing,
      effectiveSpeed,
      speedSource,
      nextGpsDropoutState: dropoutResult.updatedState,
      shouldEndJourneyForDropout: dropoutResult.shouldEndJourney,
    };
  }

  return {
    locationForProcessing: location,
    effectiveSpeed: resolvePassiveEffectiveSpeed(lastLocation, location, gpsValidationOptions),
    speedSource: 'gps',
    nextGpsDropoutState: {
      isInDropout: false,
      dropoutStartTime: null,
    },
    shouldEndJourneyForDropout: false,
  };
};
