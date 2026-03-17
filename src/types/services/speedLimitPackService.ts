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
  md5: string;
  sizeBytes: number;
  bounds: SpeedLimitPackBounds;
  osmAttribution: string;
}

export interface InstalledSpeedLimitPackMetadata {
  regionId: string;
  regionName: string;
  packVersion: string;
  md5: string;
  sizeBytes: number;
  sourceTimestamp: string;
  installedAt: number;
  fileName: string;
  filePath: string;
  osmAttribution: string;
}

export interface SpeedLimitPackRef {
  regionId: string;
  packVersion: string;
  filePath: string;
  md5: string;
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
  getJourneySnapshot: () => Promise<SpeedLimitPackRef | null>;
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
  settingsStore: {
    getInstalledSpeedLimitPackMetadata: () => Promise<InstalledSpeedLimitPackMetadata | null>;
    setInstalledSpeedLimitPackMetadata: (metadata: InstalledSpeedLimitPackMetadata) => Promise<boolean>;
    clearInstalledSpeedLimitPackMetadata: () => Promise<boolean>;
  };
}
