import {
  getAccelerationForceThreshold,
  getAccelerationSpeedChangeThreshold,
  getBrakingForceThreshold,
  getBrakingSpeedChangeThreshold,
  getCorneringForceThreshold,
  getCorneringHeadingThreshold,
} from '@utils/tracking/dynamicThresholds';

describe('dynamicThresholds', () => {
  describe('boundary values', () => {
    it('returns expected braking force thresholds at boundaries', () => {
      expect(getBrakingForceThreshold(19)).toBe(0.45);
      expect(getBrakingForceThreshold(20)).toBe(0.4);
      expect(getBrakingForceThreshold(49)).toBe(0.4);
      expect(getBrakingForceThreshold(50)).toBe(0.35);
      expect(getBrakingForceThreshold(79)).toBe(0.35);
      expect(getBrakingForceThreshold(80)).toBe(0.3);
    });

    it('returns expected braking speed change thresholds at boundaries', () => {
      expect(getBrakingSpeedChangeThreshold(19)).toBe(-22);
      expect(getBrakingSpeedChangeThreshold(20)).toBe(-18);
      expect(getBrakingSpeedChangeThreshold(49)).toBe(-18);
      expect(getBrakingSpeedChangeThreshold(50)).toBe(-14);
      expect(getBrakingSpeedChangeThreshold(79)).toBe(-14);
      expect(getBrakingSpeedChangeThreshold(80)).toBe(-12);
    });

    it('returns expected acceleration force thresholds at boundaries', () => {
      expect(getAccelerationForceThreshold(19)).toBe(0.32);
      expect(getAccelerationForceThreshold(20)).toBe(0.28);
      expect(getAccelerationForceThreshold(49)).toBe(0.28);
      expect(getAccelerationForceThreshold(50)).toBe(0.26);
      expect(getAccelerationForceThreshold(79)).toBe(0.26);
      expect(getAccelerationForceThreshold(80)).toBe(0.24);
    });

    it('returns expected acceleration speed change thresholds at boundaries', () => {
      expect(getAccelerationSpeedChangeThreshold(19)).toBe(15);
      expect(getAccelerationSpeedChangeThreshold(20)).toBe(12);
      expect(getAccelerationSpeedChangeThreshold(49)).toBe(12);
      expect(getAccelerationSpeedChangeThreshold(50)).toBe(9);
      expect(getAccelerationSpeedChangeThreshold(79)).toBe(9);
      expect(getAccelerationSpeedChangeThreshold(80)).toBe(7);
    });

    it('returns expected cornering thresholds at boundaries', () => {
      expect(getCorneringForceThreshold(19)).toBe(0.65);
      expect(getCorneringForceThreshold(20)).toBe(0.55);
      expect(getCorneringForceThreshold(49)).toBe(0.55);
      expect(getCorneringForceThreshold(50)).toBe(0.5);
      expect(getCorneringForceThreshold(79)).toBe(0.5);
      expect(getCorneringForceThreshold(80)).toBe(0.45);

      expect(getCorneringHeadingThreshold(19)).toBe(35);
      expect(getCorneringHeadingThreshold(20)).toBe(25);
      expect(getCorneringHeadingThreshold(49)).toBe(25);
      expect(getCorneringHeadingThreshold(50)).toBe(20);
      expect(getCorneringHeadingThreshold(79)).toBe(20);
      expect(getCorneringHeadingThreshold(80)).toBe(15);
    });
  });

  describe('sensitivity trends', () => {
    it('becomes more sensitive at higher speeds', () => {
      expect(getBrakingForceThreshold(10)).toBeGreaterThan(getBrakingForceThreshold(90));
      expect(getAccelerationForceThreshold(10)).toBeGreaterThan(getAccelerationForceThreshold(90));
      expect(getCorneringForceThreshold(10)).toBeGreaterThan(getCorneringForceThreshold(90));

      // For braking speed change, higher speed should have a less negative threshold (more sensitive)
      expect(getBrakingSpeedChangeThreshold(10)).toBeLessThan(getBrakingSpeedChangeThreshold(90));
      // For acceleration speed change, higher speed should have a lower threshold (more sensitive)
      expect(getAccelerationSpeedChangeThreshold(10)).toBeGreaterThan(getAccelerationSpeedChangeThreshold(90));
      // For heading change, higher speed should require a smaller heading delta
      expect(getCorneringHeadingThreshold(10)).toBeGreaterThan(getCorneringHeadingThreshold(90));
    });
  });

  describe('crossing boundaries', () => {
    it('changes thresholds when speed crosses bands', () => {
      const before = {
        brakingForce: getBrakingForceThreshold(49),
        brakingSpeed: getBrakingSpeedChangeThreshold(49),
        accelForce: getAccelerationForceThreshold(49),
        accelSpeed: getAccelerationSpeedChangeThreshold(49),
        cornerForce: getCorneringForceThreshold(49),
        cornerHeading: getCorneringHeadingThreshold(49),
      };

      const after = {
        brakingForce: getBrakingForceThreshold(50),
        brakingSpeed: getBrakingSpeedChangeThreshold(50),
        accelForce: getAccelerationForceThreshold(50),
        accelSpeed: getAccelerationSpeedChangeThreshold(50),
        cornerForce: getCorneringForceThreshold(50),
        cornerHeading: getCorneringHeadingThreshold(50),
      };

      expect(before).not.toEqual(after);
    });
  });
});
