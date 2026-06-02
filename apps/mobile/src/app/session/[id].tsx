import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";

import { useRoster } from "@/queries/sessions";
import { useCheckin } from "@/queries/checkin";
import { QrScanner } from "@/components/qr-scanner";
import { Button, Card, Field, Pill } from "@/components/ui";
import { getNfcCapability, readCardToken, cancelNfc, type NfcCapability } from "@/lib/nfc";
import type { OutboxRow, RosterRow } from "@/lib/db";
import type { AttendanceStatus } from "@tuition/shared";
import { colors, radius, space } from "@/theme";

type Mode = "scan" | "manual" | "nfc";

function logTone(row: OutboxRow): { tone: "muted" | "success" | "warning" | "danger"; label: string } {
  if (row.error) return { tone: "danger", label: row.error.replace(/_/g, " ") };
  if (row.synced === 0) return { tone: "warning", label: "queued" };
  if (row.duplicate === 1) return { tone: "muted", label: "already in" };
  return { tone: "success", label: row.status };
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function CheckinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = String(id);
  const roster = useRoster(sessionId);
  const { log, pending, syncing, online, checkIn, sync } = useCheckin(sessionId);

  const [mode, setMode] = useState<Mode>("scan");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [nfc, setNfc] = useState<NfcCapability>({ supported: false });
  const [nfcBusy, setNfcBusy] = useState(false);

  useEffect(() => {
    void getNfcCapability().then(setNfc);
    return () => {
      void cancelNfc();
    };
  }, []);

  useEffect(() => {
    if (mode !== "nfc") void cancelNfc();
  }, [mode]);

  const readNfc = useCallback(async () => {
    setNfcBusy(true);
    try {
      const token = await readCardToken();
      if (token) await checkIn({ method: "nfc", cardToken: token, status });
    } finally {
      setNfcBusy(false);
    }
  }, [checkIn, status]);

  const modes: Mode[] = nfc.supported ? ["scan", "manual", "nfc"] : ["scan", "manual"];
  const modeLabel: Record<Mode, string> = { scan: "Scan QR", manual: "Manual", nfc: "NFC" };

  const filtered = useMemo(() => {
    const rows = roster.data?.roster ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.full_name.toLowerCase().includes(q) || r.reg_no.toLowerCase().includes(q));
  }, [roster.data, query]);

  const last = log[0];

  const header = (
    <View style={{ gap: space.md }}>
      <View style={styles.statusRow}>
        <View style={styles.statusLeft}>
          <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.warning }]} />
          <Text style={styles.statusText}>{online ? "Online" : "Offline"}</Text>
          {pending > 0 ? <Pill text={`${pending} queued`} tone="warning" /> : null}
        </View>
        <Pressable onPress={() => sync()} disabled={syncing || pending === 0}>
          <Text style={[styles.sync, { opacity: syncing || pending === 0 ? 0.4 : 1 }]}>
            {syncing ? "Syncing…" : "Sync now"}
          </Text>
        </Pressable>
      </View>

      {roster.data?.session ? (
        <View>
          <Text style={styles.title}>{roster.data.session.class_name}</Text>
          <Text style={styles.subtitle}>
            {roster.data.session.start_time}–{roster.data.session.end_time}
            {roster.data.offline ? " · cached" : ""}
          </Text>
        </View>
      ) : null}

      <View style={styles.toggle}>
        {modes.map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.toggleBtn, mode === m && styles.toggleActive]}>
            <Text style={[styles.toggleText, mode === m && styles.toggleTextActive]}>{modeLabel[m]}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.statusToggle}>
        {(["present", "late"] as AttendanceStatus[]).map((s) => (
          <Pressable key={s} onPress={() => setStatus(s)} style={[styles.chip, status === s && styles.chipActive]}>
            <Text style={[styles.chipText, status === s && styles.chipTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      {mode === "scan" ? (
        <QrScanner onScan={(token) => checkIn({ method: "qr", cardToken: token, status })} />
      ) : mode === "nfc" ? (
        <Card style={styles.nfcPanel}>
          <Text style={styles.nfcTitle}>Tap a student card</Text>
          <Text style={styles.nfcHint}>Hold the card to the device, then read it.</Text>
          <View style={{ height: space.md }} />
          <View style={{ alignSelf: "stretch" }}>
            <Button label={nfcBusy ? "Hold card to reader…" : "Read card"} onPress={readNfc} loading={nfcBusy} />
          </View>
        </Card>
      ) : (
        <Field placeholder="Search name or reg no…" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} />
      )}

      {last ? (
        <View style={[styles.banner, { backgroundColor: bannerBg(last) }]}>
          <Text style={styles.bannerName}>{last.resolved_name ?? last.card_token ?? last.reg_no ?? "Check-in"}</Text>
          <Pill {...logTone(last)} text={logTone(last).label} />
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>{mode === "scan" ? "Recent check-ins" : `${filtered.length} students`}</Text>
    </View>
  );

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safe}>
      {/* Chrome (incl. the camera) lives OUTSIDE the FlatList — a CameraView
          inside a virtualized list renders black on Android. */}
      <View style={styles.chrome}>{header}</View>
      {mode === "manual" ? (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.student_id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listBody}
          renderItem={({ item }) => <RosterItem row={item} onPress={() => checkIn({ method: "search", studentId: item.student_id, status })} />}
        />
      ) : (
        <FlatList
          data={log}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.listBody}
          renderItem={({ item }) => <LogItem row={item} />}
          ListEmptyComponent={<Text style={styles.empty}>Point the camera at a student card to check them in.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

function bannerBg(row: OutboxRow): string {
  if (row.error) return colors.dangerBg;
  if (row.synced === 0) return colors.warningBg;
  if (row.duplicate === 1) return colors.border;
  return colors.successBg;
}

function RosterItem({ row, onPress }: { row: RosterRow; onPress: () => void }) {
  const marked = row.att_status === "present" || row.att_status === "late";
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>{row.full_name}</Text>
        <Text style={styles.rowMeta}>{row.reg_no}</Text>
      </View>
      {marked ? <Pill text={row.att_status ?? "present"} tone="success" /> : <Text style={styles.tapHint}>Tap to mark</Text>}
    </Pressable>
  );
}

function LogItem({ row }: { row: OutboxRow }) {
  const t = logTone(row);
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>{row.resolved_name ?? row.card_token ?? row.reg_no ?? "—"}</Text>
        <Text style={styles.rowMeta}>
          {row.method} · {timeOf(row.created_at)}
        </Text>
      </View>
      <Pill text={t.label} tone={t.tone} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  chrome: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm },
  listBody: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg, gap: space.sm },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  sync: { fontSize: 14, color: colors.primary, fontWeight: "700" },
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 2 },
  toggle: { flexDirection: "row", backgroundColor: colors.border, borderRadius: radius.md, padding: 3 },
  toggleBtn: { flex: 1, paddingVertical: space.sm, alignItems: "center", borderRadius: radius.sm },
  toggleActive: { backgroundColor: colors.card },
  toggleText: { fontSize: 15, fontWeight: "600", color: colors.muted },
  toggleTextActive: { color: colors.text },
  statusToggle: { flexDirection: "row", gap: space.sm },
  chip: { paddingHorizontal: space.lg, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.muted, textTransform: "capitalize" },
  chipTextActive: { color: colors.primaryText },
  nfcPanel: { alignItems: "center", paddingVertical: space.xl },
  nfcTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  nfcHint: { fontSize: 14, color: colors.muted, marginTop: space.xs, textAlign: "center" },
  banner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space.md, borderRadius: radius.md },
  bannerName: { fontSize: 16, fontWeight: "700", color: colors.text, flex: 1 },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.md,
  },
  rowName: { fontSize: 16, fontWeight: "600", color: colors.text },
  rowMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  tapHint: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  empty: { textAlign: "center", color: colors.muted, fontSize: 15, paddingVertical: space.xxl },
});
