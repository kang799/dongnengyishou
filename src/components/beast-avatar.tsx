import { getBeastIcon } from "@/lib/beast-icons";

export function BeastAvatar({
  species,
  size = 40,
  avatarUrl,
  name,
}: {
  species: string;
  size?: number;
  avatarUrl?: string | null;
  name?: string;
}) {
  const icon = getBeastIcon(species);
  const px = `${size}px`;
  return (
    <div
      style={{ width: px, height: px }}
      className="rounded-full bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center shrink-0 overflow-hidden"
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name ?? species} className="w-full h-full object-cover" />
      ) : icon ? (
        <img src={icon} alt={species} className="w-[90%] h-[90%] object-contain" />
      ) : (
        <span className="font-display text-lg text-primary/80">兽</span>
      )}
    </div>
  );
}
