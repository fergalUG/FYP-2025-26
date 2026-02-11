import { handleGpsDropout } from '@utils/tracking/gpsDropoutHandler';
import { GPS_DROPOUT_START_MS, MAX_GPS_DROPOUT_DURATION_MS } from '@constants/tracking';

import type { GpsDropoutState } from '@/types/tracking';

const createLocation = (timestamp: number, speed: number = 0) => ({
  coords: {
    latitude: 0,
    longitude: 0,
    speed,
    accuracy: 5,
    altitude: 0,
    altitudeAccuracy: 1,
    heading: 0,
  },
  timestamp,
});

describe('handleGpsDropout', () => {
  const baseState: GpsDropoutState = {
    isInDropout: false,
    dropoutStartTime: null,
  };

  it('does not enter dropout on first location', () => {
    const result = handleGpsDropout(null, createLocation(1000, 10), baseState);
    expect(result.shouldEndJourney).toBe(false);
    expect(result.useCalculatedSpeed).toBe(false);
    expect(result.updatedState.isInDropout).toBe(false);
  });

  it('does not enter dropout for short gaps', () => {
    const last = createLocation(1000, 10);
    const current = createLocation(1000 + GPS_DROPOUT_START_MS - 100, 12);
    const result = handleGpsDropout(last, current, baseState);
    expect(result.updatedState.isInDropout).toBe(false);
    expect(result.shouldEndJourney).toBe(false);
  });

  it('enters dropout and uses calculated speed for long gaps', () => {
    const last = createLocation(1000, 10);
    const current = createLocation(1000 + GPS_DROPOUT_START_MS + 100, 12);
    const result = handleGpsDropout(last, current, baseState);
    expect(result.updatedState.isInDropout).toBe(true);
    expect(result.shouldEndJourney).toBe(false);
    expect(result.useCalculatedSpeed).toBe(true);
  });

  it('ends journey when dropout exceeds maximum duration', () => {
    const last = createLocation(1000, 10);
    const current = createLocation(1000 + MAX_GPS_DROPOUT_DURATION_MS + 100, 12);
    const result = handleGpsDropout(last, current, baseState);
    expect(result.shouldEndJourney).toBe(true);
    expect(result.updatedState.isInDropout).toBe(false);
  });
});
