import { Directory, File, Paths } from 'expo-file-system';
import { createDownloadResumable } from 'expo-file-system/legacy';

import {
  clearInstalledSpeedLimitPackMetadata,
  getInstalledSpeedLimitPackMetadata,
  setInstalledSpeedLimitPackMetadata,
} from '@services/SettingsService';
import { createLogger, LogModule } from '@utils/logger';

import type {
  InstalledSpeedLimitPackMetadata,
  SpeedLimitPackManifest,
  SpeedLimitPackRef,
  SpeedLimitPackServiceController,
  SpeedLimitPackServiceDeps,
  SpeedLimitPackStatus,
} from '@/types';

const DEFAULT_MANIFEST_URL = 'https://github.com/fergalUG/FYP-2025-26/releases/latest/download/speed-limit-pack-manifest.json';
const DEFAULT_REGION_ID = 'ie-ni';
const DEFAULT_REGION_NAME = 'Ireland + Northern Ireland';
const PACK_DIRECTORY_NAME = 'SpeedLimitPacks';
const PACK_FILE_NAME = 'ie-ni.sqlite';

const logger = createLogger(LogModule.SpeedLimitPackService);

const normalizeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const createDefaultStatus = (): SpeedLimitPackStatus => ({
  regionId: DEFAULT_REGION_ID,
  regionName: DEFAULT_REGION_NAME,
  installState: 'not_installed',
  installedPack: null,
  latestManifest: null,
  updateAvailable: false,
  isBusy: false,
  phase: 'idle',
  progressFraction: null,
  bytesWritten: null,
  totalBytes: null,
  errorMessage: null,
});

const isManifest = (value: unknown): value is SpeedLimitPackManifest => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const bounds = candidate.bounds;

  return (
    typeof candidate.schemaVersion === 'number' &&
    typeof candidate.generatedAt === 'string' &&
    typeof candidate.regionId === 'string' &&
    typeof candidate.regionName === 'string' &&
    typeof candidate.packVersion === 'string' &&
    typeof candidate.sourceTimestamp === 'string' &&
    typeof candidate.downloadUrl === 'string' &&
    typeof candidate.md5 === 'string' &&
    typeof candidate.sizeBytes === 'number' &&
    typeof candidate.osmAttribution === 'string' &&
    !!bounds &&
    typeof bounds === 'object' &&
    typeof (bounds as Record<string, unknown>).minLat === 'number' &&
    typeof (bounds as Record<string, unknown>).minLon === 'number' &&
    typeof (bounds as Record<string, unknown>).maxLat === 'number' &&
    typeof (bounds as Record<string, unknown>).maxLon === 'number'
  );
};

const buildPackRef = (metadata: InstalledSpeedLimitPackMetadata): SpeedLimitPackRef => ({
  regionId: metadata.regionId,
  packVersion: metadata.packVersion,
  filePath: metadata.filePath,
  md5: metadata.md5,
  installedAt: metadata.installedAt,
});

const ensureDirectory = (directory: Directory): void => {
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
};

const buildPackDirectory = (): Directory => {
  const directory = new Directory(Paths.document, PACK_DIRECTORY_NAME);
  ensureDirectory(directory);
  return directory;
};

const buildCacheDirectory = (): Directory => {
  const directory = new Directory(Paths.cache, PACK_DIRECTORY_NAME);
  ensureDirectory(directory);
  return directory;
};

const removeFileIfPresent = (file: File): void => {
  if (file.exists) {
    file.delete();
  }
};

const getFileMd5 = (file: File): string => {
  const fileInfo = file.info({ md5: true });
  if (typeof fileInfo.md5 !== 'string' || fileInfo.md5.length === 0) {
    throw new Error('Could not compute the downloaded speed limit pack hash.');
  }

  return fileInfo.md5;
};

