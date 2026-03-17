import type { createLogger } from '@utils/logger';

export interface SpeedLimitPackBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export interface SpeedLimitPackManifest {
  schemaVersion: number;
  generatedAt: string;
  regionId: string;
  regionName: string;
  packVersion: string;
  sourceTimestamp: string;
  downloadUrl: string;
  sha256: string;
  sizeBytes: number;
  bounds: SpeedLimitPackBounds;
  osmAttribution: string;
}

export interface InstalledSpeedLimitPackMetadata {
  regionId: string;
  regionName: string;
  packVersion: string;
  sha256: string;
  sizeBytes: number;
  sourceTimestamp: string;
  installedAt: number;
  fileName: string;
  filePath: string;
  osmAttribution: string;
}

export interface OfflineSpeedLimitPackSnapshot {
  regionId: string;
  version: string;
  filePath: string;
  checksum: string;
  installedAt: number;
}

export type SpeedLimitPackInstallState = 'not_installed' | 'installed';
export type SpeedLimitPackPhase = 'idle' | 'checking' | 'downloading' | 'installing' | 'removing' | 'error';

export interface SpeedLimitPackStatus {
  regionId: string;
  regionName: string;
  installState: SpeedLimitPackInstallState;
  installedPack: InstalledSpeedLimitPackMetadata | null;
  latestManifest: SpeedLimitPackManifest | null;
  updateAvailable: boolean;
  isBusy: boolean;
  phase: SpeedLimitPackPhase;
  progressFraction: number | null;
  bytesWritten: number | null;
  totalBytes: number | null;
  errorMessage: string | null;
}

export interface SpeedLimitPackServiceController {
  getLocalStatus: () => Promise<SpeedLimitPackStatus>;
  getJourneySnapshot: () => Promise<OfflineSpeedLimitPackSnapshot | null>;
  checkForUpdate: () => Promise<SpeedLimitPackStatus>;
  downloadPack: (regionId: string) => Promise<boolean>;
  removePack: (regionId: string) => Promise<boolean>;
  addListener: (listener: (status: SpeedLimitPackStatus) => void) => () => void;
}

export interface SpeedLimitPackServiceDeps {
  fetchFn: typeof fetch;
  now: () => number;
  logger: ReturnType<typeof createLogger>;
  manifestUrl?: string;
  FileSystem?: {
    File: new (...uris: Array<string | { path?: string; uri?: string }>) => {
      uri: string;
      readonly exists?: boolean;
      create: (options?: { intermediates?: boolean; overwrite?: boolean }) => void;
      delete: () => void;
      move: (destination: { uri?: string; path?: string }) => void;
      copy: (destination: { uri?: string; path?: string }) => void;
      text: () => Promise<string>;
      info: (options?: { md5?: boolean }) => { size?: number; md5?: string | null };
      open: () => {
        close: () => void;
        readBytes: (length: number) => Uint8Array<ArrayBuffer>;
        offset: number | null;
        size: number | null;
      };
    };
    Directory: new (...uris: Array<string | { path?: string; uri?: string }>) => {
      uri: string;
      readonly exists?: boolean;
      create: (options?: { intermediates?: boolean }) => void;
    };
    Paths: {
      document: string;
      cache: string;
    };
  };
  createDownloadResumable?: (
    uri: string,
    fileUri: string,
    options?: object,
    callback?: (data: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
    resumeData?: string
  ) => {
    downloadAsync: () => Promise<unknown>;
  };
  settingsStore: {
    getInstalledSpeedLimitPackMetadata: () => Promise<InstalledSpeedLimitPackMetadata | null>;
    setInstalledSpeedLimitPackMetadata: (metadata: InstalledSpeedLimitPackMetadata) => Promise<boolean>;
    clearInstalledSpeedLimitPackMetadata: () => Promise<boolean>;
  };
}
