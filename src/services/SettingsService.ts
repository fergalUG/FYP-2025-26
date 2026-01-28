import { eq } from 'drizzle-orm';

import { settings } from '@db/schema';
import { db } from '@db/client';

import { createLogger, LogModule } from '@utils/logger';
import { DEFAULT_DRIVER_NAME } from '@constants/defaults';

const logger = createLogger(LogModule.SettingsService);

const DRIVER_NAME_KEY = 'driverName';

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
