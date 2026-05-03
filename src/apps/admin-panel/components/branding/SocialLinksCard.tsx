import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Instagram, Facebook, Twitter, Youtube } from "lucide-react";

type SocialLinks = {
  instagram: string;
  facebook: string;
  twitter: string;
  youtube: string;
};

export function SocialLinksCard({
  socialLinks,
  onChange,
}: {
  socialLinks: SocialLinks;
  onChange: (links: SocialLinks) => void;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Instagram className="h-4 w-4 text-muted-foreground" />
          Social Media Links
        </CardTitle>
        <CardDescription>Add your social media profiles. They'll appear on your public page.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs"><Instagram className="h-3.5 w-3.5" /> Instagram</Label>
            <Input value={socialLinks.instagram} onChange={e => onChange({ ...socialLinks, instagram: e.target.value })} placeholder="https://instagram.com/..." />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs"><Facebook className="h-3.5 w-3.5" /> Facebook</Label>
            <Input value={socialLinks.facebook} onChange={e => onChange({ ...socialLinks, facebook: e.target.value })} placeholder="https://facebook.com/..." />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs"><Twitter className="h-3.5 w-3.5" /> Twitter / X</Label>
            <Input value={socialLinks.twitter} onChange={e => onChange({ ...socialLinks, twitter: e.target.value })} placeholder="https://x.com/..." />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs"><Youtube className="h-3.5 w-3.5" /> YouTube</Label>
            <Input value={socialLinks.youtube} onChange={e => onChange({ ...socialLinks, youtube: e.target.value })} placeholder="https://youtube.com/..." />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
