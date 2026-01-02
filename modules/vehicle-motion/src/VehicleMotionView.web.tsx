import * as React from 'react';

import { VehicleMotionViewProps } from './VehicleMotion.types';

export default function VehicleMotionView(props: VehicleMotionViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
