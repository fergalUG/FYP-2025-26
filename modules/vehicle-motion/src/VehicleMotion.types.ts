export type MotionData = {
  x: number;
  y: number;
  z: number;

  rawX: number;
  rawY: number;
  rawZ: number;

  filteredX: number;
  filteredY: number;
  filteredZ: number;

  isCalibrated: boolean;
  hasReference: boolean;
};

export type CalibrationResult = {
  matrix: number[][];
  sampleCount: number;
  errors?: {
    verticalError: number;
    forwardError: number;
  }
};

export type CalibrationStatus = {
  status: 'detecting' | 'collecting' | 'processing' | 'complete';
  message: string;
  progress?: number;
};

export type SensorDiagnostics = {
  accelMagnitude: number;        // G
  accelStability: number;        // [0,1] dot product
  yawVelocity: number;           // rad/s
  isAccelStable: boolean;
  isAccelInRange: boolean;
  isHeadingSteady: boolean;
  rejectionReason: "" | "accel_low" | "accel_unstable" | "turning"
};

export type VehicleMotionModuleEvents = {
  onMotionUpdate: (data: MotionData) => void;
  onCalibrationComplete: (result: CalibrationResult) => void;
  onCalibrationStatus: (status: CalibrationStatus) => void;
};