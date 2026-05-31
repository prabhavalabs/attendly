import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useTodaySessions, type SessionListItem } from "@/queries/sessions";
import { useAuth } from "@/stores/auth";
import { useOnline } from "@/lib/net";
import { pendingCount } from "@/lib/outbox";
import { Button, Card, Pill } from "@/components/ui";
import { colors, radius, space } from "@/theme";

function statusTone(s: string): "muted" | "success" | "warning" | "danger" {
  if (s === "open") return "success";
  if (s === "cancelled") return "danger";
  if (s === "closed") return "muted";
  return "warning";
}

function SessionItem({ item, onPress }: { item: SessionListItem; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
      <Card style={styles.item}>
        <View style={styles.itemTop}>
          <Text style={styles.className}>{item.class_name}</Text>
          <Pill text={item.status} tone={statusTone(item.status)} />
        </View>
        <Text style={styles.time}>
          {item.start_time}–{item.end_time}
          {item.topic ? ` · ${item.topic}` : ""}
        </Text>
        <Text style={styles.counts}>
          {item.present_count}/{item.enrolled_count} present
        </Text>
      </Card>
    </Pressable>
  );
}

export default function SessionsScreen() {
  const router = useRouter();
  const online = useOnline();
  const logout = useAuth((s) => s.logout);
  const user = useAuth((s) => s.user);
  const { data, isLoading, refetch, isRefetching } = useTodaySessions();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void pendingCount().then(setPending);
  }, [data]);

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safe}>
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.warning }]} />
          <Text style={styles.statusText}>{online ? "Online" : "Offline"}</Text>
          {pending > 0 ? <Pill text={`${pending} queued`} tone="warning" /> : null}
        </View>
        <Pressable onPress={() => logout()}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <FlatList
        data={data ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.primary} />}
        renderItem={({ item }) => <SessionItem item={item} onPress={() => router.push(`/session/${item.id}`)} />}
        ListHeaderComponent={
          user ? <Text style={styles.greeting}>Hi, {user.name.split(" ")[0]}</Text> : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No sessions today</Text>
              <Text style={styles.emptyText}>Sessions scheduled for today will appear here.</Text>
              <View style={{ height: space.lg }} />
              <Button label="Refresh" variant="outline" onPress={() => refetch()} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  signOut: { fontSize: 14, color: colors.primary, fontWeight: "600" },
  list: { padding: space.lg, gap: space.md },
  greeting: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: space.sm },
  item: { gap: 6 },
  itemTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  className: { fontSize: 17, fontWeight: "700", color: colors.text },
  time: { fontSize: 14, color: colors.muted },
  counts: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  empty: { alignItems: "center", paddingTop: space.xxl * 2, paddingHorizontal: space.xl, borderRadius: radius.lg },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: "center", marginTop: space.xs },
});
