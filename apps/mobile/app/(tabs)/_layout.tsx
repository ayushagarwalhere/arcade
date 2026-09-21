import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Activity, Bug, LayoutDashboard, Settings, Waypoints } from "lucide-react-native";
import { useAssess } from "@/assess/AssessmentProvider";
import { isOpen } from "@/assess/status";
import { useStatusContext } from "@/assess/useStatus";
import { C, F } from "@/ui/theme";

export default function TabLayout() {
  const { findings } = useAssess();
  const ctx = useStatusContext();
  const insets = useSafeAreaInsets();
  // Findings of whatever is loaded that still need attention; no badge when nothing is loaded.
  const open = findings.filter((f) => isOpen(f, ctx)).length;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.chrome },
        headerShadowVisible: false,
        headerTitleAlign: "left",
        headerTitleStyle: { fontFamily: F.semibold, fontSize: 17, color: C.white },
        sceneStyle: { backgroundColor: C.editor },
        tabBarStyle: { height: 58 + insets.bottom, paddingTop: 5, backgroundColor: C.chrome, borderTopColor: C.line },
        tabBarActiveTintColor: C.white,
        tabBarInactiveTintColor: C.faint,
        tabBarLabelStyle: { fontFamily: F.medium, fontSize: 10.5, lineHeight: 15, height: 15 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Overview", tabBarIcon: ({ color }) => <LayoutDashboard size={21} color={color} /> }} />
      <Tabs.Screen
        name="findings"
        options={{
          title: "Findings",
          tabBarIcon: ({ color }) => <Bug size={21} color={color} />,
          tabBarBadge: open || undefined,
          tabBarBadgeStyle: { backgroundColor: C.red500, color: C.white, fontFamily: F.semibold, fontSize: 10 },
        }}
      />
      <Tabs.Screen name="surface" options={{ title: "Surface", headerTitle: "Attack surface", tabBarIcon: ({ color }) => <Waypoints size={21} color={color} /> }} />
      <Tabs.Screen name="activity" options={{ title: "Activity", tabBarIcon: ({ color }) => <Activity size={21} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: ({ color }) => <Settings size={21} color={color} /> }} />
    </Tabs>
  );
}
