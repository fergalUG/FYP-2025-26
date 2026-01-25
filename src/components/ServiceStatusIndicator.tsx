import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useBackgroundService } from '@hooks';
import { getServiceStatusColor } from '@utils/service';
import { theme } from '@theme';

interface ServiceStatusIndicatorProps {
  size?: number;
}

export const ServiceStatusIndicator = (props: ServiceStatusIndicatorProps) => {
  const { size = 12 } = props;
  const { serviceState, permissionState } = useBackgroundService();

  const getIndicatorColor = (): string => {
    if (permissionState !== 'granted') {
      return theme.colors.error;
    }

    return getServiceStatusColor(serviceState);
  };

  const getIndicatorStyle = () => ({
    ...styles.indicator,
    width: size,
    height: size,
    backgroundColor: getIndicatorColor(),
  });

  return (
    <View style={styles.container}>
      <View style={getIndicatorStyle()} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
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
