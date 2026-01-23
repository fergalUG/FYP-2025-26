process.removeAllListeners('warning');

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  Accuracy: {
    Highest: 1,
    High: 2,
    Balanced: 3,
    Low: 4,
    Lowest: 5,
  },
  ActivityType: {
    Other: 0,
    AutomotiveNavigation: 1,
    Fitness: 2,
    OtherNavigation: 3,
  },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
  getTaskOptionsAsync: jest.fn(),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

jest.mock('./modules/vehicle-motion', () => ({
  __esModule: true,
  default: {
    startTracking: jest.fn(),
    stopTracking: jest.fn(),
    addListener: jest.fn(),
    removeAllListeners: jest.fn(),
    setFilterAlpha: jest.fn(),
    setFcMin: jest.fn(),
    setFcMax: jest.fn(),
    setGyroRef: jest.fn(),
  },
}));

global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
