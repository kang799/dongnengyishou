import { getBeastIcon } from "@/lib/beast-icons";

export function BeastAvatar({ species, size = 40 }: { species: string; size?: number }) {
  const icon = getBeastIcon(species);
  const px = `${size}px`;
  return (
    <div
      style={{ width: px, height: px }}
      className="rounded-full bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center shrink-0 overflow-hidden"
    >
      {icon ? (
        <img src={icon} alt={species} className="w-[90%] h-[90%] object-contain" />
      ) : (
        <span className="font-display text-lg text-primary/80">兽</span>
      )}
    </div>
  );
}
