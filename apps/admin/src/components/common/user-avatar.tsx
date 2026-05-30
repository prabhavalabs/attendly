/** Avatar with initials fallback, tinted by a stable per-seed band color. */
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const BANDS = [
  "var(--band-teal)",
  "var(--band-amber)",
  "var(--band-coral)",
  "var(--band-blue)",
  "var(--band-violet)",
  "var(--band-green)",
];

function tint(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return BANDS[h % BANDS.length]!;
}

export function UserAvatar({
  name,
  seed,
  photoUrl,
  size = 36,
  className,
}: {
  name: string;
  seed?: string;
  photoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const color = tint(seed ?? name);
  return (
    <Avatar className={cn(className)} style={{ width: size, height: size }}>
      {photoUrl ? <AvatarImage src={photoUrl} alt={name} /> : null}
      <AvatarFallback
        className="font-display font-semibold"
        style={{
          fontSize: Math.round(size * 0.36),
          background: `color-mix(in srgb, ${color} 16%, white)`,
          color,
        }}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
