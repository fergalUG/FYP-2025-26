import React from 'react';
import { StyleSheet, TouchableOpacity, Text, View } from 'react-native';
import colours from './colours';

type ButtonProps = {
  text: string;
  onPress: () => void;
  bottom?: number;
  right?: number;
};

export default function HoverButton(props: ButtonProps) {
  return (
    <View
      style={[styles.container, { bottom: props.bottom ?? 30, right: props.right ?? 30 }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={styles.button}
        activeOpacity={0.8}
        onPress={props.onPress}
      >
        <Text style={styles.text}>{props.text}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    zIndex: 100,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colours.AccentColor,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  text: {
    color: colours.AltText,
    fontSize: 18,
    fontWeight: '800',
  },
});
