import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { LogServiceController, LogServiceDeps } from '@types';
import { addLogListener, createLogger, LogModule } from '@utils/logger';

const logger = createLogger(LogModule.LogService);

const LOG_DIR_NAME = 'Logs';
const FLUSH_INTERVAL_MS = 1500;
const MAX_BUFFER_LINES = 50;

const encodeText = (text: string): Uint8Array => {
  return new TextEncoder().encode(text);
};

const appendToFile = (file: File, content: string): void => {
  const handle = file.open();
  try {
    handle.offset = handle.size ?? 0;
    handle.writeBytes(encodeText(content));
  } finally {
    handle.close();
  }
};

export const createLogServiceController = (deps: LogServiceDeps): LogServiceController => {
  const fileSystem = deps.FileSystem ?? { File, Directory, Paths };
  const sharing = deps.Sharing ?? Sharing;
  const serviceLogger = deps.logger;

  let sessionFile: File | null = null;
  let isInitialized = false;
  let unsubscribe: (() => void) | null = null;

  let pendingLines: string[] = [];
  let flushTimeout: ReturnType<typeof setTimeout> | null = null;
  let isFlushing = false;

  const ensureLogsDirectory = (): Directory => {
    const logsDir = new fileSystem.Directory(fileSystem.Paths.document, LOG_DIR_NAME);
    if (!logsDir.exists) {
      logsDir.create({ intermediates: true });
    }
    return logsDir;
  };

  const buildSessionFileName = (): string => {
    const timestamp = new Date(deps.now()).toISOString().replace(/[:.]/g, '-');
    return `VeloMetry_Logs_${timestamp}.txt`;
  };

  const flushPendingLines = (): void => {
    clearTimeout(flushTimeout as ReturnType<typeof setTimeout>);
    flushTimeout = null;

    if (!sessionFile || pendingLines.length === 0 || isFlushing) {
      return;
    }

    const lines = pendingLines;
    pendingLines = [];
    isFlushing = true;

    try {
      appendToFile(sessionFile, `${lines.join('\n')}\n`);
    } finally {
      isFlushing = false;
      if (pendingLines.length > 0) {
        scheduleFlush();
      }
    }
  };

  const scheduleFlush = (): void => {
    if (flushTimeout) {
      return;
    }
    flushTimeout = setTimeout(() => {
      flushPendingLines();
    }, FLUSH_INTERVAL_MS);
  };

  const initSession = (): void => {
    if (isInitialized) {
      return;
    }

    const logsDir = ensureLogsDirectory();
    const fileName = buildSessionFileName();
    const file = new fileSystem.File(logsDir, fileName);
    file.create({ intermediates: true, overwrite: true });
    sessionFile = file;

    unsubscribe = addLogListener((line) => {
      pendingLines.push(line);

      if (pendingLines.length >= MAX_BUFFER_LINES) {
        flushPendingLines();
        return;
      }

      scheduleFlush();
    });

    isInitialized = true;
    serviceLogger.info('Log session initialized');
  };

  const getSessionFileName = (): string | null => {
    if (!sessionFile) {
      initSession();
    }
    return sessionFile?.name ?? null;
  };

  const exportSessionLogs = async (): Promise<boolean> => {
    if (!sessionFile) {
      initSession();
    }

    if (!sessionFile || !sessionFile.exists) {
      serviceLogger.warn('No session log file found to export');
      return false;
    }

    flushPendingLines();

    try {
      const cacheDir = new fileSystem.Directory(fileSystem.Paths.cache, LOG_DIR_NAME);
      if (!cacheDir.exists) {
        cacheDir.create({ intermediates: true });
      }

      const exportFileName = sessionFile.name || `VeloMetry_Logs_${new Date(deps.now()).toISOString()}.txt`;
      const exportFile = new fileSystem.File(cacheDir, exportFileName);
      if (exportFile.exists) {
        exportFile.delete();
      }

      sessionFile.copy(exportFile);

      if (await sharing.isAvailableAsync()) {
        await sharing.shareAsync(exportFile.uri, {
          mimeType: 'text/plain',
          dialogTitle: 'Export VeloMetry Logs',
        });
        serviceLogger.info('Session logs exported successfully');
        return true;
      }

      serviceLogger.warn('Sharing is not available on this device');
      return false;
    } catch (error) {
      serviceLogger.error('Error exporting session logs:', error);
      return false;
    }
  };

  const clearSessionLogs = async (): Promise<boolean> => {
    if (!sessionFile) {
      return false;
    }

    try {
      if (flushTimeout) {
        clearTimeout(flushTimeout);
        flushTimeout = null;
      }
      pendingLines = [];
      sessionFile.write('');
      serviceLogger.info('Session logs cleared');
      return true;
    } catch (error) {
      serviceLogger.error('Failed to clear session logs:', error);
      return false;
    }
  };

  const deleteOldLogs = async (): Promise<number> => {
    if (!sessionFile) {
      initSession();
    }

    const currentName = sessionFile?.name ?? null;
    const logsDir = ensureLogsDirectory();

    try {
      const items = logsDir.list();
      let deletedCount = 0;

      for (const item of items) {
        if (item instanceof fileSystem.Directory) {
          continue;
        }
        const fileName = item.name;
        if (!fileName || fileName === currentName) {
          continue;
        }
        item.delete();
        deletedCount += 1;
      }

      if (deletedCount > 0) {
        serviceLogger.info(`Deleted ${deletedCount} old log file(s)`);
      }
      return deletedCount;
    } catch (error) {
      serviceLogger.error('Failed to delete old log files:', error);
      return 0;
    }
  };

  const cleanup = (): void => {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }

    if (pendingLines.length > 0 && sessionFile) {
      try {
        appendToFile(sessionFile, `${pendingLines.join('\n')}\n`);
        pendingLines = [];
      } catch (error) {
        serviceLogger.error('Failed to flush pending logs during cleanup:', error);
      }
    }

    if (unsubscribe) {
      try {
        unsubscribe();
      } catch (error) {
        serviceLogger.error('Failed to unsubscribe log listener during cleanup:', error);
      }
    }
  };

  return {
    initSession,
    getSessionFileName,
    exportSessionLogs,
    clearSessionLogs,
    deleteOldLogs,
    cleanup,
  };
};

export const LogService = createLogServiceController({
  now: () => Date.now(),
  logger,
});
