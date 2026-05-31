import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/stores/auth";
import { ApiError } from "@/lib/api";
import { Button, Field } from "@/components/ui";
import { colors, space } from "@/theme";

export default function LoginScreen() {
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError("Invalid email or password.");
      else if (err instanceof ApiError && err.status === 403) setError("This account is suspended.");
      else setError("Could not sign in. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.container}>
          <View style={styles.brand}>
            <Text style={styles.logo}>attendly</Text>
            <Text style={styles.subtitle}>Door check-in</Text>
          </View>

          <View style={styles.form}>
            <Field
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
            />
            <Field
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              onSubmitEditing={onSubmit}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label="Sign in" onPress={onSubmit} loading={busy} disabled={!email || !password} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: "center", paddingHorizontal: space.xl, gap: space.xxl },
  brand: { alignItems: "center", gap: space.xs },
  logo: { fontSize: 34, fontWeight: "800", color: colors.primary, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: colors.muted },
  form: { gap: space.md },
  error: { color: colors.danger, fontSize: 14 },
});
