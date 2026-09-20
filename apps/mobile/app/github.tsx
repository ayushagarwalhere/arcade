import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { Copy, ExternalLink, GitBranch } from "lucide-react-native";
import { GithubAuthError, NEW_TOKEN_URL, canDeviceSignIn, connectWithToken, signInWithDevice, type DeviceCode } from "@/github/github";
import { Button, Mono, SectionLabel, T } from "@/ui/atoms";
import { C, F, white } from "@/ui/theme";

export default function GithubConnect() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [device, setDevice] = useState<DeviceCode | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const submitToken = async () => {
    const value = token.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await connectWithToken(value);
      router.back();
    } catch (e) {
      setError(e instanceof GithubAuthError ? "GitHub rejected that token. Check that it was copied in full and hasn't expired." : "Couldn't reach GitHub. Check your connection and try again.");
      setBusy(false);
    }
  };

  const startDevice = async () => {
    abort.current?.abort();
    const controller = (abort.current = new AbortController());
    setDeviceBusy(true);
    setDevice(null);
    setError(null);
    try {
      await signInWithDevice(setDevice, controller.signal);
      router.back();
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Sign-in failed. Try again.");
      setDevice(null);
      setDeviceBusy(false);
    }
  };

  const copyCode = async () => {
    if (!device) return;
    await Clipboard.setStringAsync(device.userCode);
    setCopied(true);
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <T style={s.lede}>Once connected, your repositories open straight from the GitHub API — nothing is cloned. The token is only ever sent to api.github.com and is stored in this device's keychain.</T>

        {canDeviceSignIn() && (
          <View>
            <SectionLabel>Sign in with GitHub</SectionLabel>
            {device ? (
              <View style={s.device}>
                <T style={s.deviceHelp}>Enter this code on GitHub to finish signing in:</T>
                <Pressable accessibilityRole="button" accessibilityLabel={`Copy code ${device.userCode}`} onPress={copyCode} style={s.codeRow}>
                  <Mono style={s.code}>{device.userCode}</Mono>
                  <Copy size={16} color={C.muted} />
                </Pressable>
                <T style={s.deviceHint}>{copied ? "Copied." : "Tap the code to copy it."}</T>
                <Button kind="primary" icon={ExternalLink} label="Open GitHub" onPress={() => void WebBrowser.openBrowserAsync(device.verificationUri)} />
                <View style={s.waiting}>
                  <ActivityIndicator size="small" color={C.muted} />
                  <T style={s.deviceHint}>Waiting for you to approve on GitHub…</T>
                </View>
              </View>
            ) : (
              <Button kind="primary" icon={GitBranch} label={deviceBusy ? "Requesting a code…" : "Sign in with GitHub"} onPress={startDevice} disabled={deviceBusy} />
            )}
          </View>
        )}

        <View>
          <SectionLabel>Personal access token</SectionLabel>
          <TextInput
            accessibilityLabel="Personal access token"
            value={token}
            onChangeText={setToken}
            onSubmitEditing={submitToken}
            placeholder="ghp_… or github_pat_…"
            placeholderTextColor={C.faint}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            returnKeyType="go"
            style={s.input}
          />
          <Button kind={canDeviceSignIn() ? "secondary" : "primary"} label={busy ? "Connecting…" : "Connect"} onPress={submitToken} disabled={busy || !token.trim()} style={{ marginTop: 10 }} />
          <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(NEW_TOKEN_URL)} style={s.link}>
            <T style={s.linkText}>Create a token on GitHub (repo scope, pre-filled)</T>
            <ExternalLink size={13} color={C.fg} />
          </Pressable>
        </View>

        {error && (
          <T accessibilityRole="alert" style={s.error}>
            {error}
          </T>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.editor },
  content: { padding: 16, paddingBottom: 32, gap: 24 },
  lede: { fontSize: 14, lineHeight: 22, color: white(0.65) },
  input: { minHeight: 46, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, paddingHorizontal: 12, fontFamily: F.mono, fontSize: 13, color: C.white },
  link: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6 },
  linkText: { fontSize: 13, color: C.fg, textDecorationLine: "underline" },
  error: { borderRadius: 8, borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.3)", backgroundColor: "rgba(239, 68, 68, 0.08)", paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, lineHeight: 20, color: C.red200 },
  device: { gap: 10, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, padding: 14 },
  deviceHelp: { fontSize: 13.5, color: white(0.7) },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, borderRadius: 8, backgroundColor: C.raised, paddingVertical: 14 },
  code: { fontFamily: F.monoBold, fontSize: 24, letterSpacing: 3, color: C.white },
  deviceHint: { fontSize: 12.5, color: C.muted },
  waiting: { flexDirection: "row", alignItems: "center", gap: 8 },
});
