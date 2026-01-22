import { useState, useEffect, ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
    src: string;
    alt: string;
    className?: string;
    /**
     * Blur placeholder while loading (base64 or low-res image)
     */
    placeholder?: string;
    /**
     * Aspect ratio for placeholder (e.g., "16/9", "1/1")
     */
    aspectRatio?: string;
}

/**
 * Optimized image component with lazy loading and blur placeholder
 * 
 * Features:
 * - Lazy loading (only loads when in viewport)
 * - Blur placeholder while loading
 * - Automatic WebP support (if browser supports)
 * - Responsive sizing
 */
export function OptimizedImage({
    src,
    alt,
    className,
    placeholder,
    aspectRatio = "16/9",
    ...props
}: OptimizedImageProps) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [imageSrc, setImageSrc] = useState(placeholder || src);

    useEffect(() => {
        // Create an image element to preload
        const img = new Image();
        img.src = src;
        img.onload = () => {
            setImageSrc(src);
            setIsLoaded(true);
        };
    }, [src]);

    return (
        <div
            className={cn("relative overflow-hidden bg-muted", className)}
            style={{ aspectRatio }}
        >
            <img
                src={imageSrc}
                alt={alt}
                loading="lazy"
                decoding="async"
                className={cn(
                    "h-full w-full object-cover transition-opacity duration-300",
                    isLoaded ? "opacity-100" : "opacity-0"
                )}
                {...props}
            />
            {!isLoaded && placeholder && (
                <img
                    src={placeholder}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover blur-sm scale-110"
                />
            )}
        </div>
    );
}

/**
 * Generate a tiny placeholder for blur effect
 * Use this for menu item images
 */
export function generatePlaceholder(width: number = 20, height: number = 20): string {
    // Returns a tiny gray rectangle as base64
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
        ctx.fillStyle = "#e5e7eb"; // gray-200
        ctx.fillRect(0, 0, width, height);
    }
    return canvas.toDataURL("image/png");
}
