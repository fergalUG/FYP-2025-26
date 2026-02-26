import {
  PASSIVE_ACTIVITY_PROBE_COOLDOWN_MS,
  PASSIVE_ACTIVITY_PROBE_DEBOUNCE_MS,
  PASSIVE_ACTIVITY_PROBE_MIN_CONFIDENCE_SCORE,
} from '@constants/gpsConfig';
import { evaluateActivityProbeDecision } from '@services/background/decisions/activityProbeDecision';
import { resetPassiveActivityCandidate } from '@services/background/state/mutators';

import type { ActivityData } from '@modules/vehicle-motion/src/VehicleMotion.types';
import type { PassiveTrackingProfile, TrackingState } from '@types';
import type { BackgroundServiceVehicleMotionDeps } from '@/types/services/backgroundService';
import type { createLogger } from '@utils/logger';

interface PassiveActivityMonitoringDeps {
  state: TrackingState;
  vehicleMotion?: BackgroundServiceVehicleMotionDeps;
  now: () => number;
  emitStateChange: () => void;
  switchPassiveTrackingProfile: (profile: PassiveTrackingProfile, reason: string) => Promise<void>;
  onActivityUpdate?: (data: ActivityData) => void;
  logger: ReturnType<typeof createLogger>;
}

interface PassiveActivityMonitoringController {
  start: () => void;
  stop: () => void;
}

export const createPassiveActivityMonitoringController = (deps: PassiveActivityMonitoringDeps): PassiveActivityMonitoringController => {
  let isMonitoring = false;

  const processActivityUpdate = async (data: ActivityData): Promise<void> => {
    deps.onActivityUpdate?.(data);

    const decision = evaluateActivityProbeDecision({
      mode: deps.state.mode,
      isTransitioning: deps.state.isTransitioning,
      passiveTrackingProfile: deps.state.passiveTrackingProfile,
      passiveActivityCandidateSince: deps.state.passiveActivityCandidateSince,
      lastActivityProbeTriggerAt: deps.state.lastActivityProbeTriggerAt,
      now: deps.now(),
      activity: data,
      minConfidenceScore: PASSIVE_ACTIVITY_PROBE_MIN_CONFIDENCE_SCORE,
      debounceMs: PASSIVE_ACTIVITY_PROBE_DEBOUNCE_MS,
      cooldownMs: PASSIVE_ACTIVITY_PROBE_COOLDOWN_MS,
    });

    deps.state.passiveActivityCandidateSince = decision.nextCandidateSince;
    deps.state.lastActivityProbeTriggerAt = decision.nextLastTriggerAt;

    if (decision.action === 'SET_CANDIDATE') {
      deps.emitStateChange();
      return;
    }

    if (decision.shouldSwitchToProbe) {
      deps.logger.info(`Passive automotive activity detected (${data.confidence}); switching to probe profile.`);
      await deps.switchPassiveTrackingProfile('PROBE', `automotive activity (${data.confidence})`);
    }
  };

  const start = (): void => {
    if (!deps.vehicleMotion || isMonitoring) {
      return;
    }

    try {
      deps.vehicleMotion.addListener('onActivityUpdate', (data: ActivityData) => {
        void processActivityUpdate(data).catch((error) => {
          deps.logger.warn('Failed to handle passive activity update:', error);
        });
      });
      deps.vehicleMotion.startActivityUpdates();
      isMonitoring = true;
      deps.logger.info('Passive activity monitoring started.');
    } catch (error) {
      deps.vehicleMotion.removeAllListeners('onActivityUpdate');
      isMonitoring = false;
      deps.logger.warn('Failed to start passive activity monitoring:', error);
    }
  };

  const stop = (): void => {
    if (!deps.vehicleMotion || !isMonitoring) {
      return;
    }

    try {
      deps.vehicleMotion.removeAllListeners('onActivityUpdate');
      deps.vehicleMotion.stopActivityUpdates();
    } catch (error) {
      deps.logger.warn('Failed to stop passive activity monitoring:', error);
    } finally {
      isMonitoring = false;
      resetPassiveActivityCandidate(deps.state);
      deps.state.lastActivityProbeTriggerAt = null;
      deps.emitStateChange();
    }
  };

  return { start, stop };
};
