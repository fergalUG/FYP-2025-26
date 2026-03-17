import { eq } from 'drizzle-orm';

import { settings } from '@db/schema';
import { db } from '@db/client';

import { createLogger, LogModule } from '@utils/logger';
import { DEFAULT_DRIVER_NAME } from '@constants/defaults';

import type { InstalledSpeedLimitPackMetadata } from '@/types/services/speedLimitPackService';

const logger = createLogger(LogModule.SettingsService);

const DRIVER_NAME_KEY = 'driverName';
const DEBUG_OVERLAY_KEY = 'debugOverlay';
const DEBUG_LOGS_KEY = 'debugLogs';
const MAP_MARKER_DEBUG_METADATA_KEY = 'mapMarkerDebugMetadata';
const SPEED_LIMIT_DETECTION_ENABLED_KEY = 'speedLimitDetectionEnabled';
const INSTALLED_SPEED_LIMIT_PACK_METADATA_KEY = 'installedSpeedLimitPackMetadata';

export const getDriverName = async (): Promise<string> => {
  try {
    const result = await db.select().from(settings).where(eq(settings.key, DRIVER_NAME_KEY));

    if (result.length > 0 && result[0].value) {
      return result[0].value;
    }
    return DEFAULT_DRIVER_NAME;
  } catch (error) {
    logger.warn('Failed to load driver name:', error);
    return DEFAULT_DRIVER_NAME;
  }
};

export const setDriverName = async (name: string): Promise<boolean> => {
  const input = name.trim().length > 0 ? name.trim() : DEFAULT_DRIVER_NAME;

  try {
    logger.debug('Saving driver name:', input);

    await db
      .insert(settings)
      .values({
        key: DRIVER_NAME_KEY,
        value: input,
      })
      .onConflictDoUpdate({ target: settings.key, set: { value: input } });

    return true;
  } catch (error) {
    logger.warn('Failed to save driver name:', error);
    return false;
  }
};

export const getDebugOverlay = async (): Promise<boolean> => {
  try {
    const result = await db.select().from(settings).where(eq(settings.key, DEBUG_OVERLAY_KEY));
    if (result.length > 0 && result[0].value) {
      return result[0].value === 'true';
    }
    return false;
  } catch (error) {
    logger.warn('Failed to load debug overlay setting:', error);
    return false;
  }
};

export const setDebugOverlay = async (enabled: boolean): Promise<boolean> => {
  const input = String(enabled);
  try {
    logger.debug('Saving debug overlay setting:', enabled);
    await db
      .insert(settings)
      .values({ key: DEBUG_OVERLAY_KEY, value: input })
      .onConflictDoUpdate({ target: settings.key, set: { value: input } });
    return true;
  } catch (error) {
    logger.warn('Failed to save debug overlay setting:', error);
    return false;
  }
};

export const getDebugLogsEnabled = async (): Promise<boolean> => {
  try {
    const result = await db.select().from(settings).where(eq(settings.key, DEBUG_LOGS_KEY));
    if (result.length > 0 && result[0].value) {
      return result[0].value === 'true';
    }
    return true;
  } catch (error) {
    logger.warn('Failed to load debug logs setting:', error);
    return false;
  }
};

export const setDebugLogsEnabled = async (enabled: boolean): Promise<boolean> => {
  const input = String(enabled);
  try {
    logger.debug('Saving debug logs setting:', enabled);
    await db
      .insert(settings)
      .values({ key: DEBUG_LOGS_KEY, value: input })
      .onConflictDoUpdate({ target: settings.key, set: { value: input } });
    return true;
  } catch (error) {
    logger.warn('Failed to save debug logs setting:', error);
    return false;
  }
};

export const getMapMarkerDebugMetadataEnabled = async (): Promise<boolean> => {
  try {
    const result = await db.select().from(settings).where(eq(settings.key, MAP_MARKER_DEBUG_METADATA_KEY));
    if (result.length > 0 && result[0].value) {
      return result[0].value === 'true';
    }
    return false;
  } catch (error) {
    logger.warn('Failed to load map marker debug metadata setting:', error);
    return false;
  }
};

export const setMapMarkerDebugMetadataEnabled = async (enabled: boolean): Promise<boolean> => {
  const input = String(enabled);
  try {
    logger.debug('Saving map marker debug metadata setting:', enabled);
    await db
      .insert(settings)
      .values({ key: MAP_MARKER_DEBUG_METADATA_KEY, value: input })
      .onConflictDoUpdate({ target: settings.key, set: { value: input } });
    return true;
  } catch (error) {
    logger.warn('Failed to save map marker debug metadata setting:', error);
    return false;
  }
};

export const getSpeedLimitDetectionEnabled = async (): Promise<boolean> => {
  try {
    const result = await db.select().from(settings).where(eq(settings.key, SPEED_LIMIT_DETECTION_ENABLED_KEY));
    if (result.length > 0 && result[0].value) {
      return result[0].value === 'true';
    }
    return false;
  } catch (error) {
    logger.warn('Failed to load speed limit detection setting:', error);
    return false;
  }
};

export const setSpeedLimitDetectionEnabled = async (enabled: boolean): Promise<boolean> => {
  const input = String(enabled);
  try {
    logger.debug('Saving speed limit detection setting:', enabled);
    await db
      .insert(settings)
      .values({ key: SPEED_LIMIT_DETECTION_ENABLED_KEY, value: input })
      .onConflictDoUpdate({ target: settings.key, set: { value: input } });
    return true;
  } catch (error) {
    logger.warn('Failed to save speed limit detection setting:', error);
    return false;
  }
};

export const getInstalledSpeedLimitPackMetadata = async (): Promise<InstalledSpeedLimitPackMetadata | null> => {
  try {
    const result = await db.select().from(settings).where(eq(settings.key, INSTALLED_SPEED_LIMIT_PACK_METADATA_KEY));
    const value = result[0]?.value;
    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as InstalledSpeedLimitPackMetadata;
    if (
      typeof parsed?.regionId !== 'string' ||
      typeof parsed?.regionName !== 'string' ||
      typeof parsed?.packVersion !== 'string' ||
      typeof parsed?.sha256 !== 'string' ||
      typeof parsed?.sizeBytes !== 'number' ||
      typeof parsed?.sourceTimestamp !== 'string' ||
      typeof parsed?.installedAt !== 'number' ||
      typeof parsed?.fileName !== 'string' ||
      typeof parsed?.filePath !== 'string' ||
      typeof parsed?.osmAttribution !== 'string'
    ) {
      return null;
    }

    return parsed;
  } catch (error) {
    logger.warn('Failed to load installed speed limit pack metadata:', error);
    return null;
  }
};

export const setInstalledSpeedLimitPackMetadata = async (metadata: InstalledSpeedLimitPackMetadata): Promise<boolean> => {
  try {
    logger.debug('Saving installed speed limit pack metadata:', metadata);
    await db
      .insert(settings)
      .values({
        key: INSTALLED_SPEED_LIMIT_PACK_METADATA_KEY,
        value: JSON.stringify(metadata),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: JSON.stringify(metadata) },
      });
    return true;
  } catch (error) {
    logger.warn('Failed to save installed speed limit pack metadata:', error);
    return false;
  }
};

export const clearInstalledSpeedLimitPackMetadata = async (): Promise<boolean> => {
  try {
    await db.delete(settings).where(eq(settings.key, INSTALLED_SPEED_LIMIT_PACK_METADATA_KEY));
    return true;
  } catch (error) {
    logger.warn('Failed to clear installed speed limit pack metadata:', error);
    return false;
  }
};
