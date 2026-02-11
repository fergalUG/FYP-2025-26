import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { LogFileInfo, LogServiceController, LogServiceDeps } from '@types';
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

  const appendFileBytes = (source: File, destination: File): void => {
    const sourceHandle = source.open();
    const destinationHandle = destination.open();
    try {
      const sourceSize = sourceHandle.size ?? 0;
      sourceHandle.offset = 0;
      destinationHandle.offset = destinationHandle.size ?? 0;
      const chunkSize = 64 * 1024;
      while ((sourceHandle.offset ?? 0) < sourceSize) {
        const remaining = sourceSize - (sourceHandle.offset ?? 0);
        const chunk = sourceHandle.readBytes(Math.min(chunkSize, remaining));
        destinationHandle.writeBytes(chunk);
      }
    } finally {
      sourceHandle.close();
      destinationHandle.close();
    }
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

  const listLogFiles = (): LogFileInfo[] => {
    const logsDir = ensureLogsDirectory();
    const items = logsDir.list();
    const currentBaseName = sessionBaseName;

    return items
      .filter((item): item is File => item instanceof fileSystem.File)
      .map((file) => {
        const info = file.info();
        const name = file.name ?? file.uri.split('/').pop() ?? 'unknown';
        return {
          name,
          size: info.size ?? null,
          modificationTime: info.modificationTime ?? null,
          isCurrentSession: currentBaseName ? name.startsWith(currentBaseName) : false,
        };
      })
      .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
  };

  const exportLogFile = async (fileName: string): Promise<boolean> => {
    if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      serviceLogger.warn('Invalid log file name requested for export', { fileName });
      return false;
    }

    try {
      const logsDir = ensureLogsDirectory();
      const logFile = new fileSystem.File(logsDir, fileName);
      if (!logFile.exists) {
        serviceLogger.warn('Log file not found for export', { fileName });
        return false;
      }

      const cacheDir = new fileSystem.Directory(fileSystem.Paths.cache, LOG_DIR_NAME);
      if (!cacheDir.exists) {
        cacheDir.create({ intermediates: true });
      }

      const exportFile = new fileSystem.File(cacheDir, fileName);
      if (exportFile.exists) {
        exportFile.delete();
      }
      logFile.copy(exportFile);

      if (await sharing.isAvailableAsync()) {
        await sharing.shareAsync(exportFile.uri, {
          mimeType: 'text/plain',
          dialogTitle: `Export VeloMetry Logs (${fileName})`,
        });
        serviceLogger.info('Log file exported successfully', { fileName });
        return true;
      }

      serviceLogger.warn('Sharing is not available on this device');
      return false;
    } catch (error) {
      serviceLogger.error('Error exporting log file:', error);
      return false;
    }
  };

  const exportAllLogs = async (): Promise<boolean> => {
    try {
      const logsDir = ensureLogsDirectory();
      const items = logsDir.list();
      const files = items.filter((item): item is File => item instanceof fileSystem.File);

      if (files.length === 0) {
        serviceLogger.warn('No log files found to export');
        return false;
      }

      const filesWithInfo = files.map((file) => ({
        file,
        info: file.info(),
      }));

      filesWithInfo.sort((a, b) => (a.info.modificationTime ?? 0) - (b.info.modificationTime ?? 0));

      const cacheDir = new fileSystem.Directory(fileSystem.Paths.cache, LOG_DIR_NAME);
      if (!cacheDir.exists) {
        cacheDir.create({ intermediates: true });
      }

      const exportFileName = `VeloMetry_Logs_All_${new Date(deps.now()).toISOString().replace(/[:.]/g, '-')}.txt`;
      const exportFile = new fileSystem.File(cacheDir, exportFileName);
      if (exportFile.exists) {
        exportFile.delete();
      }
      exportFile.create({ intermediates: true, overwrite: true });

      filesWithInfo.forEach(({ file }) => {
        const name = file.name ?? file.uri.split('/').pop() ?? 'unknown';
        appendToFile(exportFile, `\n\n--- ${name} ---\n`);
        appendFileBytes(file, exportFile);
      });

      if (await sharing.isAvailableAsync()) {
        await sharing.shareAsync(exportFile.uri, {
          mimeType: 'text/plain',
          dialogTitle: 'Export All VeloMetry Logs',
        });
        serviceLogger.info(`All logs exported successfully (${filesWithInfo.length} file${filesWithInfo.length === 1 ? '' : 's'})`);
        return true;
      }

      serviceLogger.warn('Sharing is not available on this device');
      return false;
    } catch (error) {
      serviceLogger.error('Error exporting all logs:', error);
      return false;
    }
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
        const baseName = sessionBaseName ?? `VeloMetry_Logs_${new Date(deps.now()).toISOString().replace(/[:.]/g, '-')}`;
        const exportFileName = `${baseName}_combined.txt`;
        const exportFile = new fileSystem.File(cacheDir, exportFileName);
        if (exportFile.exists) {
          exportFile.delete();
        }
        exportFile.create({ intermediates: true, overwrite: true });

        sessionFiles.forEach((sessionLog) => {
          appendFileBytes(sessionLog, exportFile);
        });

        await sharing.shareAsync(exportFile.uri, {
          mimeType: 'text/plain',
          dialogTitle: 'Export VeloMetry Logs',
        });

        serviceLogger.info(`Session logs exported successfully (${sessionFiles.length} part${sessionFiles.length === 1 ? '' : 's'})`);
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
    listLogFiles,
    exportLogFile,
    exportAllLogs,
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
