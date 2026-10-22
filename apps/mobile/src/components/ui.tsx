// Small RTL-first UI kit. Expo Go ignores the native forcesRTL setting, so the root
// view sets `direction: "rtl"` and text is right-aligned explicitly. In real builds
// (where I18nManager.isRTL is true) RN mirrors left/right, hence the swap below.
import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  I18nManager,
  Pressable,
  ScrollView,
  Text as RNText,
  TextInput,
  useColorScheme,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const RIGHT = I18nManager.isRTL ? "left" : "right";

const palette = {
  light: { bg: "#f6f7f9", surface: "#ffffff", text: "#16181d", muted: "#5f6672", border: "#e2e5ea", primary: "#0f6e5c", onPrimary: "#ffffff", danger: "#b42318" },
  dark: { bg: "#0f1114", surface: "#181b20", text: "#eceef1", muted: "#9aa1ad", border: "#2a2f37", primary: "#2fb391", onPrimary: "#0b0d10", danger: "#f97066" },
};

export function useColors() {
  return palette[useColorScheme() === "dark" ? "dark" : "light"];
}

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const c = useColors();
  const body = <View style={{ gap: 16, padding: 16 }}>{children}</View>;
  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: c.bg, direction: "rtl" }}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export function Text({ style, muted, bold, size = 15, ...props }: TextProps & { muted?: boolean; bold?: boolean; size?: number }) {
  const c = useColors();
  return (
    <RNText
      style={[
        { color: muted ? c.muted : c.text, fontSize: size, fontWeight: bold ? "700" : "400", textAlign: RIGHT, writingDirection: "rtl" },
        style,
      ]}
      {...props}
    />
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 16, gap: 8 }, style]}>
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  disabled,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const c = useColors();
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        height: 46,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        backgroundColor: primary ? c.primary : "transparent",
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <RNText style={{ color: primary ? c.onPrimary : c.primary, fontSize: 15, fontWeight: "600" }}>{title}</RNText>
    </Pressable>
  );
}

export function Input({ label, ltr, style, ...props }: TextInputProps & { label: string; ltr?: boolean }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text bold size={14}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        style={[
          {
            height: 46,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 10,
            paddingHorizontal: 12,
            backgroundColor: c.surface,
            color: c.text,
            fontSize: 16,
            textAlign: ltr ? (I18nManager.isRTL ? "right" : "left") : RIGHT,
            writingDirection: ltr ? "ltr" : "rtl",
          },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

export function ErrorText({ children }: PropsWithChildren) {
  const c = useColors();
  if (!children) return null;
  return <Text style={{ color: c.danger }} accessibilityRole="alert">{children}</Text>;
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: c.bg }}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

/** Horizontal row that follows RTL order. */
export function Row({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }, style]}>{children}</View>;
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? c.primary : c.border,
        backgroundColor: selected ? c.primary : "transparent",
      }}
    >
      <Text size={13} style={{ color: selected ? c.onPrimary : c.text }}>{label}</Text>
    </Pressable>
  );
}

/** Small text button for row actions (edit / delete). */
export function LinkButton({ title, onPress, danger, disabled }: { title: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={{ opacity: disabled ? 0.5 : 1, paddingVertical: 4 }}>
      <RNText style={{ color: danger ? c.danger : c.primary, fontSize: 14, fontWeight: "600" }}>{title}</RNText>
    </Pressable>
  );
}

export function SupportBanner({ show }: { show: boolean }) {
  const c = useColors();
  if (!show) return null;
  return (
    <View style={{ borderRadius: 10, borderWidth: 1, borderColor: c.primary, padding: 12 }}>
      <Text size={13} style={{ color: c.primary }}>أنت تتصفح هذه الجمعية بصلاحية دعم فني مؤقتة، وكل صفحة تفتحها تُسجَّل في سجل الجمعية.</Text>
    </View>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "ليست لديك صلاحية لهذا الإجراء",
  invalid_input: "يرجى التحقق من البيانات المدخلة",
  already_president: "هذا الشخص هو رئيس الجمعية",
  file_too_large: "حجم الملف يتجاوز 50 ميجابايت",
};

export function errorText(error: unknown): string {
  if (!error) return "";
  const message = error instanceof Error ? error.message : String(error);
  if (ERROR_MESSAGES[message]) return ERROR_MESSAGES[message];
  if (/row-level security|permission denied|42501/i.test(message)) return ERROR_MESSAGES.forbidden;
  if (/inside itself/.test(message)) return "لا يمكن نقل المجلد إلى داخل نفسه";
  return message;
}
