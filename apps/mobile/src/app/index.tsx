import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/stores/auth";
import { colors } from "@/theme";

/** Entry point — bounce to the app or the login screen once auth resolves. */
export default function Index() {
  const status = useAuth((s) => s.status);

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return <Redirect href={status === "authed" ? "/sessions" : "/login"} />;
}
