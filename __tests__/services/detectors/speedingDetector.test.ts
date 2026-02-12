import { createSpeedingDetector } from '@services/detectors/speedingDetector';

describe('speedingDetector', () => {
  it('does not detect speeding at or below light threshold', () => {
    const detector = createSpeedingDetector();

    expect(detector.detect(80)).toBeNull();
    expect(detector.detect(90)).toBeNull();
  });

  it('classifies light speeding for speeds above light threshold and at/below moderate threshold', () => {
    const detector = createSpeedingDetector();

    expect(detector.detect(90.1)).toBe('light');
    expect(detector.detect(100)).toBe('light');
  });

  it('classifies moderate speeding for speeds above moderate threshold and at/below harsh threshold', () => {
    const detector = createSpeedingDetector();

    expect(detector.detect(100.1)).toBe('moderate');
    expect(detector.detect(120)).toBe('moderate');
  });

  it('classifies harsh speeding above harsh threshold', () => {
    const detector = createSpeedingDetector();

    expect(detector.detect(120.1)).toBe('harsh');
    expect(detector.detect(150)).toBe('harsh');
  });
});
