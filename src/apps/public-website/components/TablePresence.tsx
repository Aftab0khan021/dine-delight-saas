import { CollabPresence } from "../hooks/useCollaborativeCart";

const COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-green-500",
  "bg-orange-500", "bg-pink-500", "bg-teal-500",
];

function getColor(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) hash = token.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitial(p: CollabPresence): string {
  if (p.name) return p.name[0].toUpperCase();
  return p.token.slice(-2).toUpperCase();
}

type TablePresenceProps = {
  participants: CollabPresence[];
  isLeader: boolean;
  tableLabel: string;
};

export function TablePresence({ participants, isLeader, tableLabel }: TablePresenceProps) {
  if (participants.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-background/80 backdrop-blur-sm border rounded-full shadow-lg text-sm animate-in slide-in-from-top-2 duration-300">
      <div className="flex -space-x-1.5">
        {participants.slice(0, 5).map((p) => (
          <div
            key={p.token}
            title={p.name ?? `Guest ${p.token.slice(-4)}`}
            className={`w-6 h-6 rounded-full ${getColor(p.token)} text-white text-xs flex items-center justify-center font-bold ring-2 ring-background`}
          >
            {getInitial(p)}
          </div>
        ))}
        {participants.length > 5 && (
          <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center ring-2 ring-background">
            +{participants.length - 5}
          </div>
        )}
      </div>
      <span className="text-muted-foreground text-xs">
        {participants.length === 1 ? "Just you" : `${participants.length} ordering at ${tableLabel}`}
        {isLeader && <span className="ml-1 text-primary">· You lead</span>}
      </span>
    </div>
  );
}
