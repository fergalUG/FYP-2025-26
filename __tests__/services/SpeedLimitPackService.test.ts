import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

import { createSpeedLimitPackServiceController } from '@services/SpeedLimitPackService';

import type { InstalledSpeedLimitPackMetadata, SpeedLimitPackManifest, SpeedLimitPackServiceDeps } from '@types';

const toHexSha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');
const toHexMd5 = (value: Buffer): string => crypto.createHash('md5').update(value).digest('hex');

const resolvePathPart = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && 'path' in value && typeof (value as { path: unknown }).path === 'string') {
    return (value as { path: string }).path;
  }

  throw new Error(`Unsupported path part: ${String(value)}`);
};

class FakeFileHandle {
  private readonly buffer: Buffer;

  offset: number | null = 0;
  size: number | null;

  constructor(private readonly filePath: string) {
    this.buffer = fs.existsSync(filePath) ? fs.readFileSync(filePath) : Buffer.alloc(0);
    this.size = this.buffer.length;
  }

  readBytes(length: number): Uint8Array<ArrayBuffer> {
    const start = this.offset ?? 0;
    const end = Math.min(this.buffer.length, start + length);
    const slice = this.buffer.subarray(start, end);
    this.offset = end;
    return new Uint8Array(slice);
  }

  close(): void {}
}

class FakeFile {
  path: string;
  uri: string;

  constructor(...parts: unknown[]) {
    this.path = path.join(...parts.map(resolvePathPart));
    this.uri = this.path;
  }

  get exists(): boolean {
    return fs.existsSync(this.path);
  }

  create(options?: { intermediates?: boolean; overwrite?: boolean }): void {
    fs.mkdirSync(path.dirname(this.path), { recursive: options?.intermediates ?? false });
    if (this.exists && !options?.overwrite) {
      throw new Error('File already exists');
    }
    fs.writeFileSync(this.path, Buffer.alloc(0));
  }

  delete(): void {
    if (this.exists) {
      fs.rmSync(this.path, { force: true });
    }
  }

  move(destination: FakeFile): void {
    fs.mkdirSync(path.dirname(destination.path), { recursive: true });
    fs.renameSync(this.path, destination.path);
    this.path = destination.path;
    this.uri = destination.uri;
  }

  copy(destination: FakeFile): void {
    fs.mkdirSync(path.dirname(destination.path), { recursive: true });
    fs.copyFileSync(this.path, destination.path);
  }

  async text(): Promise<string> {
    return fs.readFileSync(this.path, 'utf8');
  }

  info(options?: { md5?: boolean }): { size?: number; md5?: string | null } {
    if (!this.exists) {
      return {};
    }

    const content = fs.readFileSync(this.path);
    return {
      size: content.length,
      md5: options?.md5 ? toHexMd5(content) : null,
    };
  }

  open(): FakeFileHandle {
    return new FakeFileHandle(this.path);
  }
}

class FakeDirectory {
  path: string;
  uri: string;

  constructor(...parts: unknown[]) {
    this.path = path.join(...parts.map(resolvePathPart));
    this.uri = this.path;
  }

  get exists(): boolean {
    return fs.existsSync(this.path);
  }

  create(options?: { intermediates?: boolean }): void {
    fs.mkdirSync(this.path, { recursive: options?.intermediates ?? false });
  }
}

