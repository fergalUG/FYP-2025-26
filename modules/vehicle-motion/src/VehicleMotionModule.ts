import { NativeModule, requireNativeModule } from 'expo';

import { VehicleMotionModuleEvents, SensorDiagnostics } from './VehicleMotion.types';

declare class VehicleMotionModule extends NativeModule<VehicleMotionModuleEvents> {
  startTracking(): void;
  stopTracking(): void;
  isCalibrated(): boolean;
  getSensorDiagnostics(): SensorDiagnostics;
  captureReference(): void;
  setFilterAlpha(value: number): void;
  setFcMin(value: number): void;
  setFcMax(value: number): void;
  setGyroRef(value: number): void;
}

export default requireNativeModule<VehicleMotionModule>('VehicleMotion');
