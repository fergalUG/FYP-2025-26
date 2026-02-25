import { Alert } from 'react-native';

export const showSuccessAlert = (title: string, message: string, onPress?: () => void): void => {
  Alert.alert(title, message, onPress ? [{ text: 'OK', onPress }] : undefined);
};

export const showConfirmAlert = (title: string, message: string, onConfirm: () => void, onCancel?: () => void): void => {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: onCancel },
    { text: 'OK', onPress: onConfirm },
  ]);
};
