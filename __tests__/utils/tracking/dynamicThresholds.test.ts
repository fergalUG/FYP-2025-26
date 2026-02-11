import {
  getAccelerationForceThreshold,
  getAccelerationSpeedChangeThreshold,
  getBrakingForceThreshold,
  getBrakingSpeedChangeThreshold,
  getCorneringForceThreshold,
  getCorneringHeadingThreshold,
} from '@utils/tracking/dynamicThresholds';

describe('dynamicThresholds', () => {
  describe('band mappings', () => {
    it('returns expected braking force thresholds per band', () => {
      expect(getBrakingForceThreshold('low')).toBe(0.34);
      expect(getBrakingForceThreshold('mid')).toBe(0.32);
      expect(getBrakingForceThreshold('high')).toBe(0.3);
      expect(getBrakingForceThreshold('very_high')).toBe(0.28);
    });

    it('returns expected braking speed change thresholds per band', () => {
      expect(getBrakingSpeedChangeThreshold('low')).toBe(-14);
      expect(getBrakingSpeedChangeThreshold('mid')).toBe(-12);
      expect(getBrakingSpeedChangeThreshold('high')).toBe(-10);
      expect(getBrakingSpeedChangeThreshold('very_high')).toBe(-8);
    });

    it('returns expected acceleration force thresholds per band', () => {
      expect(getAccelerationForceThreshold('low')).toBe(0.32);
      expect(getAccelerationForceThreshold('mid')).toBe(0.28);
      expect(getAccelerationForceThreshold('high')).toBe(0.26);
      expect(getAccelerationForceThreshold('very_high')).toBe(0.24);
    });

    it('returns expected acceleration speed change thresholds per band', () => {
      expect(getAccelerationSpeedChangeThreshold('low')).toBe(15);
      expect(getAccelerationSpeedChangeThreshold('mid')).toBe(12);
      expect(getAccelerationSpeedChangeThreshold('high')).toBe(9);
      expect(getAccelerationSpeedChangeThreshold('very_high')).toBe(7);
    });

    it('returns expected cornering thresholds per band', () => {
      expect(getCorneringForceThreshold('low')).toBe(0.65);
      expect(getCorneringForceThreshold('mid')).toBe(0.55);
      expect(getCorneringForceThreshold('high')).toBe(0.5);
      expect(getCorneringForceThreshold('very_high')).toBe(0.45);

      expect(getCorneringHeadingThreshold('low')).toBe(35);
      expect(getCorneringHeadingThreshold('mid')).toBe(25);
      expect(getCorneringHeadingThreshold('high')).toBe(20);
      expect(getCorneringHeadingThreshold('very_high')).toBe(15);
    });
  });

  describe('sensitivity trends', () => {
    it('becomes more sensitive at higher speeds', () => {
      expect(getBrakingForceThreshold('low')).toBeGreaterThan(getBrakingForceThreshold('very_high'));
      expect(getAccelerationForceThreshold('low')).toBeGreaterThan(getAccelerationForceThreshold('very_high'));
      expect(getCorneringForceThreshold('low')).toBeGreaterThan(getCorneringForceThreshold('very_high'));

      // For braking speed change, higher speed should have a less negative threshold (more sensitive)
      expect(getBrakingSpeedChangeThreshold('low')).toBeLessThan(getBrakingSpeedChangeThreshold('very_high'));
      // For acceleration speed change, higher speed should have a lower threshold (more sensitive)
      expect(getAccelerationSpeedChangeThreshold('low')).toBeGreaterThan(getAccelerationSpeedChangeThreshold('very_high'));
      // For heading change, higher speed should require a smaller heading delta
      expect(getCorneringHeadingThreshold('low')).toBeGreaterThan(getCorneringHeadingThreshold('very_high'));
    });
  });

  describe('crossing boundaries', () => {
    it('changes thresholds when band changes', () => {
      const before = {
        brakingForce: getBrakingForceThreshold('mid'),
        brakingSpeed: getBrakingSpeedChangeThreshold('mid'),
        accelForce: getAccelerationForceThreshold('mid'),
        accelSpeed: getAccelerationSpeedChangeThreshold('mid'),
        cornerForce: getCorneringForceThreshold('mid'),
        cornerHeading: getCorneringHeadingThreshold('mid'),
      };

      const after = {
        brakingForce: getBrakingForceThreshold('high'),
        brakingSpeed: getBrakingSpeedChangeThreshold('high'),
        accelForce: getAccelerationForceThreshold('high'),
        accelSpeed: getAccelerationSpeedChangeThreshold('high'),
        cornerForce: getCorneringForceThreshold('high'),
        cornerHeading: getCorneringHeadingThreshold('high'),
      };

      expect(before).not.toEqual(after);
    });
  });
});
