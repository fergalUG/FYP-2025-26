import {
  calculateDistanceKm,
  calculateSpeedFromLocations,
  convertKmhToMs,
  convertMsToKmh,
  validateDistanceCalculation,
  validateGpsSpeed,
} from '@utils/gpsValidation';

import type * as Location from 'expo-location';

describe('gpsValidation', () => {
  describe('validateGpsSpeed', () => {
    it('returns invalid for null speed', () => {
      const result = validateGpsSpeed(null, 10);
      expect(result.isValid).toBe(false);
      expect(result.confidence).toBe('none');
      expect(result.reason).toContain('null or undefined');
    });

    it('returns invalid for undefined speed', () => {
      const result = validateGpsSpeed(undefined, 10);
      expect(result.isValid).toBe(false);
      expect(result.confidence).toBe('none');
    });

    it('returns invalid for negative speed (-1 = no GPS fix)', () => {
      const result = validateGpsSpeed(-1, 10);
      expect(result.isValid).toBe(false);
      expect(result.confidence).toBe('none');
      expect(result.reason).toContain('no speed fix');
    });

    it('returns invalid for speed exceeding max threshold', () => {
      const result = validateGpsSpeed(100, 10);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('exceeds maximum');
    });

    it('returns invalid for poor accuracy (>50m)', () => {
      const result = validateGpsSpeed(10, 60);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Accuracy exceeds');
    });

    it('returns medium confidence for acceptable accuracy (5-50m)', () => {
      const result = validateGpsSpeed(10, 20);
      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe('medium');
      expect(result.reason).toContain('acceptable but not optimal');
    });

    it('returns low confidence for very low speed (<0.5 m/s)', () => {
      const result = validateGpsSpeed(0.3, 3);
      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe('low');
      expect(result.reason).toContain('below minimum');
    });

    it('returns high confidence for good speed and accuracy', () => {
      const result = validateGpsSpeed(15, 3);
      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe('high');
      expect(result.reason).toBeUndefined();
    });

    it('uses custom options when provided', () => {
      const result = validateGpsSpeed(100, 3, { maxValidSpeed: 150 });
      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe('high');
    });

    it('returns valid with no accuracy info', () => {
      const result = validateGpsSpeed(10, null);
      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe('high');
    });

    it('respects calculated source when provided', () => {
      const result = validateGpsSpeed(10, 8, undefined, 'calculated');
      expect(result.isValid).toBe(true);
      expect(result.source).toBe('calculated');
    });

    it('keeps none source for no-fix values even with calculated source hint', () => {
      const result = validateGpsSpeed(-1, 8, undefined, 'calculated');
      expect(result.isValid).toBe(false);
      expect(result.source).toBe('none');
    });
  });

  describe('calculateDistanceKm', () => {
    it('calculates distance between two points correctly', () => {
      // Dublin to Cork (approx 220km)
      const dublin = { lat: 53.3498, lon: -6.2603 };
      const cork = { lat: 51.8969, lon: -8.4863 };

      const distance = calculateDistanceKm(dublin.lat, dublin.lon, cork.lat, cork.lon);

      // Should be approximately 220km
      expect(distance).toBeGreaterThan(200);
      expect(distance).toBeLessThan(250);
    });

    it('returns 0 for same location', () => {
      const distance = calculateDistanceKm(53.3498, -6.2603, 53.3498, -6.2603);
      expect(distance).toBe(0);
    });

    it('calculates small distances correctly', () => {
      // Two points 100m apart
      const distance = calculateDistanceKm(53.3498, -6.2603, 53.3507, -6.2603);
      expect(distance).toBeGreaterThan(0.09);
      expect(distance).toBeLessThan(0.11);
    });
  });

  describe('calculateSpeedFromLocations', () => {
    const createLocation = (timestamp: number, lat: number, lon: number, speed: number | null = null): Location.LocationObject =>
      ({
        coords: {
          latitude: lat,
          longitude: lon,
          altitude: 0,
          accuracy: 5,
          altitudeAccuracy: 1,
          heading: 0,
          speed,
        },
        timestamp,
      }) as Location.LocationObject;

    it('calculates speed from two locations', () => {
      // 100m in 10 seconds = 10 m/s = 36 km/h
      const prev = createLocation(1000, 53.3498, -6.2603);
      const current = createLocation(11000, 53.3507, -6.2603);

      const speed = calculateSpeedFromLocations(prev, current);

      expect(speed).toBeGreaterThan(9);
      expect(speed).toBeLessThan(11);
    });

    it('returns 0 for time delta less than 500ms', () => {
      const prev = createLocation(1000, 53.3498, -6.2603);
      const current = createLocation(1200, 53.3507, -6.2603);

      const speed = calculateSpeedFromLocations(prev, current);

      expect(speed).toBe(0);
    });

    it('handles same location (0 distance)', () => {
      const prev = createLocation(1000, 53.3498, -6.2603);
      const current = createLocation(11000, 53.3498, -6.2603);

      const speed = calculateSpeedFromLocations(prev, current);

      expect(speed).toBe(0);
    });

    it('calculates realistic driving speed', () => {
      // 1km in 60 seconds = 16.67 m/s = 60 km/h
      const prev = createLocation(1000, 53.3498, -6.2603);
      const current = createLocation(61000, 53.3588, -6.2603);

      const speed = calculateSpeedFromLocations(prev, current);

      expect(speed).toBeGreaterThan(15);
      expect(speed).toBeLessThan(18);
    });
  });

  describe('validateDistanceCalculation', () => {
    it('returns invalid for non-positive time delta', () => {
      const result = validateDistanceCalculation(1.0, 10, 0, 10);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Non-positive time delta');
    });

    it('returns invalid for poor accuracy', () => {
      const result = validateDistanceCalculation(1.0, 10, 10, 60);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Accuracy too low');
    });

    it('returns invalid for large deviation from expected distance', () => {
      // Speed 10 m/s for 10s = expected 100m
      // But calculated distance is 700m (600m deviation > 500m threshold)
      const result = validateDistanceCalculation(0.7, 10, 10, 10);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('deviation too large');
    });

    it('returns valid for distance within acceptable deviation', () => {
      // Speed 10 m/s for 10s = expected 100m
      // Calculated distance is 150m (50m deviation < 500m threshold)
      const result = validateDistanceCalculation(0.15, 10, 10, 10);
      expect(result.isValid).toBe(true);
      expect(result.adjustedDistanceKm).toBe(0.15);
    });

    it('returns valid for exact match', () => {
      // Speed 10 m/s for 10s = expected 100m = 0.1km
      const result = validateDistanceCalculation(0.1, 10, 10, 10);
      expect(result.isValid).toBe(true);
      expect(result.adjustedDistanceKm).toBe(0.1);
    });

    it('accepts null accuracy', () => {
      const result = validateDistanceCalculation(0.1, 10, 10, null);
      expect(result.isValid).toBe(true);
    });

    it('accepts undefined accuracy', () => {
      const result = validateDistanceCalculation(0.1, 10, 10, undefined);
      expect(result.isValid).toBe(true);
    });

    it('handles edge case just above deviation threshold', () => {
      // Just above 500m deviation threshold
      // Speed 10 m/s for 10s = expected 100m
      // Calculated distance is 601m = 501m deviation (> 500m threshold)
      const result = validateDistanceCalculation(0.601, 10, 10, 10);
      expect(result.isValid).toBe(false);
    });
  });

  describe('convertMsToKmh', () => {
    it('converts 0 m/s to 0 km/h', () => {
      expect(convertMsToKmh(0)).toBe(0);
    });

    it('converts typical speeds correctly', () => {
      expect(convertMsToKmh(10)).toBe(36); // 10 m/s = 36 km/h
      expect(convertMsToKmh(13.89)).toBeCloseTo(50, 0); // ~50 km/h
      expect(convertMsToKmh(27.78)).toBeCloseTo(100, 0); // ~100 km/h
    });

    it('converts negative speeds', () => {
      expect(convertMsToKmh(-5)).toBe(-18);
    });
  });

  describe('convertKmhToMs', () => {
    it('converts 0 km/h to 0 m/s', () => {
      expect(convertKmhToMs(0)).toBe(0);
    });

    it('converts typical speeds correctly', () => {
      expect(convertKmhToMs(36)).toBe(10); // 36 km/h = 10 m/s
      expect(convertKmhToMs(50)).toBeCloseTo(13.89, 2);
      expect(convertKmhToMs(100)).toBeCloseTo(27.78, 2);
    });

    it('converts negative speeds', () => {
      expect(convertKmhToMs(-18)).toBe(-5);
    });
  });

  describe('integration scenarios', () => {
    it('handles complete GPS dropout scenario', () => {
      // GPS reports -1 (no fix)
      const speedValidation = validateGpsSpeed(-1, 10);
      expect(speedValidation.isValid).toBe(false);

      // Fallback to calculated speed
      const prevLocation = {
        coords: {
          latitude: 53.3498,
          longitude: -6.2603,
          altitude: 0,
          accuracy: 5,
          altitudeAccuracy: 1,
          heading: 0,
          speed: 10,
        },
        timestamp: 1000,
      } as Location.LocationObject;

      const currentLocation = {
        coords: {
          latitude: 53.3507,
          longitude: -6.2603,
          altitude: 0,
          accuracy: 5,
          altitudeAccuracy: 1,
          heading: 0,
          speed: -1,
        },
        timestamp: 11000,
      } as Location.LocationObject;

      const calculatedSpeed = calculateSpeedFromLocations(prevLocation, currentLocation);
      expect(calculatedSpeed).toBeGreaterThan(0);

      // Validate the calculated speed
      const calculatedValidation = validateGpsSpeed(calculatedSpeed, 5);
      expect(calculatedValidation.isValid).toBe(true);
    });

    it('handles realistic driving journey', () => {
      // Simulate a 60 km/h (16.67 m/s) driving speed
      const speedMs = convertKmhToMs(60);
      expect(speedMs).toBeCloseTo(16.67, 2);

      // Validate the speed
      const validation = validateGpsSpeed(speedMs, 8);
      expect(validation.isValid).toBe(true);
      expect(validation.confidence).toBe('medium');

      // Calculate distance over 10 seconds
      const distanceKm = (speedMs * 10) / 1000;

      // Validate distance calculation
      const distanceValidation = validateDistanceCalculation(distanceKm, speedMs, 10, 8);
      expect(distanceValidation.isValid).toBe(true);
    });

    it('detects and rejects GPS jump (outlier)', () => {
      // GPS suddenly reports position 1km away in 1 second
      // Expected distance at 10 m/s: 10m
      // Calculated distance: 1000m
      // Deviation: 990m > 500m threshold

      const distanceValidation = validateDistanceCalculation(1.0, 10, 1, 10);
      expect(distanceValidation.isValid).toBe(false);
      expect(distanceValidation.reason).toContain('deviation too large');
    });
  });
});
