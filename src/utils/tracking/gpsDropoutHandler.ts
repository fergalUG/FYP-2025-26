import type * as Location from 'expo-location';

import { GPS_DROPOUT_START_MS, MAX_GPS_DROPOUT_DURATION_MS } from '@constants/tracking';

import type { GpsDropoutState } from '@/types/tracking';

export interface GpsDropoutResult {
  shouldEndJourney: boolean;
  useCalculatedSpeed: boolean;
  updatedState: GpsDropoutState;
  dropoutDurationMs: number | null;
}

export const handleGpsDropout = (
  lastLocation: Location.LocationObject | null,
  currentLocation: Location.LocationObject,
  state: GpsDropoutState
): GpsDropoutResult => {
  if (!lastLocation) {
    return {
      shouldEndJourney: false,
      useCalculatedSpeed: false,
      updatedState: {
        isInDropout: false,
        dropoutStartTime: null,
      },
      dropoutDurationMs: null,
    };
  }

  const timeSinceLastUpdate = currentLocation.timestamp - lastLocation.timestamp;

  if (timeSinceLastUpdate <= GPS_DROPOUT_START_MS) {
    return {
      shouldEndJourney: false,
      useCalculatedSpeed: false,
      updatedState: {
        isInDropout: false,
        dropoutStartTime: null,
      },
      dropoutDurationMs: null,
    };
  }

  const dropoutStartTime = state.dropoutStartTime ?? lastLocation.timestamp;
  const dropoutDurationMs = currentLocation.timestamp - dropoutStartTime;
  const shouldEndJourney = dropoutDurationMs >= MAX_GPS_DROPOUT_DURATION_MS;

  return {
    shouldEndJourney,
    useCalculatedSpeed: true,
    updatedState: {
      isInDropout: !shouldEndJourney,
      dropoutStartTime,
    },
    dropoutDurationMs,
  };
};
