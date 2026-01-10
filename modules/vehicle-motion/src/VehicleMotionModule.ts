import { NativeModule, requireNativeModule } from 'expo';

import { VehicleMotionModuleEvents } from './VehicleMotion.types';

declare class VehicleMotionModule extends NativeModule<VehicleMotionModuleEvents> {
  startTracking(): void;
  stopTracking(): void;
  setStaticReference(): void;
}

export default requireNativeModule<VehicleMotionModule>('VehicleMotion');
