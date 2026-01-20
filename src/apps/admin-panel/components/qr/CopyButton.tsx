import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Props = {
  value: string;
  label?: string;
  className?: string;
};

export function CopyButton({ value, label = "Copy", className }: Props) {
  const { toast } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copied", description: "Link copied to clipboard." });
    } catch {
      // Fallback: best-effort copy
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast({ title: "Copied", description: "Link copied to clipboard." });
      } catch {
        toast({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "destructive" });
      }
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} className={className}>
      {label}
    </Button>
  );
}
