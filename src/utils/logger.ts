const logColours = {
  component: '\x1b[36m', // Cyan (#00FFFF)
  hooks: '\x1b[35m', // Magenta (#FF00FF)
  backgroundService: '\x1b[33m', // Yellow (#FFFF00)
  journeyService: '\x1b[94m', // Light Blue (#ADD8E6)
  efficiencyService: '\x1b[32m', // Green (#00FF00)
  db: '\x1b[37m', // White (#FFFFFF)
  reset: '\x1b[0m', // Reset
};

export const enum LogModule {
  Component = 'component',
  Hooks = 'hooks',
  BackgroundService = 'backgroundService',
  JourneyService = 'journeyService',
  EfficiencyService = 'efficiencyService',
  DB = 'db',
}

const info = (module: LogModule, message: string, ...data: any[]) => {
  const colour = logColours[module] || logColours.reset;
  console.log(`${colour}[${module}] ${message}`, ...data, logColours.reset);
};

const error = (module: LogModule, message: string, ...data: any[]) => {
  const colour = logColours[module] || logColours.reset;
  console.error(`${colour}[${module}] ${message}`, ...data, logColours.reset);
};

const warn = (module: LogModule, message: string, ...data: any[]) => {
  const colour = logColours[module] || logColours.reset;
  console.warn(`${colour}[${module}] ${message}`, ...data, logColours.reset);
};

const debug = (module: LogModule, message: string, ...data: any[]) => {
  const colour = logColours[module] || logColours.reset;
  console.debug(`${colour}[${module}] ${message}`, ...data, logColours.reset);
};

export const createLogger = (module: LogModule) => ({
  info: (message: string, ...data: any[]) => info(module, message, ...data),
  error: (message: string, ...data: any[]) => error(module, message, ...data),
  warn: (message: string, ...data: any[]) => warn(module, message, ...data),
  debug: (message: string, ...data: any[]) => debug(module, message, ...data),
});
