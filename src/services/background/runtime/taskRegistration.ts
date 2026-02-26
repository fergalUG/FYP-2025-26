import type * as TaskManager from 'expo-task-manager';

import type { LocationTaskData } from '@types';
import type { createLogger } from '@utils/logger';

interface BackgroundTaskRegistrationDeps {
  taskManager: typeof TaskManager;
  taskName: string;
  logger: ReturnType<typeof createLogger>;
  handleLocationTask: (payload: { data?: LocationTaskData; error?: unknown }) => Promise<void>;
}

let isBackgroundTaskRegistered = false;

export const ensureBackgroundLocationTaskRegistered = (deps: BackgroundTaskRegistrationDeps): void => {
  if (isBackgroundTaskRegistered) {
    return;
  }

  const isTaskDefined = typeof deps.taskManager.isTaskDefined === 'function' ? deps.taskManager.isTaskDefined(deps.taskName) : false;
  if (isTaskDefined) {
    deps.logger.debug(`Background location task already defined (${deps.taskName}).`);
    isBackgroundTaskRegistered = true;
    return;
  }

  deps.logger.info(`Defining background location task (${deps.taskName}).`);
  deps.taskManager.defineTask(deps.taskName, async ({ data, error }: TaskManager.TaskManagerTaskBody<LocationTaskData>) => {
    await deps.handleLocationTask({ data, error });
  });
  isBackgroundTaskRegistered = true;
};
