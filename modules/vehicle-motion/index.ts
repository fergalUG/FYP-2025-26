// Reexport the native module. On web, it will be resolved to VehicleMotionModule.web.ts
// and on native platforms to VehicleMotionModule.ts
export { default } from './src/VehicleMotionModule';
export { default as VehicleMotionView } from './src/VehicleMotionView';
export * from  './src/VehicleMotion.types';
