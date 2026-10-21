/**
 * Accessible dropdown select. The trigger looks like a text field; tapping it
 * opens a bottom sheet with the full option list so it stays usable on small
 * screens and long labels, and behaves predictably on web too.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Sheet } from '@/components/ui/Sheet';
import { COLORS } from '@/lib/constants';
import { RADIUS } from '@/lib/theme';

export type SelectOption = {
  value: string;
  label: string;
  /** Leading emoji shown in a tinted tile. */
  emoji?: string;
  /** Category colour used to tint the emoji tile and the selected check. */
  color?: string;
  description?: string;
};

type Props = {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  loading?: boolean;
  sheetTitle?: string;
};

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Choose an option',
  label,
  hint,
  error,
  disabled,
  loading,
  sheetTitle,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;
  const interactive = !disabled && !loading && options.length > 0;

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable
        onPress={() => {
          if (!interactive) return;
          Keyboard.dismiss();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Selection'}: ${selected?.label ?? placeholder}`}
        accessibilityHint="Opens the list of options"
        accessibilityState={{ expanded: open, disabled: !interactive }}
        style={({ pressed }) => [
          styles.trigger,
          open && styles.triggerActive,
          Boolean(error) && styles.triggerError,
          !interactive && styles.triggerDisabled,
          pressed && interactive && { opacity: 0.85 },
        ]}
      >
        {selected?.emoji ? (
          <View
            style={[
              styles.emojiTile,
              { backgroundColor: `${selected.color ?? COLORS.primary}1A` },
            ]}
          >
            <Text style={styles.emoji}>{selected.emoji}</Text>
          </View>
        ) : (
          <Ionicons
            name="ellipsis-horizontal"
            size={17}
            color={selected ? COLORS.text : COLORS.textMuted}
          />
        )}

        <Text
          style={[styles.value, !selected && styles.placeholder]}
          numberOfLines={1}
        >
          {selected?.label ?? (loading ? 'Loading options…' : placeholder)}
        </Text>

        <Ionicons name="chevron-down" size={18} color={COLORS.textMuted} />
      </Pressable>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={sheetTitle ?? label ?? 'Choose an option'}
        subtitle="Tap an option to select it."
        maxWidth={560}
      >
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <Pressable
                key={option.value}
                onPress={() => choose(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                style={({ pressed }) => [
                  styles.option,
                  active && styles.optionActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                {option.emoji ? (
                  <View
                    style={[
                      styles.optionEmojiTile,
                      { backgroundColor: `${option.color ?? COLORS.primary}18` },
                    ]}
                  >
                    <Text style={styles.optionEmoji}>{option.emoji}</Text>
                  </View>
                ) : null}

                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                    {option.label}
                  </Text>
                  {option.description ? (
                    <Text style={styles.optionDescription}>{option.description}</Text>
                  ) : null}
                </View>

                <View
                  style={[
                    styles.radio,
                    active && {
                      backgroundColor: option.color ?? COLORS.primary,
                      borderColor: option.color ?? COLORS.primary,
                    },
                  ]}
                >
                  {active ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 7 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginLeft: 2 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 13,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  triggerActive: { borderColor: COLORS.primary },
  triggerError: { borderColor: COLORS.danger },
  triggerDisabled: { opacity: 0.6 },
  emojiTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 17 },
  value: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
  placeholder: { color: COLORS.textMuted, fontWeight: '500' },
  hint: { fontSize: 12.5, color: COLORS.textMuted, marginLeft: 2 },
  error: { fontSize: 12.5, color: COLORS.danger, marginLeft: 2 },
  list: { maxHeight: 380 },
  listContent: { gap: 7, paddingBottom: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  optionActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  optionEmojiTile: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionEmoji: { fontSize: 19 },
  optionLabel: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  optionLabelActive: { color: COLORS.text },
  optionDescription: { fontSize: 12, color: COLORS.textMuted },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Select;
