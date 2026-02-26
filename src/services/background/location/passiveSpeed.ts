import { calculateSpeedFromLocations, validateGpsSpeed, type GpsValidationOptions, type ValidatedSpeed } from '@utils/gpsValidation';

import type * as Location from 'expo-location';

export const resolvePassiveEffectiveSpeed = (
  previousLocation: Location.LocationObject | null,
  currentLocation: Location.LocationObject,
  gpsValidationOptions: GpsValidationOptions
): ValidatedSpeed => {
  const validatedSpeed = validateGpsSpeed(currentLocation.coords.speed, currentLocation.coords.accuracy, gpsValidationOptions);
  if (validatedSpeed.isValid || !previousLocation) {
    return validatedSpeed;
  }

  const calculatedSpeed = calculateSpeedFromLocations(previousLocation, currentLocation);
  const calculatedValidated = validateGpsSpeed(calculatedSpeed, currentLocation.coords.accuracy, gpsValidationOptions, 'calculated');

  if (!calculatedValidated.isValid) {
    return validatedSpeed;
  }

  return calculatedValidated;
};
