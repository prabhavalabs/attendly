/**
 * Renders an image from an authenticated API path. Browsers can't attach the
 * Bearer token to <img src>, so we fetch the bytes (cached by React Query) and
 * render an object URL. Returns null until loaded so a fallback can show.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function AuthImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const { data: blob } = useQuery({
    queryKey: ["photo", path],
    queryFn: () => api.blob(path),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!url) return null;
  return <img src={url} alt={alt} className={className} />;
}
