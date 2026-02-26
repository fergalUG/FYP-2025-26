import type { ServiceState, PermissionState } from '@types';
import type { Theme } from '@theme';

export const getServiceStatusText = (serviceState: ServiceState): string => {
  switch (serviceState) {
    case 'stopped':
      return 'Stopped';
    case 'passive':
      return 'Passive';
    case 'active':
      return 'Active';
    default:
      return 'Unknown';
  }
};

export const getServiceStatusColor = (serviceState: ServiceState, theme: Theme): string => {
  switch (serviceState) {
    case 'stopped':
      return theme.colors.status.stopped;
    case 'passive':
      return theme.colors.status.passive;
    case 'active':
      return theme.colors.status.active;
  }
};

export const getPermissionStatusText = (permissionState: PermissionState): string => {
  switch (permissionState) {
    case 'granted':
      return 'Granted';
    case 'denied':
      return 'Denied';
    default:
      return 'Unknown';
  }
};

export const getLoadingText = (isLoading: boolean, defaultText: string, loadingText: string): string => {
  return isLoading ? loadingText : defaultText;
};
