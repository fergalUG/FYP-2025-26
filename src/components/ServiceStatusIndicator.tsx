import React from 'react';
import { View, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@hooks/useTheme';
import { getServiceStatusColor } from '@utils/service';
import type { PermissionState, ServiceState } from '@types';

interface ServiceStatusIndicatorProps {
  size?: number;
  serviceState: ServiceState;
  permissionState: PermissionState;
  containerStyle?: StyleProp<ViewStyle>;
}

export const ServiceStatusIndicator = (props: ServiceStatusIndicatorProps) => {
  const { size = 12, serviceState, permissionState, containerStyle } = props;
  const { theme } = useTheme();

  const getIndicatorColor = (): string => {
    if (permissionState !== 'granted') {
      return theme.colors.error;
    }

    return getServiceStatusColor(serviceState, theme);
  };

  const styles = createStyles(theme);

  const getIndicatorStyle = () => ({
    ...styles.indicator,
    width: size,
    height: size,
    backgroundColor: getIndicatorColor(),
  });

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={getIndicatorStyle()} />
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    indicator: {
      borderRadius: 50,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 1,
      elevation: 2,
    },
  });
