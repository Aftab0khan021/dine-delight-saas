import { useEffect } from "react";

type SEOProps = {
  title?: string;
  description?: string;
  ogImage?: string;
  ogUrl?: string;
};

export function useSEO({ title, description, ogImage, ogUrl }: SEOProps) {
  useEffect(() => {
    if (title) document.title = title;

    const setMeta = (name: string, content: string, attr = "name") => {
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    if (description) {
      setMeta("description", description);
      setMeta("og:description", description, "property");
    }
    if (title) {
      setMeta("og:title", title, "property");
    }
    if (ogImage) {
      setMeta("og:image", ogImage, "property");
    }
    if (ogUrl) {
      setMeta("og:url", ogUrl, "property");
    }
    setMeta("og:type", "website", "property");
  }, [title, description, ogImage, ogUrl]);
}
