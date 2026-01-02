import { requireNativeView } from 'expo';
import * as React from 'react';

import { VehicleMotionViewProps } from './VehicleMotion.types';

const NativeView: React.ComponentType<VehicleMotionViewProps> =
  requireNativeView('VehicleMotion');

export default function VehicleMotionView(props: VehicleMotionViewProps) {
  return <NativeView {...props} />;
}
