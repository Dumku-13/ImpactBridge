import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

interface GalleryImage {
  id: string;
  title: string;
  url: string;
}

/**
 * The organisation's own photographs, read as a spread rather than a grid.
 *
 * These images arrive from Cloudinary at whatever dimensions the nonprofit
 * uploaded, so every plate is a fixed aspect-ratio box with `object-cover` — a
 * portrait photograph landing among landscapes cannot be allowed to shove the
 * composition sideways. The three shapes below rotate, which is what stops six
 * unrelated snapshots reading as a contact sheet.
 *
 * IMPORTANT: this array is already double-filtered server-side on `isPublic`
 * AND `type: GALLERY_IMAGE`. Registration certificates and audited accounts
 * live in the same table, and a change to either filter alone must not be able
 * to leak them here.
 *
 * Motion is a scrubbed drift per plate, never a pin (HANDOFF §3.1). The image
 * is taller than its frame so the drift can never expose an edge.
 */
export function OrgGallery({ images }: { images: GalleryImage[] }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".og-plate").forEach((plate, i) => {
        const img = plate.querySelector("img");
        if (!img) return;

        gsap.fromTo(
          img,
          { yPercent: i % 2 === 0 ? -5 : -8 },
          {
            yPercent: i % 2 === 0 ? 5 : 8,
            ease: "none",
            scrollTrigger: {
              trigger: plate,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.6,
            },
          },
        );
      });
    }, root);

    return () => ctx.revert();
  }, [images.length]);

  if (images.length === 0) return null;

  /*
   * Widths and offsets cycle in threes so no two neighbours share a shape.
   *
   * The widths are also a resolution budget. In a ~820px main column these cap
   * the largest plate at roughly 530 CSS px, which is about where the smallest
   * photographs in the library still hold up — an NGO uploading a 600px image
   * would otherwise be rendered at 640px and look soft, and this project has
   * already learned once (the hero sequence) that upscaling invents pixels
   * nobody asked for.
   */
  const SHAPES = [
    { frame: "aspect-[16/10]", width: "sm:w-[64%]", align: "sm:mr-auto" },
    { frame: "aspect-[4/5]", width: "sm:w-[42%]", align: "sm:ml-auto" },
    { frame: "aspect-[3/2]", width: "sm:w-[54%]", align: "sm:ml-[16%]" },
  ] as const;

  return (
    <div ref={rootRef} className="flex flex-col gap-12 sm:gap-16">
      {images.map((image, i) => {
        const shape = SHAPES[i % SHAPES.length]!;

        return (
          <figure
            key={image.id}
            className={cn("w-full", shape.width, shape.align)}
          >
            <div
              className={cn(
                "og-plate overflow-hidden bg-secondary",
                shape.frame,
              )}
            >
              <img
                src={image.url}
                alt={image.title}
                loading={i === 0 ? "eager" : "lazy"}
                className="h-[112%] w-full object-cover"
              />
            </div>
            {/* The nonprofit titles its own uploads; when the title is just the
                filename it is noise, so anything that looks like one is
                dropped rather than printed as a caption. */}
            {image.title && !/\.(jpe?g|png|webp|gif|avif)$/i.test(image.title) && (
              <figcaption className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {image.title}
              </figcaption>
            )}
          </figure>
        );
      })}
    </div>
  );
}
