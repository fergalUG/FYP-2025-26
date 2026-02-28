import type * as Location from 'expo-location';

import type { MotionData } from '@modules/vehicle-motion/src/VehicleMotion.types';
import type { ScoringStats } from '@/types/scoring';
import type { JourneyServiceController } from '@/types/services/journeyService';
import type { RoadSpeedLimitServiceController } from '@/types/services/roadSpeedLimitService';
import type { createLogger } from '@utils/logger';
import type { SpeedConfidence, SpeedSource } from '@utils/gpsValidation';

export interface EfficiencyServiceDeps {
  JourneyService: Pick<JourneyServiceController, 'logEvent' | 'getEventsByJourneyId'>;
  RoadSpeedLimitService: Pick<RoadSpeedLimitServiceController, 'getSpeedLimit' | 'reset'>;
  VehicleMotion: {
    startTracking: () => void;
    stopTracking: () => void;
    addListener: (eventName: 'onMotionUpdate', listener: (data: MotionData) => void | Promise<void>) => void;
    removeAllListeners: (eventName: 'onMotionUpdate') => void;
  };
  now: () => number;
  logger: ReturnType<typeof createLogger>;
}

export interface ProcessLocationOptions {
  speedMs: number;
  eventSpeedMs?: number;
  speedConfidence: SpeedConfidence;
  speedSource: SpeedSource;
}

export interface EfficiencyServiceController {
  startTracking: () => void;
  stopTracking: () => void;
  processLocation: (location: Location.LocationObject, options: ProcessLocationOptions) => Promise<void>;
  calculateJourneyScore: (journeyId: number, distanceKm?: number) => Promise<number>;
  getJourneyEfficiencyStats: (journeyId: number, distanceKm?: number) => Promise<ScoringStats | null>;
}
