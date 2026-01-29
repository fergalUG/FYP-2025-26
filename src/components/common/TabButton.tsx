import { Pressable, Animated, StyleSheet } from 'react-native';
import { useRef } from 'react';
import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';

export const TabButton = (props: BottomTabBarButtonProps) => {
  const { children, onPress, onLongPress, style } = props;
  const animatedScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(animatedScale, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(animatedScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 4,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, styles.container]}
    >
      <Animated.View style={{ transform: [{ scale: animatedScale }], alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
