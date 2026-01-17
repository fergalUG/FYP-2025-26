import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  View,
  Dimensions,
} from 'react-native';
import colours from './colours';

type ButtonProps = {
  text: string;
  onPress: () => void;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

export default function HoverButton(props: ButtonProps) {
  const stylesObj: any = {
    position: 'absolute',
    elevation: 8,
    zIndex: 100,
  };

  if (props.top !== undefined) stylesObj.top = props.top;
  if (props.bottom !== undefined) stylesObj.bottom = props.bottom;
  if (props.left !== undefined) stylesObj.left = props.left;
  if (props.right !== undefined) stylesObj.right = props.right;

  //defaults
  if (props.top === undefined && props.bottom === undefined) stylesObj.bottom = 30;
  if (props.left === undefined && props.right === undefined) stylesObj.right = 30;
  
  return (
    <View style={[styles.container, stylesObj]} pointerEvents="box-none">
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colours.AccentColor,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colours.ShadowColor,
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
