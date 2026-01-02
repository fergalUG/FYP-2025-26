import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './VehicleMotion.types';

type VehicleMotionModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class VehicleMotionModule extends NativeModule<VehicleMotionModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(VehicleMotionModule, 'VehicleMotionModule');
