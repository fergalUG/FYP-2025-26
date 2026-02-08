const logColours = {
  provider: '\x1b[92m', // Light Green (#90EE90)
  component: '\x1b[36m', // Cyan (#00FFFF)
  hooks: '\x1b[35m', // Magenta (#FF00FF)
  backgroundService: '\x1b[33m', // Yellow (#FFFF00)
  journeyService: '\x1b[94m', // Light Blue (#ADD8E6)
  efficiencyService: '\x1b[32m', // Green (#00FF00)
  themeService: '\x1b[34m', // Blue (#0000FF)
  settingsService: '\x1b[91m', // Light Red (#FF6347)
  logService: '\x1b[90m', // Gray (#808080)
  db: '\x1b[37m', // White (#FFFFFF)
  gpsValidation: '\x1b[31m', // Red (#FF0000)
  reset: '\x1b[0m', // Reset
};

let debugEnabled = false;

export const setDebugEnabled = (enabled: boolean) => {
  debugEnabled = enabled;
};

export const isDebugEnabled = () => debugEnabled;

export const enum LogModule {
  Provider = 'provider',
  Component = 'component',
  Hooks = 'hooks',
  BackgroundService = 'backgroundService',
  JourneyService = 'journeyService',
  EfficiencyService = 'efficiencyService',
  ThemeService = 'themeService',
  SettingsService = 'settingsService',
  LogService = 'logService',
  DB = 'db',
  GpsValidation = 'gpsValidation',
}

//UI LOGGING FUNCTIONS
type LogListener = (logLine: string) => void;
const listeners: LogListener[] = [];

export const addLogListener = (listener: LogListener) => {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
};

const broadcast = (modeule: LogModule, message: string, ...data: any[]) => {
  if (listeners.length === 0) return;

  const args = data.map((d) => (typeof d === 'object' ? JSON.stringify(d) : String(d))).join(' ');
  const line = args ? `[${modeule}] ${message} ${args}` : `[${modeule}] ${message}`;

  listeners.forEach((listener) => listener(line));
};

const info = (module: LogModule, message: string, ...data: any[]) => {
  const colour = logColours[module] || logColours.reset;
  const timestamp = new Date().toISOString();
  console.log(`${colour}${timestamp} [${module}] ${message}`, ...data, logColours.reset);
  broadcast(module, message, ...data);
};

const error = (module: LogModule, message: string, ...data: any[]) => {
  const colour = logColours[module] || logColours.reset;
  const timestamp = new Date().toISOString();
  console.error(`${colour}${timestamp} [${module}] ${message}`, ...data, logColours.reset);
  broadcast(module, message, ...data);
};

const warn = (module: LogModule, message: string, ...data: any[]) => {
  const colour = logColours[module] || logColours.reset;
  const timestamp = new Date().toISOString();
  console.warn(`${colour}${timestamp} [${module}] ${message}`, ...data, logColours.reset);
  broadcast(module, message, ...data);
};

const debug = (module: LogModule, message: string, ...data: any[]) => {
  if (!debugEnabled) {
    return;
  }
  const colour = logColours[module] || logColours.reset;
  const timestamp = new Date().toISOString();
  console.debug(`${colour}${timestamp} [${module}] ${message}`, ...data, logColours.reset);
  broadcast(module, message, ...data);
};

export const createLogger = (module: LogModule) => ({
  info: (message: string, ...data: any[]) => info(module, message, ...data),
  error: (message: string, ...data: any[]) => error(module, message, ...data),
  warn: (message: string, ...data: any[]) => warn(module, message, ...data),
  debug: (message: string, ...data: any[]) => debug(module, message, ...data),
});
