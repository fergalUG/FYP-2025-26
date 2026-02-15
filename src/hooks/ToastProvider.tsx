import React, { createContext, useCallback, useMemo, useRef, useState, useContext } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Toast, type ToastVariant } from '@components/common/Toast';
import { useTheme } from '@hooks/useTheme';

interface ToastOptions {
  title: string;
  message?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
  hideToast: () => void;
}

const DEFAULT_DURATION_MS = 3200;
const ANIMATION_DURATION_MS = 260;

const ToastContext = createContext<ToastContextValue>({
  showToast: () => undefined,
  hideToast: () => undefined,
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme);

  const [currentToast, setCurrentToast] = useState<ToastOptions | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const queueRef = useRef<ToastOptions[]>([]);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const clearHideTimeout = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: ANIMATION_DURATION_MS,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: ANIMATION_DURATION_MS,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  const animateOut = useCallback(
    (onComplete?: () => void) => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -120,
          duration: ANIMATION_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: ANIMATION_DURATION_MS,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onComplete?.();
      });
    },
    [opacity, translateY]
  );

  const showNextToast = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      setCurrentToast(null);
      setIsVisible(false);
      return;
    }

    setCurrentToast(next);
    setIsVisible(true);
    animateIn();

    const duration = next.durationMs ?? DEFAULT_DURATION_MS;
    hideTimeoutRef.current = setTimeout(() => {
      animateOut(() => {
        showNextToast();
      });
    }, duration);
  }, [animateIn, animateOut]);

  const showToast = useCallback(
    (options: ToastOptions) => {
      if (isVisible) {
        queueRef.current.push(options);
        return;
      }

      clearHideTimeout();
      queueRef.current.push(options);
      showNextToast();
    },
    [isVisible, showNextToast]
  );

  const hideToast = useCallback(() => {
    clearHideTimeout();
    animateOut(() => {
      showNextToast();
    });
  }, [animateOut, showNextToast]);

  const contextValue = useMemo(
    () => ({
      showToast,
      hideToast,
    }),
    [showToast, hideToast]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {currentToast && (
        <View style={styles.overlay} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.toastWrapper,
              {
                transform: [{ translateY }],
                opacity,
                marginTop: insets.top + theme.spacing.sm,
              },
            ]}
          >
            <Pressable onPress={hideToast}>
              <Toast title={currentToast.title} message={currentToast.message} variant={currentToast.variant} />
            </Pressable>
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9998,
      pointerEvents: 'box-none',
    },
    toastWrapper: {
      paddingHorizontal: theme.spacing.lg,
    },
  });
