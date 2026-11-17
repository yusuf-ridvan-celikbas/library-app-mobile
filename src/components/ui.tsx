import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocalError } from '@/db';
import { useTheme } from '@/theme/SettingsProvider';
import { fonts, radius, space, text } from '@/theme/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function haptic() {
  if (Platform.OS !== 'web') void Haptics.selectionAsync();
}

// ------------------------------------------------------------------ Metin

type TxtProps = TextProps & {
  size?: keyof typeof text;
  muted?: boolean;
  faint?: boolean;
  serif?: boolean;
  weight?: '400' | '500' | '600' | '700';
  color?: string;
  center?: boolean;
};

export function Txt({ size = 'body', muted, faint, serif, weight = '400', color, center, style, ...rest }: TxtProps) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        {
          fontSize: text[size],
          lineHeight: Math.round(text[size] * 1.4),
          color: color ?? (faint ? colors.textFaint : muted ? colors.textMuted : colors.text),
          fontFamily: serif ? fonts.serif : fonts.sans,
          fontWeight: weight,
          textAlign: center ? 'center' : undefined,
        },
        style,
      ]}
    />
  );
}

// ------------------------------------------------------------------ Ekran

/** Güvenli alanı ve sakin arka planı yöneten temel ekran kabı. */
export function Screen({
  children,
  scroll = true,
  title,
  subtitle,
  right,
  refreshControl,
  padded = true,
  edgeTop = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  refreshControl?: ComponentProps<typeof ScrollView>['refreshControl'];
  padded?: boolean;
  edgeTop?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Txt size="title" serif weight="600">
          {title}
        </Txt>
        {subtitle ? <Txt muted>{subtitle}</Txt> : null}
      </View>
      {right}
    </View>
  ) : null;

  const content = (
    <>
      {header}
      {children}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: edgeTop ? insets.top : 0 }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ padding: padded ? space.lg : 0, paddingBottom: 120 }}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, padding: padded ? space.lg : 0 }}>{content}</View>
      )}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Txt size="heading" serif weight="600" style={{ flex: 1 }}>
        {children}
      </Txt>
      {action}
    </View>
  );
}

// ------------------------------------------------------------------ Kart

export function Card({
  children,
  style,
  onPress,
  tone,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  tone?: 'muted' | 'accent';
}) {
  const { colors } = useTheme();
  const bg = tone === 'muted' ? colors.surfaceMuted : tone === 'accent' ? colors.accentSoft : colors.surface;
  const cardStyle = [styles.card, { backgroundColor: bg, borderColor: colors.border }, style];
  if (!onPress) return <View style={cardStyle}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [cardStyle, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}>
      {children}
    </Pressable>
  );
}

// ------------------------------------------------------------------ Buton

type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, icon, variant = 'primary', loading, small, disabled, style, onPress, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const palette = {
    primary: { bg: colors.accent, fg: colors.onAccent },
    secondary: { bg: colors.accentSoft, fg: colors.accent },
    ghost: { bg: 'transparent', fg: colors.textMuted },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  }[variant];
  return (
    <Pressable
      {...rest}
      disabled={disabled || loading}
      onPress={(e) => {
        haptic();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: palette.bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={palette.fg} /> : null}
          <Txt size={small ? 'small' : 'body'} weight="600" color={palette.fg}>
            {label}
          </Txt>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label }: { icon: IconName; onPress: () => void; label: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

// ------------------------------------------------------------------ Form

export function Field({ label, error, ...props }: TextInputProps & { label?: string; error?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? (
        <Txt size="small" muted weight="500" style={{ marginBottom: space.xs }}>
          {label}
        </Txt>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...props}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
            color: colors.text,
            minHeight: props.multiline ? 96 : 50,
            textAlignVertical: props.multiline ? 'top' : 'center',
          },
          props.style,
        ]}
      />
      {error ? (
        <Txt size="tiny" color={colors.danger} style={{ marginTop: space.xs }}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

/** Bir değer seçmek için dokunulan, Field ile aynı görünümde kutu. */
export function SelectBox({
  label,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: space.md }}>
      <Txt size="small" muted weight="500" style={{ marginBottom: space.xs }}>
        {label}
      </Txt>
      <Pressable
        onPress={onPress}
        style={[styles.input, styles.selectBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Txt numberOfLines={1} faint={!value} style={{ flex: 1 }}>
          {value || placeholder}
        </Txt>
        <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: colors.surfaceMuted }]}>
      <Ionicons name="search" size={18} color={colors.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={{ flex: 1, fontSize: text.body, color: colors.text, paddingVertical: 10 }}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ Çip

export function Chip({
  label,
  active,
  onPress,
  icon,
  color,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic();
        onPress?.();
      }}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.accent : colors.surface,
          borderColor: active ? colors.accent : colors.border,
        },
      ]}
    >
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      {icon ? <Ionicons name={icon} size={14} color={active ? colors.onAccent : colors.textMuted} /> : null}
      <Txt size="small" weight="500" color={active ? colors.onAccent : colors.text}>
        {label}
      </Txt>
    </Pressable>
  );
}

// ------------------------------------------------------------- Durumlar

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export function errorMessage(err: unknown, t: (k: string) => string): string {
  if (err instanceof LocalError) {
    if (err.code === 'NETWORK_ERROR') return t('common.networkError');
    return err.message;
  }
  return t('common.genericError');
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState icon="cloud-offline-outline" message={errorMessage(error, t)}>
      {onRetry ? <Button label={t('common.retry')} variant="secondary" small onPress={onRetry} /> : null}
    </EmptyState>
  );
}

export function EmptyState({ icon, message, children }: { icon: IconName; message: string; children?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { paddingVertical: space.xxl, gap: space.md }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceMuted }]}>
        <Ionicons name={icon} size={28} color={colors.textFaint} />
      </View>
      <Txt muted center style={{ maxWidth: 280 }}>
        {message}
      </Txt>
      {children}
    </View>
  );
}

// ----------------------------------------------------------- Alt sayfa

/** Ekranın altından açılan, sakin bir "sheet" (Modal tabanlı, ek bağımlılık yok). */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  scroll = true,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, paddingBottom: insets.bottom + space.lg, borderColor: colors.border },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        {title ? (
          <View style={styles.sheetHeader}>
            <Txt size="heading" serif weight="600" style={{ flex: 1 }}>
              {title}
            </Txt>
            <IconButton icon="close" label="close" onPress={onClose} />
          </View>
        ) : null}
        {scroll ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.lg }}>
            {children}
          </ScrollView>
        ) : (
          children
        )}
      </View>
    </Modal>
  );
}

/** Ayarlar / Daha fazla ekranlarındaki satırlar. */
export function ListRow({
  icon,
  label,
  detail,
  onPress,
  right,
  danger,
}: {
  icon?: IconName;
  label: string;
  detail?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: danger ? colors.dangerSoft : colors.accentSoft }]}>
          <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt weight="500" color={danger ? colors.danger : undefined}>
          {label}
        </Txt>
        {detail ? (
          <Txt size="small" muted numberOfLines={2}>
            {detail}
          </Txt>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null)}
    </Pressable>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space.xs }} />;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg, marginTop: space.sm },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', marginTop: space.xl, marginBottom: space.md },
  card: { borderRadius: radius.md, padding: space.lg, borderWidth: StyleSheet.hairlineWidth },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonSmall: { minHeight: 38, paddingHorizontal: space.lg, borderRadius: radius.sm },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space.md, fontSize: text.body, paddingVertical: 12 },
  selectBox: { flexDirection: 'row', alignItems: 'center', minHeight: 50 },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginVertical: space.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
