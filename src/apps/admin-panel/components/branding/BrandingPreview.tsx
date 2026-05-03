import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Store, Globe, ExternalLink, Copy, Mail, Phone, Image as ImageIcon, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type PreviewData = {
  name: string;
  slug: string;
  description: string;
  logo_url: string;
  cover_image_url: string;
  primary_color: string;
  accent_color: string;
  contact_email: string;
  contact_phone: string;
};

function getPublicUrl(slug: string) {
  return `${window.location.origin}/r/${slug}`;
}

export function BrandingPreview({
  watched,
  savedSlug,
}: {
  watched: PreviewData;
  savedSlug: string | undefined;
}) {
  const { toast } = useToast();

  const handleCopyLink = () => {
    const slug = watched.slug || savedSlug;
    if (!slug) return;
    navigator.clipboard.writeText(getPublicUrl(slug));
    toast({ title: "Copied", description: "Website URL copied to clipboard." });
  };

  return (
    <div className="space-y-6">
      {/* 1. Website Link Card */}
      <Card className="shadow-sm border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-primary">
            <Globe className="h-4 w-4" />
            Your Website
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border bg-background p-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">Public URL</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-xs font-mono bg-muted/50 p-1 rounded">
                {watched.slug ? getPublicUrl(watched.slug) : "..."}
              </code>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyLink}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {/* Show warning if slug changed from saved value */}
          {savedSlug && watched.slug && watched.slug !== savedSlug && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Changing slug will break the old URL: <code className="font-mono">/r/{savedSlug}</code>
              </AlertDescription>
            </Alert>
          )}
          <Button className="w-full" variant="outline" asChild>
            <a
              href={savedSlug ? getPublicUrl(savedSlug) : "#"}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" /> Visit Live Site
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* 2. Visual Preview Card */}
      <Card className="shadow-sm overflow-hidden lg:sticky lg:top-6">
        <CardHeader className="bg-muted/30 border-b pb-3">
          <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Mobile Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mockup Container */}
          <div className="relative bg-white min-h-[450px] flex flex-col">

            {/* Header (Cover Image + Logo) */}
            <div className="relative h-32 w-full bg-gray-100">
              {watched.cover_image_url ? (
                <img src={watched.cover_image_url} alt="Cover" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-gray-300 bg-gray-200">
                  <ImageIcon className="h-8 w-8" />
                </div>
              )}

              {/* Logo Overlay */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2">
                <div className="h-16 w-16 rounded-full border-4 border-white bg-white shadow-md overflow-hidden flex items-center justify-center">
                  {watched.logo_url ? (
                    <img src={watched.logo_url} alt="Logo" className="h-full w-full object-cover" />
                  ) : (
                    <Store className="h-8 w-8 text-gray-400" />
                  )}
                </div>
              </div>
            </div>

            {/* Body Content */}
            <div className="mt-8 px-5 pb-5 text-center flex-1 flex flex-col">
              <h3 className="font-bold text-lg text-gray-900 leading-tight">
                {watched.name || "Your Restaurant"}
              </h3>

              <p className="text-xs text-gray-500 mt-2 line-clamp-3">
                {watched.description || "Delicious food served daily. Order online for pickup or dine-in."}
              </p>

              {/* Contact Info Preview */}
              {(watched.contact_email || watched.contact_phone) && (
                <div className="flex justify-center gap-3 mt-3 text-[10px] text-gray-400">
                  {watched.contact_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> Email</span>}
                  {watched.contact_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> Call</span>}
                </div>
              )}

              {/* Mock Items */}
              <div className="grid grid-cols-2 gap-2 mt-6">
                <div className="h-24 rounded-lg bg-gray-50 border border-gray-100 animate-pulse"></div>
                <div className="h-24 rounded-lg bg-gray-50 border border-gray-100 animate-pulse"></div>
              </div>

              {/* CTA Button */}
              <div className="mt-auto pt-6">
                <div
                  className="w-full py-3 rounded-full text-sm font-bold shadow-lg transition-transform"
                  style={{
                    backgroundColor: watched.primary_color || "#000000",
                    color: watched.accent_color || "#ffffff"
                  }}
                >
                  Browse Menu
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
