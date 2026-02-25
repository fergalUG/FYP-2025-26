export type MotionData = {
  x: number;
  y: number;
  z: number;

  rawX: number;
  rawY: number;
  rawZ: number;

  horizontalMagnitude: number;
};

export type ActivityConfidence = 'low' | 'medium' | 'high' | 'unknown';

export type ActivityData = {
  automotive: boolean;
  walking: boolean;
  running: boolean;
  cycling: boolean;
  stationary: boolean;
  unknown: boolean;
  confidence: ActivityConfidence;
  timestamp: number;
};

export type VehicleMotionModuleEvents = {
  onMotionUpdate: (data: MotionData) => void;
  onActivityUpdate: (data: ActivityData) => void;
};
