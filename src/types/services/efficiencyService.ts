import type * as Location from 'expo-location';

import type { MotionData } from '@modules/vehicle-motion/src/VehicleMotion.types';
import type { ScoringStats } from '@/types/scoring';
import type { JourneyServiceController } from '@/types/services/journeyService';
import { createLogger } from '@utils/logger';

export interface EfficiencyServiceDeps {
  JourneyService: Pick<JourneyServiceController, 'logEvent' | 'getEventsByJourneyId'>;
  VehicleMotion: {
    startTracking: () => void;
    stopTracking: () => void;
    addListener: (eventName: 'onMotionUpdate', listener: (data: MotionData) => void | Promise<void>) => void;
    removeAllListeners: (eventName: 'onMotionUpdate') => void;
  };
  now: () => number;
  logger: ReturnType<typeof createLogger>;
}

export interface EfficiencyServiceController {
  startTracking: () => void;
  stopTracking: () => void;
  processLocation: (location: Location.LocationObject) => Promise<void>;
  calculateJourneyScore: (journeyId: number) => Promise<number>;
  getJourneyEfficiencyStats: (journeyId: number) => Promise<ScoringStats | null>;
}
