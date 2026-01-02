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
};

export type VehicleMotionModuleEvents = {
  onMotionUpdate: (data: MotionData) => void;
};

export type ChangeEventPayload = {
  value: string;
};

export type VehicleMotionViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};
