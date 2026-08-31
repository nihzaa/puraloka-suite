import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type ViewStyle,
} from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

const C = {
  navy: '#003366',
  blue: '#0066CC',
  danger: '#B91C1C',
  border: '#E5E7EB',
  textSecondary: '#6B7280',
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: ButtonProps) {
  const bg =
    variant === 'primary' ? C.navy
    : variant === 'secondary' ? '#fff'
    : variant === 'danger' ? C.danger
    : 'transparent';

  const textColor =
    variant === 'primary' ? '#fff'
    : variant === 'secondary' ? C.navy
    : variant === 'danger' ? '#fff'
    : C.textSecondary;

  const borderColor = variant === 'secondary' ? C.border : 'transparent';

  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: bg, borderColor }, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text style={[styles.text, { color: textColor }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    minHeight: 46,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
  },
});
