import {
  PASSIVE_COARSE_DEFERRED_UPDATES_DISTANCE,
  PASSIVE_COARSE_DEFERRED_UPDATES_INTERVAL_MS,
  PASSIVE_COARSE_DISTANCE_INTERVAL,
  PASSIVE_PROBE_DEFERRED_UPDATES_DISTANCE,
  PASSIVE_PROBE_DEFERRED_UPDATES_INTERVAL_MS,
  PASSIVE_PROBE_DISTANCE_INTERVAL,
} from '@constants/gpsConfig';

import type { PassiveTrackingProfile } from '@types';
import type * as Location from 'expo-location';

interface LocationModuleForOptions {
  Accuracy: typeof Location.Accuracy;
  ActivityType: typeof Location.ActivityType;
}

export const buildPassiveTrackingOptions = (
  locationModule: LocationModuleForOptions,
  profile: PassiveTrackingProfile
): Location.LocationTaskOptions => {
  if (profile === 'PROBE') {
    return {
      accuracy: locationModule.Accuracy.High,
      distanceInterval: PASSIVE_PROBE_DISTANCE_INTERVAL,
      deferredUpdatesInterval: PASSIVE_PROBE_DEFERRED_UPDATES_INTERVAL_MS,
      deferredUpdatesDistance: PASSIVE_PROBE_DEFERRED_UPDATES_DISTANCE,
      showsBackgroundLocationIndicator: true,
      activityType: locationModule.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
    };
  }

  return {
    accuracy: locationModule.Accuracy.Balanced,
    distanceInterval: PASSIVE_COARSE_DISTANCE_INTERVAL,
    deferredUpdatesInterval: PASSIVE_COARSE_DEFERRED_UPDATES_INTERVAL_MS,
    deferredUpdatesDistance: PASSIVE_COARSE_DEFERRED_UPDATES_DISTANCE,
    showsBackgroundLocationIndicator: true,
    activityType: locationModule.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
  };
};
