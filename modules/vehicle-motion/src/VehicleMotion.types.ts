import type { StyleProp, ViewStyle } from 'react-native';

export type OnLoadEventPayload = {
  url: string;
};

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

export type VehicleMotionModuleEvents = {
  onMotionUpdate: (data: MotionData) => void;
  onCalibrationComplete: (result: CalibrationResult) => void;
  onCalibrationStatus: (status: CalibrationStatus) => void;
};

export type ChangeEventPayload = {
  value: string;
};

export type VehicleMotionViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};