export const createSpeedLimitPackServiceController = (deps: SpeedLimitPackServiceDeps): SpeedLimitPackServiceController => {
  const manifestUrl = deps.manifestUrl ?? DEFAULT_MANIFEST_URL;
  const listeners = new Set<(status: SpeedLimitPackStatus) => void>();

  let latestManifest: SpeedLimitPackManifest | null = null;
  let phase: SpeedLimitPackStatus['phase'] = 'idle';
  let progressFraction: number | null = null;
  let bytesWritten: number | null = null;
  let totalBytes: number | null = null;
  let errorMessage: string | null = null;

  const readInstalledMetadata = async (): Promise<InstalledSpeedLimitPackMetadata | null> => {
    const metadata = await deps.settingsStore.getInstalledSpeedLimitPackMetadata();
    if (!metadata) {
      return null;
    }

    const file = new File(metadata.filePath);
    if (!file.exists) {
      deps.logger.warn('Installed speed limit pack metadata pointed to a missing file. Clearing stored metadata.', {
        filePath: metadata.filePath,
      });
      await deps.settingsStore.clearInstalledSpeedLimitPackMetadata();
      return null;
    }

    return metadata;
  };

  const buildStatus = async (): Promise<SpeedLimitPackStatus> => {
    const installedPack = await readInstalledMetadata();
    const status = createDefaultStatus();

    status.installedPack = installedPack;
    status.installState = installedPack ? 'installed' : 'not_installed';
    status.latestManifest = latestManifest;
    status.updateAvailable = !!(installedPack && latestManifest && latestManifest.packVersion !== installedPack.packVersion);
    status.phase = phase;
    status.isBusy = phase !== 'idle' && phase !== 'error';
    status.progressFraction = progressFraction;
    status.bytesWritten = bytesWritten;
    status.totalBytes = totalBytes;
    status.errorMessage = errorMessage;

    return status;
  };

  const notifyListeners = async (): Promise<void> => {
    if (listeners.size === 0) {
      return;
    }

    const status = await buildStatus();
    listeners.forEach((listener) => {
      try {
        listener(status);
      } catch (error) {
        deps.logger.warn('Speed limit pack listener threw an error', error);
      }
    });
  };

  const setTransientState = (
    nextPhase: SpeedLimitPackStatus['phase'],
    nextState: Partial<Pick<SpeedLimitPackStatus, 'progressFraction' | 'bytesWritten' | 'totalBytes' | 'errorMessage'>> = {}
  ): void => {
    phase = nextPhase;
    progressFraction = nextState.progressFraction ?? null;
    bytesWritten = nextState.bytesWritten ?? null;
    totalBytes = nextState.totalBytes ?? null;
    errorMessage = nextState.errorMessage ?? null;
    void notifyListeners();
  };

  const resetTransientState = (): void => {
    phase = 'idle';
    progressFraction = null;
    bytesWritten = null;
    totalBytes = null;
    errorMessage = null;
  };

  const fetchManifest = async (): Promise<SpeedLimitPackManifest> => {
    const response = await deps.fetchFn(manifestUrl);
    if (!response.ok) {
      throw new Error(`Manifest request failed with status ${response.status}`);
    }

    const manifest = (await response.json()) as unknown;
    if (!isManifest(manifest)) {
      throw new Error('Manifest payload was invalid.');
    }

    if (manifest.regionId !== DEFAULT_REGION_ID) {
      throw new Error(`Unsupported speed limit pack region: ${manifest.regionId}`);
    }

    latestManifest = manifest;
    return manifest;
  };

  const installDownloadedPack = async (manifest: SpeedLimitPackManifest, tempFile: File): Promise<InstalledSpeedLimitPackMetadata> => {
    const packDirectory = buildPackDirectory();
    const destinationFile = new File(packDirectory, PACK_FILE_NAME);
    const backupFile = new File(packDirectory, `${PACK_FILE_NAME}.bak`);

    removeFileIfPresent(backupFile);
    if (destinationFile.exists) {
      destinationFile.copy(backupFile);
      destinationFile.delete();
    }

    try {
      tempFile.move(destinationFile);

      const installedMetadata: InstalledSpeedLimitPackMetadata = {
        regionId: manifest.regionId,
        regionName: manifest.regionName,
        packVersion: manifest.packVersion,
        md5: manifest.md5,
        sizeBytes: destinationFile.info().size ?? manifest.sizeBytes,
        sourceTimestamp: manifest.sourceTimestamp,
        installedAt: deps.now(),
        fileName: PACK_FILE_NAME,
        filePath: destinationFile.uri,
        osmAttribution: manifest.osmAttribution,
      };

      const saved = await deps.settingsStore.setInstalledSpeedLimitPackMetadata(installedMetadata);
      if (!saved) {
        throw new Error('Could not persist installed speed limit pack metadata.');
      }

      removeFileIfPresent(backupFile);
      return installedMetadata;
    } catch (error) {
      removeFileIfPresent(destinationFile);
      if (backupFile.exists) {
        backupFile.move(destinationFile);
      }
      throw error;
    } finally {
      removeFileIfPresent(backupFile);
    }
  };

  const getLocalStatus = async (): Promise<SpeedLimitPackStatus> => {
    return buildStatus();
  };

  const getJourneySnapshot = async (): Promise<SpeedLimitPackRef | null> => {
    const metadata = await readInstalledMetadata();
    return metadata ? buildPackRef(metadata) : null;
  };

  const checkForUpdate = async (): Promise<SpeedLimitPackStatus> => {
    setTransientState('checking');

    try {
      await fetchManifest();
      resetTransientState();
    } catch (error) {
      deps.logger.warn('Failed to refresh speed limit pack manifest', error);
      setTransientState('error', { errorMessage: normalizeErrorMessage(error) });
    }

    const status = await buildStatus();
    if (phase === 'error') {
      return status;
    }

    void notifyListeners();
    return status;
  };

  const downloadPack = async (regionId: string): Promise<boolean> => {
    if (regionId !== DEFAULT_REGION_ID) {
      deps.logger.warn('Ignoring download request for unsupported speed limit pack region', { regionId });
      return false;
    }

    if (phase !== 'idle' && phase !== 'error') {
      deps.logger.warn('Ignoring speed limit pack download while another pack operation is in progress.', { phase });
      return false;
    }

    setTransientState('checking');

    let tempFileUri: string | null = null;

    try {
      const manifest = latestManifest ?? (await fetchManifest());
      const cacheDirectory = buildCacheDirectory();
      const tempFile = new File(cacheDirectory, `${manifest.regionId}-${manifest.packVersion}.download`);
      tempFileUri = tempFile.uri;
      removeFileIfPresent(tempFile);

      setTransientState('downloading', { totalBytes: manifest.sizeBytes, bytesWritten: 0, progressFraction: 0 });

      const download = createDownloadResumable(manifest.downloadUrl, tempFile.uri, {}, (data) => {
        const expected = data.totalBytesExpectedToWrite > 0 ? data.totalBytesExpectedToWrite : manifest.sizeBytes;
        const fraction = expected > 0 ? Math.min(1, data.totalBytesWritten / expected) : null;
        setTransientState('downloading', {
          bytesWritten: data.totalBytesWritten,
          totalBytes: expected,
          progressFraction: fraction,
        });
      });

      await download.downloadAsync();

      if (!tempFile.exists) {
        throw new Error('Downloaded speed limit pack file was not found.');
      }

      setTransientState('installing');

      const computedMd5 = getFileMd5(tempFile);
      if (computedMd5.toLowerCase() !== manifest.md5.toLowerCase()) {
        throw new Error('Downloaded speed limit pack hash did not match the manifest.');
      }

      await installDownloadedPack(manifest, tempFile);

      latestManifest = manifest;
      resetTransientState();
      void notifyListeners();
      return true;
    } catch (error) {
      deps.logger.warn('Failed to download or install the speed limit pack', error);
      setTransientState('error', { errorMessage: normalizeErrorMessage(error) });
      return false;
    } finally {
      if (tempFileUri) {
        const cleanupFile = new File(tempFileUri);
        if (cleanupFile.exists) {
          cleanupFile.delete();
        }
      }
    }
  };

  const removePack = async (regionId: string): Promise<boolean> => {
    if (regionId !== DEFAULT_REGION_ID) {
      deps.logger.warn('Ignoring speed limit pack removal for unsupported region', { regionId });
      return false;
    }

    if (phase !== 'idle' && phase !== 'error') {
      deps.logger.warn('Ignoring speed limit pack removal while another pack operation is in progress.', { phase });
      return false;
    }

    setTransientState('removing');

    try {
      const metadata = await readInstalledMetadata();
      if (metadata) {
        const file = new File(metadata.filePath);
        removeFileIfPresent(file);
      }

      await deps.settingsStore.clearInstalledSpeedLimitPackMetadata();
      resetTransientState();
      void notifyListeners();
      return true;
    } catch (error) {
      deps.logger.warn('Failed to remove installed speed limit pack', error);
      setTransientState('error', { errorMessage: normalizeErrorMessage(error) });
      return false;
    }
  };

  const addListener = (listener: (status: SpeedLimitPackStatus) => void): (() => void) => {
    listeners.add(listener);
    void buildStatus()
      .then(listener)
      .catch(() => undefined);

    return () => {
      listeners.delete(listener);
    };
  };

  return {
    getLocalStatus,
    getJourneySnapshot,
    checkForUpdate,
    downloadPack,
    removePack,
    addListener,
  };
};

export const SpeedLimitPackService = createSpeedLimitPackServiceController({
  fetchFn: fetch,
  now: () => Date.now(),
  logger,
  settingsStore: {
    getInstalledSpeedLimitPackMetadata,
    setInstalledSpeedLimitPackMetadata,
    clearInstalledSpeedLimitPackMetadata,
  },
});
