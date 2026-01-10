import type { StyleProp, ViewStyle } from 'react-native';

export type OnLoadEventPayload = {
  url: string;
};

export type MotionData = {
  x: number;
  y: number;
  z: number;
  pitch: number;
  roll: number;
  yaw: number;
  isCalibrated: boolean;
};

export type CalibrationResult = {
  matrix: number[][];
  sampleCount: number;
};

export type CalibrationStatus = {
  status: 'detecting' | 'collecting' | 'complete';
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
