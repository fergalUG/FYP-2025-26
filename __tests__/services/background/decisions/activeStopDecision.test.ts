import { evaluateActiveStopDecision } from '@services/background/decisions/activeStopDecision';

import type { ValidatedSpeed } from '@utils/gpsValidation';

const makeSpeed = (overrides: Partial<ValidatedSpeed>): ValidatedSpeed => ({
  value: 0,
  isValid: false,
  confidence: 'none',
  source: 'none',
  ...overrides,
});

describe('evaluateActiveStopDecision', () => {
  it('starts low-speed candidate when below threshold and no candidate exists', () => {
    const result = evaluateActiveStopDecision({
      effectiveSpeed: makeSpeed({ isValid: true, value: 1, source: 'gps' }),
      now: 10000,
      totalDistanceKm: 2,
      lowSpeedStartTime: null,
      lowSpeedStartDistanceKm: null,
      shouldEndForConfirmedNonAutomotiveProgress: false,
      passiveSpeedThreshold: 2.77778,
      timeoutMs: 300000,
      progressResetDistanceKm: 0.15,
    });

    expect(result.action).toBe('START_CANDIDATE');
  });

  it('resets candidate when distance progress exceeds reset threshold', () => {
    const result = evaluateActiveStopDecision({
      effectiveSpeed: makeSpeed({ isValid: true, value: 1, source: 'gps' }),
      now: 10000,
      totalDistanceKm: 2.2,
      lowSpeedStartTime: 5000,
      lowSpeedStartDistanceKm: 2.0,
      shouldEndForConfirmedNonAutomotiveProgress: false,
      passiveSpeedThreshold: 2.77778,
      timeoutMs: 300000,
      progressResetDistanceKm: 0.15,
    });

    expect(result.action).toBe('RESET_CANDIDATE_PROGRESS');
    expect(result.distanceSinceCandidateStartKm).toBeCloseTo(0.2, 5);
  });

  it('ends journey when distance progress exceeds threshold with confirmed non-automotive activity', () => {
    const result = evaluateActiveStopDecision({
      effectiveSpeed: makeSpeed({ isValid: true, value: 1, source: 'gps' }),
      now: 10000,
      totalDistanceKm: 2.2,
      lowSpeedStartTime: 5000,
      lowSpeedStartDistanceKm: 2.0,
      shouldEndForConfirmedNonAutomotiveProgress: true,
      passiveSpeedThreshold: 2.77778,
      timeoutMs: 300000,
      progressResetDistanceKm: 0.15,
    });

    expect(result.action).toBe('END_CONFIRMED_NON_AUTOMOTIVE');
    expect(result.finalDistanceKm).toBeCloseTo(2.0, 5);
    expect(result.distanceSinceCandidateStartKm).toBeCloseTo(0.2, 5);
  });

  it('returns timeout once elapsed reaches threshold', () => {
    const result = evaluateActiveStopDecision({
      effectiveSpeed: makeSpeed({ isValid: true, value: 1, source: 'gps' }),
      now: 400000,
      totalDistanceKm: 2.1,
      lowSpeedStartTime: 90000,
      lowSpeedStartDistanceKm: 2.0,
      shouldEndForConfirmedNonAutomotiveProgress: false,
      passiveSpeedThreshold: 2.77778,
      timeoutMs: 300000,
      progressResetDistanceKm: 0.15,
    });

    expect(result.action).toBe('TIMEOUT');
    expect(result.finalDistanceKm).toBeCloseTo(2.0, 5);
    expect(result.timeoutMinutes).toBe(5);
  });

  it('returns ongoing countdown while waiting for timeout', () => {
    const result = evaluateActiveStopDecision({
      effectiveSpeed: makeSpeed({ isValid: true, value: 1, source: 'gps' }),
      now: 110000,
      totalDistanceKm: 2.05,
      lowSpeedStartTime: 100000,
      lowSpeedStartDistanceKm: 2.0,
      shouldEndForConfirmedNonAutomotiveProgress: false,
      passiveSpeedThreshold: 2.77778,
      timeoutMs: 300000,
      progressResetDistanceKm: 0.15,
    });

    expect(result.action).toBe('ONGOING');
    expect(result.secondsLeft).toBe(290);
  });

  it('cancels low-speed candidate when speed recovers', () => {
    const result = evaluateActiveStopDecision({
      effectiveSpeed: makeSpeed({ isValid: true, value: 5, source: 'gps' }),
      now: 110000,
      totalDistanceKm: 2.05,
      lowSpeedStartTime: 100000,
      lowSpeedStartDistanceKm: 2.0,
      shouldEndForConfirmedNonAutomotiveProgress: false,
      passiveSpeedThreshold: 2.77778,
      timeoutMs: 300000,
      progressResetDistanceKm: 0.15,
    });

    expect(result.action).toBe('CANCEL_CANDIDATE');
  });
});
