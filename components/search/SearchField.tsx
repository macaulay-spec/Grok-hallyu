import { Ionicons } from '@expo/vector-icons';
import React, { forwardRef } from 'react';
import { Pressable, StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors, fonts, radius, space } from '../../constants/theme';

interface SearchFieldProps extends TextInputProps {
  style?: StyleProp<ViewStyle>;
  onClear?: () => void;
  /** render as a non-editable button (Explore → Search) */
  asButton?: boolean;
  onPressButton?: () => void;
}

export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField({ style, onClear, asButton, onPressButton, value, ...rest }, ref) {
  if (asButton) {
    return (
      <Pressable onPress={onPressButton} accessibilityRole="search" accessibilityLabel={rest.placeholder ?? 'Search'} style={[styles.box, style]}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <View style={{ flex: 1 }}>
          <TextInputLike text={rest.placeholder ?? 'Search'} />
        </View>
      </Pressable>
    );
  }
  return (
    <View style={[styles.box, style]}>
      <Ionicons name="search" size={18} color={colors.textTertiary} />
      <TextInput ref={ref} {...rest} value={value} placeholderTextColor={colors.textTertiary} selectionColor={colors.accent} cursorColor={colors.accent} keyboardAppearance="dark" returnKeyType={rest.returnKeyType ?? 'search'} autoCorrect={false} style={styles.input} accessibilityRole="search" />
      {value ? (
        <Pressable onPress={onClear ?? (() => rest.onChangeText?.(''))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
});

function TextInputLike({ text }: { text: string }) {
  return <TextInput editable={false} pointerEvents="none" value={text} style={[styles.input, { color: colors.textTertiary }]} />;
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: space.x2, height: 44, borderRadius: radius.md, backgroundColor: colors.surface1, paddingHorizontal: space.x3, borderWidth: 1, borderColor: colors.borderSubtle },
  input: { flex: 1, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 15, paddingVertical: 0 },
});
