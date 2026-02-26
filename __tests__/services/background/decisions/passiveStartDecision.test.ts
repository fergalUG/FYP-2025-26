import { evaluatePassiveStartDecision } from '@services/background/decisions/passiveStartDecision';

import type { ValidatedSpeed } from '@utils/gpsValidation';

const makeSpeed = (overrides: Partial<ValidatedSpeed>): ValidatedSpeed => ({
  value: 0,
  isValid: false,
  confidence: 'none',
  source: 'none',
  ...overrides,
});

describe('evaluatePassiveStartDecision', () => {
  it('starts active immediately for valid gps speed above threshold', () => {
    const result = evaluatePassiveStartDecision({
      effectiveSpeed: makeSpeed({ isValid: true, source: 'gps', value: 20 }),
      locationTimestamp: 1000,
      candidateSince: 500,
      candidateCount: 1,
      activeSpeedThreshold: 4.16667,
      confirmationCount: 2,
      confirmationWindowMs: 120000,
    });

    expect(result).toEqual({
      action: 'START_ACTIVE_GPS',
      nextCandidateSince: null,
      nextCandidateCount: 0,
    });
  });

  it('updates calculated candidate count within confirmation window', () => {
    const result = evaluatePassiveStartDecision({
      effectiveSpeed: makeSpeed({ isValid: true, source: 'calculated', value: 5 }),
      locationTimestamp: 10000,
      candidateSince: 2000,
      candidateCount: 1,
      activeSpeedThreshold: 4.16667,
      confirmationCount: 3,
      confirmationWindowMs: 120000,
    });

    expect(result).toEqual({
      action: 'UPDATE_CANDIDATE',
      nextCandidateSince: 2000,
      nextCandidateCount: 2,
    });
  });

  it('starts active once calculated confirmation threshold is reached', () => {
    const result = evaluatePassiveStartDecision({
      effectiveSpeed: makeSpeed({ isValid: true, source: 'calculated', value: 5 }),
      locationTimestamp: 10000,
      candidateSince: 2000,
      candidateCount: 1,
      activeSpeedThreshold: 4.16667,
      confirmationCount: 2,
      confirmationWindowMs: 120000,
    });

    expect(result).toEqual({
      action: 'START_ACTIVE_CALCULATED',
      nextCandidateSince: null,
      nextCandidateCount: 0,
    });
  });

  it('resets candidate when speed drops below threshold', () => {
    const result = evaluatePassiveStartDecision({
      effectiveSpeed: makeSpeed({ isValid: true, source: 'gps', value: 1 }),
      locationTimestamp: 10000,
      candidateSince: 2000,
      candidateCount: 1,
      activeSpeedThreshold: 4.16667,
      confirmationCount: 2,
      confirmationWindowMs: 120000,
    });

    expect(result).toEqual({
      action: 'RESET_CANDIDATE',
      nextCandidateSince: null,
      nextCandidateCount: 0,
    });
  });
});