describe('SpeedLimitPackService', () => {
  let tempRoot: string;
  let storedMetadata: InstalledSpeedLimitPackMetadata | null;
  let downloadSourcePath: string;
  let manifest: SpeedLimitPackManifest;
  let deps: SpeedLimitPackServiceDeps;

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  const createService = () => createSpeedLimitPackServiceController(deps);

  beforeEach(() => {
    jest.clearAllMocks();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speed-limit-pack-service-'));
    storedMetadata = null;

    const downloadDir = path.join(tempRoot, 'downloads');
    fs.mkdirSync(downloadDir, { recursive: true });
    downloadSourcePath = path.join(downloadDir, 'speed-limit-pack-ie-ni.sqlite');
    fs.writeFileSync(downloadSourcePath, 'offline-pack-data');

    manifest = {
      schemaVersion: 1,
      generatedAt: '2026-03-17T00:00:00Z',
      regionId: 'ie-ni',
      regionName: 'Ireland + Northern Ireland',
      packVersion: '20260317',
      sourceTimestamp: '2026-03-17T00:00:00Z',
      downloadUrl: 'https://example.com/speed-limit-pack-ie-ni.sqlite',
      sha256: toHexSha256('offline-pack-data'),
      sizeBytes: Buffer.byteLength('offline-pack-data'),
      bounds: {
        minLat: 51,
        minLon: -11,
        maxLat: 56,
        maxLon: -5,
      },
      osmAttribution: 'OpenStreetMap contributors',
    };

    deps = {
      fetchFn: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => manifest,
      }) as unknown as typeof fetch,
      now: () => 1_710_000_000_000,
      logger,
      FileSystem: {
        File: FakeFile as never,
        Directory: FakeDirectory as never,
        Paths: {
          document: path.join(tempRoot, 'documents'),
          cache: path.join(tempRoot, 'cache'),
        },
      },
      createDownloadResumable: jest.fn((uri: string, fileUri: string, _options, callback) => ({
        downloadAsync: async () => {
          const content = fs.readFileSync(downloadSourcePath);
          fs.mkdirSync(path.dirname(fileUri), { recursive: true });
          fs.writeFileSync(fileUri, content);
          callback?.({
            totalBytesWritten: content.length,
            totalBytesExpectedToWrite: content.length,
          });
          return { uri: fileUri };
        },
      })),
      settingsStore: {
        getInstalledSpeedLimitPackMetadata: jest.fn(async () => storedMetadata),
        setInstalledSpeedLimitPackMetadata: jest.fn(async (metadata: InstalledSpeedLimitPackMetadata) => {
          storedMetadata = metadata;
          return true;
        }),
        clearInstalledSpeedLimitPackMetadata: jest.fn(async () => {
          storedMetadata = null;
          return true;
        }),
      },
    };
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('reports not installed when no local pack metadata exists', async () => {
    const service = createService();

    const status = await service.getLocalStatus();

    expect(status.installState).toBe('not_installed');
    expect(status.installedPack).toBeNull();
  });

  it('downloads, verifies, and installs the offline pack', async () => {
    const service = createService();

    const success = await service.downloadPack('ie-ni');
    const status = await service.getLocalStatus();
    const snapshot = await service.getJourneySnapshot();

    expect(success).toBe(true);
    expect(status.installState).toBe('installed');
    expect(status.installedPack?.packVersion).toBe('20260317');
    expect(snapshot).toEqual(
      expect.objectContaining({
        regionId: 'ie-ni',
        version: '20260317',
      })
    );
    expect(fs.existsSync(path.join(tempRoot, 'documents', 'SpeedLimitPacks', 'ie-ni.sqlite'))).toBe(true);
  });

  it('reports updates when the remote manifest version is newer than the installed pack', async () => {
    storedMetadata = {
      regionId: 'ie-ni',
      regionName: 'Ireland + Northern Ireland',
      packVersion: '20260201',
      sha256: 'old',
      sizeBytes: 10,
      sourceTimestamp: '2026-02-01T00:00:00Z',
      installedAt: 100,
      fileName: 'ie-ni.sqlite',
      filePath: path.join(tempRoot, 'documents', 'SpeedLimitPacks', 'ie-ni.sqlite'),
      osmAttribution: 'OpenStreetMap contributors',
    };
    fs.mkdirSync(path.dirname(storedMetadata.filePath), { recursive: true });
    fs.writeFileSync(storedMetadata.filePath, 'old-pack');

    const service = createService();

    const status = await service.checkForUpdate();

    expect(status.updateAvailable).toBe(true);
    expect(status.latestManifest?.packVersion).toBe('20260317');
  });

  it('rejects the download when the checksum does not match and leaves the old pack untouched', async () => {
    storedMetadata = {
      regionId: 'ie-ni',
      regionName: 'Ireland + Northern Ireland',
      packVersion: '20260201',
      sha256: 'old-checksum',
      sizeBytes: 8,
      sourceTimestamp: '2026-02-01T00:00:00Z',
      installedAt: 100,
      fileName: 'ie-ni.sqlite',
      filePath: path.join(tempRoot, 'documents', 'SpeedLimitPacks', 'ie-ni.sqlite'),
      osmAttribution: 'OpenStreetMap contributors',
    };
    fs.mkdirSync(path.dirname(storedMetadata.filePath), { recursive: true });
    fs.writeFileSync(storedMetadata.filePath, 'old-pack');
    manifest = {
      ...manifest,
      sha256: 'not-the-right-hash',
    };

    const service = createService();

    const success = await service.downloadPack('ie-ni');

    expect(success).toBe(false);
    expect(fs.readFileSync(storedMetadata.filePath, 'utf8')).toBe('old-pack');
  });

  it('removes the installed pack and clears persisted metadata', async () => {
    storedMetadata = {
      regionId: 'ie-ni',
      regionName: 'Ireland + Northern Ireland',
      packVersion: '20260317',
      sha256: manifest.sha256,
      sizeBytes: manifest.sizeBytes,
      sourceTimestamp: manifest.sourceTimestamp,
      installedAt: 100,
      fileName: 'ie-ni.sqlite',
      filePath: path.join(tempRoot, 'documents', 'SpeedLimitPacks', 'ie-ni.sqlite'),
      osmAttribution: manifest.osmAttribution,
    };
    fs.mkdirSync(path.dirname(storedMetadata.filePath), { recursive: true });
    fs.writeFileSync(storedMetadata.filePath, 'offline-pack-data');

    const service = createService();

    const success = await service.removePack('ie-ni');
    const status = await service.getLocalStatus();

    expect(success).toBe(true);
    expect(status.installState).toBe('not_installed');
    expect(fs.existsSync(path.join(tempRoot, 'documents', 'SpeedLimitPacks', 'ie-ni.sqlite'))).toBe(false);
  });
});
