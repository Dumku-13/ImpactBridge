import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

interface GalleryImage {
  id: string;
  title: string;
  url: string;
}

/**
 * The organisation's own photographs, as a filled mosaic.
 *
 * The first version laid one plate per row at 42–64% of the column, alternating
 * sides. On paper that is an editorial spread; on screen, next to a short
 * sticky sidebar, it left the page looking like it had failed to load — a
 * narrow ribbon of pictures down the middle with dead space either side. This
 * fills the column instead: a two-column mosaic where the lead plate spans the
 * full width and the rest pair off, so the section reads as a body of work
 * rather than a list of files.
 *
 * The count is not fixed. An organisation may publish one photograph or a
 * dozen, so the layout is built to look composed at ANY count — see
 * `spanFor` below — rather than assuming the four that happened to be seeded.
 *
 * Images arrive from Cloudinary at whatever dimensions the nonprofit uploaded,
 * so every plate is a fixed aspect-ratio box with `object-cover`: a portrait
 * photograph landing among landscapes cannot shove the composition sideways.
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

  /**
   * Images that turned out to be too small for the slot they were given.
   *
   * The span pattern below is decided by position, but whether a photograph can
   * FILL that span depends on its pixel width — and nothing knows that until it
   * loads. These arrive from Cloudinary at whatever size the nonprofit
   * uploaded, so this is the real case, not a seed-data quirk: someone
   * uploading a 600px photo should not have it stretched across a 696px column.
   *
   * Set once and never cleared. Demoting makes the plate narrower, which would
   * make the measurement pass on the next render and re-promote it — a loop
   * that flickers forever.
   */
  const [tooSmallForWide, setTooSmallForWide] = useState<Record<string, true>>({});

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".og-plate").forEach((plate, i) => {
        const img = plate.querySelector("img");
        if (!img) return;

        gsap.fromTo(
          img,
          { yPercent: i % 2 === 0 ? -4 : -6 },
          {
            yPercent: i % 2 === 0 ? 4 : 6,
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

  /**
   * Which plates run full width.
   *
   * The lead always does. After that, a full-width plate every fourth item
   * breaks up the pairs, and a trailing odd plate is widened rather than left
   * as a lone half with a hole beside it — the hole being the entire problem
   * this layout was rewritten to solve.
   *
   * EXCEPT when there is only one photograph. A single full-width plate is
   * 696px in this column, and the library's smallest cause image is 480px wide
   * — the one an animal charity gets, since it is the only animal photograph
   * that exists. Blowing a 480px source up to 696px to fill a row trades one
   * ugly problem for another. A lone image stays at half width and its caption
   * takes the other half, which fills the row with something true instead.
   */
  const single = images.length === 1;

  const spanFor = (index: number, total: number) => {
    if (single) return false;
    if (index === 0) return true;
    if (index === total - 1 && (total - 1) % 2 === 1) return true;
    return index % 4 === 3;
  };

  return (
    <div ref={rootRef} className="grid grid-cols-2 gap-4 sm:gap-5">
      {images.map((image, i) => {
        const wide = spanFor(i, images.length) && !tooSmallForWide[image.id];
        /* A caption that is just a filename is noise, not information. */
        const caption =
          image.title && !/\.(jpe?g|png|webp|gif|avif)$/i.test(image.title)
            ? image.title
            : null;

        return (
          <figure
            key={image.id}
            className={cn("min-w-0", wide && "col-span-2", single && "relative")}
          >
            <div
              className={cn(
                "og-plate overflow-hidden bg-secondary",
                /* Wide plates get a landscape frame, paired plates a squarer
                   one — a 16/10 crop at half width is a letterbox slit. */
                wide ? "aspect-[16/9]" : "aspect-[4/3]",
              )}
            >
              <img
                src={image.url}
                alt={image.title}
                loading={i === 0 ? "eager" : "lazy"}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  const rendered = img.getBoundingClientRect().width;
                  if (!wide || !img.naturalWidth || !rendered) return;
                  // A 2% tolerance: fractional layout widths shouldn't demote a
                  // photograph that is effectively the right size.
                  if (img.naturalWidth < rendered * 0.98) {
                    setTooSmallForWide((prev) =>
                      prev[image.id] ? prev : { ...prev, [image.id]: true },
                    );
                  }
                }}
                className="h-[110%] w-full object-cover"
              />
            </div>
            {caption && !single && (
              <figcaption className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                {caption}
              </figcaption>
            )}

            {/* The lone-image case: caption set beside the plate, at reading
                size, so the second column carries weight rather than air. */}
            {caption && single && (
              <figcaption
                className="absolute left-[calc(50%+0.625rem)] top-0 max-w-[16rem] font-display text-lg leading-snug text-muted-foreground"
                style={{ fontVariationSettings: '"SOFT" 12' }}
              >
                {caption}
              </figcaption>
            )}
          </figure>
        );
      })}
    </div>
  );
}
