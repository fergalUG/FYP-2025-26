import { GestureResponderEvent, Pressable, StyleSheet, Animated, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '@hooks/useTheme';
import { useRef, useMemo } from 'react';

interface AppButtonProps extends PressableProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
}

export const AppButton = ({ children, onPress, variant = 'primary', disabled = false, style, ...props }: AppButtonProps) => {
  const { theme } = useTheme();
  const animatedScale = useRef(new Animated.Value(1)).current;

  // this memo separates layout styles from inner styles so we dont have double margins/paddings with the animated view
  const { layoutStyle, innerStyle } = useMemo(() => {
    const flattened = StyleSheet.flatten(style) || {};
    const {
      margin,
      marginHorizontal,
      marginVertical,
      marginTop,
      marginBottom,
      marginLeft,
      marginRight,
      width,
      height,
      alignSelf,
      flex,
      position,
      top,
      left,
      right,
      bottom,
      ...rest
    } = flattened;

    return {
      layoutStyle: {
        margin,
        marginHorizontal,
        marginVertical,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        width,
        height,
        alignSelf,
        flex,
        position,
        top,
        left,
        right,
        bottom,
      },
      innerStyle: {
        ...rest,
        ...(width != null ? { width } : null),
        ...(height != null ? { height } : null),
        ...(flex != null ? { flex } : null),
        ...(alignSelf != null ? { alignSelf } : null),
      },
    };
  }, [style]);

  const handlePressIn = (event: GestureResponderEvent) => {
    if (!disabled) {
      Animated.spring(animatedScale, {
        toValue: 0.97,
        friction: 6,
        tension: 120,
        useNativeDriver: true,
      }).start();
    }
    props.onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    Animated.spring(animatedScale, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
    props.onPressOut?.(event);
  };

  return (
    <Animated.View style={[{ transform: [{ scale: animatedScale }] }, layoutStyle]}>
      <Pressable
        {...props}
        onPress={onPress}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: variant === 'primary' ? theme.colors.primary : theme.colors.surface,
            borderColor: theme.colors.outline,
            borderWidth: variant === 'secondary' ? 1 : 0,
          },
          innerStyle,
          { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
