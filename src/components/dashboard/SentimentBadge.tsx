import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Smile, Meh, Frown } from "lucide-react";

interface SentimentBadgeProps {
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  escalationFlagged?: boolean;
}

export const SentimentBadge = ({ sentiment, escalationFlagged }: SentimentBadgeProps) => {
  if (escalationFlagged) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Escalated
      </Badge>
    );
  }

  if (!sentiment) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        N/A
      </Badge>
    );
  }

  const config = {
    positive: {
      icon: Smile,
      className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
      label: "Positive",
    },
    neutral: {
      icon: Meh,
      className: "bg-muted text-muted-foreground border-border",
      label: "Neutral",
    },
    negative: {
      icon: Frown,
      className: "bg-destructive/15 text-destructive border-destructive/30",
      label: "Negative",
    },
  }[sentiment];

  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${config.className}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
};

export default SentimentBadge;
