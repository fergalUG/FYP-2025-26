import type { Directory, File, Paths } from 'expo-file-system';
import type * as Sharing from 'expo-sharing';

import type { createLogger } from '@utils/logger';

export interface LogServiceDeps {
  now: () => number;
  logger: ReturnType<typeof createLogger>;
  FileSystem?: {
    File: typeof File;
    Directory: typeof Directory;
    Paths: typeof Paths;
  };
  Sharing?: {
    isAvailableAsync: typeof Sharing.isAvailableAsync;
    shareAsync: typeof Sharing.shareAsync;
  };
}

export interface LogServiceController {
  initSession: () => void;
  getSessionFileName: () => string | null;
  exportSessionLogs: () => Promise<boolean>;
  clearSessionLogs: () => Promise<boolean>;
  deleteOldLogs: () => Promise<number>;
}
