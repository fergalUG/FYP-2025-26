export type MotionData = {
  x: number;
  y: number;
  z: number;

  rawX: number;
  rawY: number;
  rawZ: number;

  horizontalMagnitude: number;
};

export type VehicleMotionModuleEvents = {
  onMotionUpdate: (data: MotionData) => void;
};
