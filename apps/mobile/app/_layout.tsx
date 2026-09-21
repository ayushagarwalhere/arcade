import { useEffect } from "react";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono/400Regular";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold";
import { AssessmentProvider } from "@/assess/AssessmentProvider";
import { RunProvider } from "@/run/RunProvider";
import { C, F } from "@/ui/theme";

SplashScreen.preventAutoHideAsync();

/** A deep link (arcade://repo/owner/name) lands on a screen with the tabs underneath, so Back has somewhere to go. */
export const unstable_settings = { anchor: "(tabs)" };

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.editor, card: C.chrome, border: C.line, text: C.white, primary: C.fg },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, JetBrainsMono_400Regular, JetBrainsMono_700Bold });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <ThemeProvider value={theme}>
      <RunProvider>
        <AssessmentProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: C.chrome },
              headerTintColor: C.fg,
              headerTitleStyle: { fontFamily: F.semibold, fontSize: 16, color: C.white },
              headerShadowVisible: false,
              headerBackButtonDisplayMode: "minimal",
              contentStyle: { backgroundColor: C.editor },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="finding/[id]" options={{ title: "Finding" }} />
            <Stack.Screen name="approval" options={{ title: "Approval", presentation: "modal" }} />
            <Stack.Screen name="github" options={{ title: "Connect GitHub", presentation: "modal" }} />
            <Stack.Screen name="repos" options={{ title: "Repositories" }} />
            <Stack.Screen name="repo" options={{ title: "Repository" }} />
            <Stack.Screen name="file" options={{ title: "File" }} />
            <Stack.Screen name="assess" options={{ title: "Assess repository" }} />
          </Stack>
        </AssessmentProvider>
      </RunProvider>
    </ThemeProvider>
  );
}
