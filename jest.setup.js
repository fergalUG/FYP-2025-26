process.removeAllListeners('warning');

jest.mock('expo-location', () => {
  const api = {
    requestForegroundPermissionsAsync: jest.fn(),
    requestBackgroundPermissionsAsync: jest.fn(),
    getForegroundPermissionsAsync: jest.fn(),
    getBackgroundPermissionsAsync: jest.fn(),
    getCurrentPositionAsync: jest.fn(),
    reverseGeocodeAsync: jest.fn(),
    watchPositionAsync: jest.fn(),
    hasStartedLocationUpdatesAsync: jest.fn(),
    startLocationUpdatesAsync: jest.fn(),
    stopLocationUpdatesAsync: jest.fn(),
    Accuracy: {
      BestForNavigation: 0,
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
  };

  return {
    __esModule: true,
    ...api,
    default: api,
  };
});

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
  getTaskOptionsAsync: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}));

const mockDb = {
  execAsync: jest.fn(),
  runAsync: jest.fn(),
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
  execSync: jest.fn(),
  runSync: jest.fn(),
  getAllSync: jest.fn(),
  getFirstSync: jest.fn(),
  closeAsync: jest.fn(),
  withTransactionAsync: jest.fn(),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
  openDatabaseSync: jest.fn(() => mockDb),
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn(function (...parts) {
    this.uri = parts.join('/') || 'mock://file';
    this.exists = true;
    this.create = jest.fn();
    this.delete = jest.fn();
    this.move = jest.fn((destination) => {
      this.uri = destination.uri ?? 'mock://file';
    });
    this.copy = jest.fn();
    this.text = jest.fn().mockResolvedValue('');
    this.info = jest.fn(() => ({ size: 0, md5: null }));
    this.open = jest.fn(() => ({
      size: 0,
      offset: 0,
      readBytes: jest.fn(() => new Uint8Array()),
      close: jest.fn(),
    }));
  }),
  Directory: jest.fn(function (...parts) {
    this.uri = parts.join('/') || 'mock://directory';
    this.exists = true;
    this.create = jest.fn();
    this.list = jest.fn(() => []);
  }),
  Paths: {
    document: 'mock://documents',
    cache: 'mock://cache',
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  createDownloadResumable: jest.fn((uri, fileUri, options, callback) => ({
    downloadAsync: jest.fn().mockImplementation(async () => {
      callback?.({ totalBytesWritten: 1, totalBytesExpectedToWrite: 1 });
      return { uri: fileUri };
    }),
  })),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn(),
}));

jest.mock('./modules/vehicle-motion', () => ({
  __esModule: true,
  default: {
    startTracking: jest.fn(),
    stopTracking: jest.fn(),
    startActivityUpdates: jest.fn(),
    stopActivityUpdates: jest.fn(),
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
