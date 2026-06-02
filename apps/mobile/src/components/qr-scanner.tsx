/** Camera QR scanner for door check-in. Debounces repeat reads of the same code. */
import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Button } from "@/components/ui";
import { colors, radius, space } from "@/theme";

const COOLDOWN_MS = 1500;

export function QrScanner({ onScan }: { onScan: (token: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const lastRef = useRef<{ data: string; at: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const handle = useCallback(
    (result: BarcodeScanningResult) => {
      const data = result.data?.trim();
      if (!data) return;
      const now = Date.now();
      const last = lastRef.current;
      if (last && last.data === data && now - last.at < COOLDOWN_MS) return;
      lastRef.current = { data, at: now };
      setFlash(data);
      setTimeout(() => setFlash(null), 600);
      onScan(data);
    },
    [onScan],
  );

  if (!permission) {
    return <View style={styles.placeholder} />;
  }
  if (!permission.granted) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.permText}>Camera access is needed to scan student cards.</Text>
        <View style={{ height: space.md }} />
        <Button label="Grant camera access" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.frame}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={handle}
      />
      <View style={styles.reticle} pointerEvents="none" />
      {flash ? (
        <View style={styles.flash} pointerEvents="none">
          <Text style={styles.flashText}>Scanned</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 280,
    borderRadius: radius.lg,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholder: {
    height: 280,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
  },
  permText: { color: colors.muted, textAlign: "center", fontSize: 15 },
  reticle: {
    width: 180,
    height: 180,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: radius.md,
  },
  flash: {
    position: "absolute",
    bottom: space.lg,
    backgroundColor: colors.success,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: 999,
  },
  flashText: { color: "#fff", fontWeight: "700" },
});
