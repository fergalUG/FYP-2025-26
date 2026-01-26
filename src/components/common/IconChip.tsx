import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { useTheme } from '@hooks';

interface IconChipProps {
  icon: ComponentProps<typeof MaterialIcons>['name'];
  text: string;
  style?: ViewStyle;
}

export const IconChip = (props: IconChipProps) => {
  const { icon, text, style } = props;
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={[styles.container, style]}>
      <MaterialIcons name={icon} size={14} color={theme.colors.onSurface} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 8,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.outline,
    },
    text: {
      fontSize: 12,
      color: theme.colors.onSurface,
    },
  });
