import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { COLORS } from '@/lib/constants';
import { RADIUS } from '@/lib/theme';

type Props = Omit<TextInputProps, 'style'> & {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string | null;
  hint?: string;
};

export function Field({ label, icon, error, hint, secureTextEntry, multiline, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
          focused && styles.inputWrapFocused,
          Boolean(error) && styles.inputWrapError,
          multiline && styles.inputWrapMultiline,
        ]}
      >
        {icon ? (
          <Ionicons name={icon} size={18} color={focused ? COLORS.primary : COLORS.textMuted} />
        ) : null}
        <TextInput
          {...rest}
          style={[styles.input, multiline && styles.inputMultiline]}
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry={secureTextEntry && !reveal}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setReveal((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={reveal ? 'eye-off-outline' : 'eye-outline'}
              size={19}
              color={COLORS.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 7 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginLeft: 2 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  inputWrapFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  inputWrapError: { borderColor: COLORS.danger },
  inputWrapMultiline: { alignItems: 'flex-start', paddingVertical: 12 },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    paddingVertical: 12,
  },
  inputMultiline: { minHeight: 84, textAlignVertical: 'top', paddingVertical: 0 },
  error: { fontSize: 12.5, color: COLORS.danger, marginLeft: 2 },
  hint: { fontSize: 12.5, color: COLORS.textMuted, marginLeft: 2 },
});

export default Field;
