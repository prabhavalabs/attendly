/** Connectivity hook backed by expo-network. */
import { useEffect, useState } from "react";
import * as Network from "expo-network";

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let mounted = true;
    Network.getNetworkStateAsync()
      .then((s) => mounted && setOnline(s.isInternetReachable ?? s.isConnected ?? true))
      .catch(() => {});
    const sub = Network.addNetworkStateListener((s) => {
      setOnline(s.isInternetReachable ?? s.isConnected ?? true);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return online;
}
