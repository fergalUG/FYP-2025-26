import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { LogServiceController, LogServiceDeps } from '@types';
import { addLogListener, createLogger, LogModule } from '@utils/logger';

const logger = createLogger(LogModule.LogService);

const LOG_DIR_NAME = 'Logs';
const FLUSH_INTERVAL_MS = 1500;
const MAX_BUFFER_LINES = 50;
const MAX_LINES_PER_FILE = 50000;

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
  let sessionBaseName: string | null = null;
  let sessionPart = 1;
  let currentLineCount = 0;
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

  const buildSessionBaseName = (): string => {
    const timestamp = new Date(deps.now()).toISOString().replace(/[:.]/g, '-');
    return `VeloMetry_Logs_${timestamp}`;
  };

  const buildSessionFileName = (baseName: string, part: number): string => {
    if (part <= 1) {
      return `${baseName}.txt`;
    }
    return `${baseName}_part${part}.txt`;
  };

  const createSessionFile = (baseName: string, part: number): File => {
    const logsDir = ensureLogsDirectory();
    const file = new fileSystem.File(logsDir, buildSessionFileName(baseName, part));
    file.create({ intermediates: true, overwrite: true });
    return file;
  };

  const formatExportLine = (line: string): string => {
    return `${new Date(deps.now()).toISOString()} ${line}`;
  };

  const getSessionFiles = (): File[] => {
    if (!sessionBaseName) {
      return [];
    }
    const baseName = sessionBaseName;
    const logsDir = ensureLogsDirectory();
    const items = logsDir.list();
    const files = items.filter((item): item is File => item instanceof fileSystem.File && !!item.name && item.name.startsWith(baseName));
    const resolvePart = (name: string | null): number => {
      if (!name) {
        return 1;
      }
      const match = name.match(/_part(\d+)\.txt$/);
      return match ? Number(match[1]) : 1;
    };
    return files.sort((a, b) => resolvePart(a.name) - resolvePart(b.name));
  };

  const rotateSessionFile = (): void => {
    if (!sessionBaseName) {
      return;
    }
    sessionPart += 1;
    sessionFile = createSessionFile(sessionBaseName, sessionPart);
    currentLineCount = 0;
  };

  const appendLinesWithRotation = (lines: string[]): void => {
    if (!sessionFile || !sessionBaseName) {
      return;
    }

    let index = 0;
    while (index < lines.length) {
      const remainingCapacity = MAX_LINES_PER_FILE - currentLineCount;
      if (remainingCapacity <= 0) {
        rotateSessionFile();
        continue;
      }

      const chunk = lines.slice(index, index + remainingCapacity);
      appendToFile(sessionFile, `${chunk.join('\n')}\n`);
      currentLineCount += chunk.length;
      index += chunk.length;
    }
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
      appendLinesWithRotation(lines);
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

    sessionBaseName = buildSessionBaseName();
    sessionPart = 1;
    currentLineCount = 0;
    sessionFile = createSessionFile(sessionBaseName, sessionPart);

    unsubscribe = addLogListener((line) => {
      pendingLines.push(formatExportLine(line));

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

      const sessionFiles = getSessionFiles();
      if (sessionFiles.length === 0) {
        serviceLogger.warn('No session log files found to export');
        return false;
      }

      if (await sharing.isAvailableAsync()) {
        let exportCount = 0;
        for (let index = 0; index < sessionFiles.length; index += 1) {
          const sessionLog = sessionFiles[index];
          const exportFileName = sessionLog.name || `VeloMetry_Logs_${new Date(deps.now()).toISOString()}.txt`;
          const exportFile = new fileSystem.File(cacheDir, exportFileName);
          if (exportFile.exists) {
            exportFile.delete();
          }

          sessionLog.copy(exportFile);

          await sharing.shareAsync(exportFile.uri, {
            mimeType: 'text/plain',
            dialogTitle:
              sessionFiles.length > 1 ? `Export VeloMetry Logs (part ${index + 1}/${sessionFiles.length})` : 'Export VeloMetry Logs',
          });
          exportCount += 1;
        }

        serviceLogger.info(`Session logs exported successfully (${exportCount} file${exportCount === 1 ? '' : 's'})`);
        return exportCount > 0;
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
      const sessionFiles = getSessionFiles();
      if (sessionFiles.length === 0) {
        sessionFile.write('');
      } else {
        sessionFiles.forEach((file, index) => {
          if (index === 0) {
            file.write('');
            return;
          }
          file.delete();
        });
      }
      sessionPart = 1;
      currentLineCount = 0;
      if (sessionBaseName) {
        sessionFile = createSessionFile(sessionBaseName, sessionPart);
      }
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

    const currentNames = new Set(
      getSessionFiles()
        .map((file) => file.name)
        .filter(Boolean)
    );
    const logsDir = ensureLogsDirectory();

    try {
      const items = logsDir.list();
      let deletedCount = 0;

      for (const item of items) {
        if (item instanceof fileSystem.Directory) {
          continue;
        }
        const fileName = item.name;
        if (!fileName || currentNames.has(fileName)) {
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
        appendLinesWithRotation(pendingLines);
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
