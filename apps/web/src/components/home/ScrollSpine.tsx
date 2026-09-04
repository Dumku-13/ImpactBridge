import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

/**
 * A line down the side of the page that fills as you scroll and marks what you
 * are passing.
 *
 * It answers two questions a long editorial page otherwise leaves open — how
 * much of this is there, and what am I looking at — without a navigation bar
 * sitting on top of the composition.
 *
 * ── Why the labels are set vertically ──────────────────────────────────────
 *
 * The first version listed every section horizontally beside the rail. There is
 * no room for that: the page's content column is centred with roughly 70px of
 * gutter at a laptop width, and "HOW A RUPEE TRAVELS" is far wider than 70px —
 * so the rail printed itself straight across the Premise headline. Two changes
 * fix it for good:
 *
 *   - only the ACTIVE section is named, never all six at once
 *   - that name is set vertically along the rail, so the whole component is
 *     about 20px wide no matter how long the section is called
 *
 * ── Three implementation notes, each load-bearing ──────────────────────────
 *
 * 1. `mix-blend-difference`. This page runs ink → paper → ink as you scroll,
 *    and a rail with a fixed colour would vanish against one of them. Blending
 *    on difference inverts it against whatever is behind, so one element stays
 *    legible over every section and in both themes. Same trick as the Browse
 *    plate numerals.
 *
 * 2. No React state per frame. This updates on every scroll event; re-rendering
 *    the tree at that rate is how a page starts dropping frames. The fill is a
 *    transform written straight to the node and the label is a `textContent`
 *    assignment, both inside one rAF-throttled handler.
 *
 * 3. Inert everywhere except the marks. The rail began fully decorative —
 *    `aria-hidden`, `pointer-events-none` — on the reasoning that a progress
 *    indicator which eats clicks along the edge of the viewport is a trap.
 *    That reasoning still holds and still applies to the track, the fill and
 *    the label, all of which remain hidden and unclickable.
 *
 *    The seven marks are now the exception: they are anchors to the sections
 *    they mark, and they re-enable pointer events on themselves alone. So the
 *    strip is not a click-swallowing edge — it is inert except at seven points
 *    that say what they are before you press them. The label doing double duty
 *    as a hover readout is what makes that honest; without it you would be
 *    aiming at an anonymous dash.
 */
export function ScrollSpine({
  sections,
}: {
  /** `id` must match an element on the page; `label` is what the rail shows. */
  sections: Array<{ id: string; label: string }>;
}) {
  const fillRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fill = fillRef.current;
    const label = labelRef.current;
    const root = rootRef.current;
    if (!fill || !label || !root) return;

    const marks = sections.map((section) => ({
      ...section,
      node: root.querySelector<HTMLElement>(`[data-spine-mark="${section.id}"]`),
      target: document.getElementById(section.id),
    }));

    let frame = 0;
    let shown = "";
    let lastActive: (typeof marks)[number] | undefined;

    /*
     * Every write to the label goes through here, from the scroll handler and
     * from the pointer handlers alike, so the two can never fight over it. The
     * guard is the original one: assigning textContent restarts the label's
     * CSS transition, so an identical write is a visible flicker, not a no-op.
     */
    let hovered: string | null = null;
    const paintLabel = (text: string) => {
      if (text === shown) return;
      shown = text;
      label.textContent = text;
    };

    /*
     * ── Geometry is measured, not re-read every frame ──────────────────────
     *
     * This loop used to call `getBoundingClientRect()` on every section on
     * every frame — eight forced synchronous layouts per frame once the page
     * progress read of `scrollHeight` is counted, while four other scroll
     * listeners were doing their own reads and writes around it. That is the
     * textbook layout-thrashing shape, and it is the most expensive thing that
     * was happening during a scroll on this page.
     *
     * A section's position in the DOCUMENT only changes when the document
     * reflows. So it is measured on resize (and by a ResizeObserver, for
     * images and fetched panels landing), cached in document space, and the
     * per-frame work becomes pure arithmetic against `window.scrollY` with no
     * layout read at all:
     *
     *     rect.top    === docTop - scrollY
     *     rect.bottom === docTop + height - scrollY
     */
    let scrollable = 0;
    let readingLine = 0;
    const geometry = new Map<string, { top: number; height: number }>();

    const measure = () => {
      const scrollY = window.scrollY;
      scrollable = document.documentElement.scrollHeight - window.innerHeight;
      readingLine = window.innerHeight * 0.45;

      for (const mark of marks) {
        if (!mark.target) continue;
        const rect = mark.target.getBoundingClientRect();
        geometry.set(mark.id, { top: rect.top + scrollY, height: rect.height });
      }
    };

    const update = () => {
      frame = 0;

      const scrollY = window.scrollY;
      const progress = scrollable > 0 ? scrollY / scrollable : 0;
      fill.style.transform = `scaleY(${Math.min(Math.max(progress, 0), 1)})`;

      /*
       * The active section is the one CROSSING the reading line — 45% down the
       * viewport, because what you are reading is near the middle of the screen
       * rather than jammed against its top edge.
       *
       * "Crossing" rather than "the last one that has passed": with the simpler
       * rule a SHORT section can never be active at all, because the next
       * section's top clears the line before its own does. The stat band is
       * exactly that — a thin rule of figures between two tall chapters — and
       * it never once lit up until this was fixed.
       */
      const line = scrollY + readingLine;
      let active = marks[0];
      let crossing: (typeof marks)[number] | undefined;

      for (const mark of marks) {
        const box = geometry.get(mark.id);
        if (!box) continue;
        if (box.top <= line) active = mark;
        if (box.top <= line && box.top + box.height > line) crossing = mark;
      }

      if (crossing) active = crossing;

      /*
       * Only touch the DOM when the active section actually changes. The old
       * version reassigned `dataset.active` on every mark on every frame;
       * even where the browser short-circuits an identical attribute write,
       * doing it seven times a frame for nothing is work worth not doing.
       */
      if (active !== lastActive) {
        lastActive = active;

        for (const mark of marks) {
          if (!mark.node) continue;
          mark.node.dataset.active = String(mark === active);
        }

        // While a tick is hovered or focused it owns the label; the section
        // you are POINTING AT is more useful than the one you are scrolled to.
        if (active && !hovered) paintLabel(active.label);
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    const onResize = () => {
      measure();
      onScroll();
    };

    /*
     * Pointing at a tick names it.
     *
     * The ticks are 8px hairlines. Without this you would be aiming at an
     * unlabelled dash and hoping — which is the whole reason a jump control
     * made of marks needs to say what each mark is before you commit to it.
     *
     * Delegated to the list and written through `paintLabel`, so hovering the
     * rail costs one textContent assignment and never a React render. `focusin`
     * shares the path so tabbing through reads exactly like pointing.
     */
    const onPoint = (event: Event) => {
      const link = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-spine-link]",
      );
      if (!link) return;
      hovered = link.dataset.spineLabel ?? null;
      if (hovered) paintLabel(hovered);
    };

    const onUnpoint = () => {
      hovered = null;
      if (lastActive) paintLabel(lastActive.label);
    };

    /*
     * Glide to the section rather than teleport.
     *
     * Three routes were tried before this one, and the first two are dead ends
     * worth recording so nobody re-treads them:
     *
     *   1. `html { scroll-behavior: smooth }`. Never applies — ScrollTrigger
     *      writes `scroll-behavior: auto` INLINE on the documentElement, read
     *      off the live element, because a smooth scroller breaks the maths
     *      driving the hero. An inline style beats any rule we can author.
     *
     *   2. A hand-rolled rAF tween writing `window.scrollTo` per frame. This
     *      shipped, and it jumped instantly in the field. Two things write
     *      scrollY on the same frames when it runs — the tween and the
     *      ScrollTrigger scrubs — and the tween loses.
     *
     * So the scroll is handed to GSAP, which already owns it here. One ticker
     * drives both the scrubs and this, so there is nothing to race.
     * `autoKill` gives interruption for free: the tween stops the moment the
     * visitor scrolls, instead of hauling them to a destination they have
     * changed their mind about.
     */
    const glideTo = (top: number) => {
      /*
       * Distance-aware, then clamped. Jumping to the next chapter should not
       * take as long as jumping to the last one, but seven screens still has
       * to arrive promptly — past about 0.7s a traversal stops reading as a
       * move and starts reading as a wait.
       */
      const distance = Math.abs(top - window.scrollY);
      const duration = Math.min(0.7, Math.max(0.3, distance * 0.00022));

      gsap.to(window, {
        duration,
        // ease-out: leaves immediately, settles gently. Never ease-in — the
        // delay lands exactly where the eye is already looking.
        ease: "power2.out",
        overwrite: "auto",
        scrollTo: { y: top, autoKill: true },
      });
    };

    const onActivate = (event: MouseEvent) => {
      // Let the browser keep modified clicks: new tab, new window, download.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>(
        "[data-spine-link]",
      );
      if (!link) return;

      const id = link.getAttribute("href")?.slice(1);
      const target = id && document.getElementById(id);
      if (!target) return; // fall through to the native jump

      event.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY;

      /*
       * Reduced motion lands instantly. Travelling seven screens under someone
       * who asked for less movement is precisely what that setting is about —
       * so if the rail ever seems to "jump" for no reason, this is the branch
       * to check before suspecting the tween.
       */
      if (prefersReducedMotion()) {
        window.scrollTo(0, Math.round(top));
      } else {
        glideTo(top);
      }

      /*
       * `replaceState`, not `pushState`: the section belongs in the URL so it
       * can be shared, but seven history entries from idly reading the rail
       * would turn Back into a scroll-position undo instead of a way out of
       * the page.
       */
      history.replaceState(null, "", `#${id}`);
    };

    measure();
    update();

    // Document height changes that fire no resize event: fonts swapping,
    // images landing, the fetched record panels arriving above these sections.
    const observer = new ResizeObserver(onResize);
    observer.observe(document.documentElement);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    const list = root.querySelector<HTMLElement>("[data-spine-list]");
    list?.addEventListener("pointerover", onPoint);
    list?.addEventListener("pointerout", onUnpoint);
    list?.addEventListener("focusin", onPoint);
    list?.addEventListener("focusout", onUnpoint);
    list?.addEventListener("click", onActivate as EventListener);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      list?.removeEventListener("pointerover", onPoint);
      list?.removeEventListener("pointerout", onUnpoint);
      list?.removeEventListener("focusin", onPoint);
      list?.removeEventListener("focusout", onUnpoint);
      list?.removeEventListener("click", onActivate as EventListener);
      gsap.killTweensOf(window);
      observer.disconnect();
    };
  }, [sections]);

  return (
    <div
      ref={rootRef}
      /*
       * Two modes, because the room available is not a matter of taste.
       *
       * The page's content column is `max-w-7xl` (1280px) inside 24px of
       * padding, so at a 1280px window the text starts 24px from the edge and
       * there is NO gutter to put anything in. The full rail — ticks and a
       * name — is ~43px wide and needs about 1440px before it clears the copy.
       *
       * A previous version hid the whole thing below 1440px, which meant a
       * 1427px laptop — where there is in fact 133px of gutter — showed nothing
       * at all and the feature looked unbuilt. So below that
       * width the rail keeps the part that matters — the LINE, 1px, tucked at
       * 12px where nothing can collide with it — and drops only the ticks and
       * the label. The scroll indication survives everywhere; the annotation
       * appears when there is somewhere to put it.
       *
       * Blend mode is applied here so track, fill, ticks and label all invert
       * together against ink, paper and ink again.
       */
      className="pointer-events-none fixed left-3 top-1/2 z-40 hidden -translate-y-1/2 mix-blend-difference md:block min-[1360px]:left-5"
    >
      <div className="relative flex h-[46svh] items-stretch gap-2.5">
        {/* Track, then the fill scaling from the top. Progress, not content. */}
        <div aria-hidden="true" className="relative w-px bg-[hsl(40_24%_96%/0.28)]">
          <div
            ref={fillRef}
            /* Own layer: the scaleY is written every scroll frame, so keeping
               it composited avoids repainting the rail underneath it. */
            className="absolute inset-x-0 top-0 h-full origin-top scale-y-0 bg-[hsl(40_24%_96%)] will-change-transform"
          />
        </div>

        {/*
          One tick per section — the whole outline at a glance, and the way to
          jump to any of it.

          `pointer-events-auto` is re-enabled HERE and nowhere else. The root
          stays `pointer-events-none`, so the rail, the track and the label are
          still inert and the edge of the viewport does not become a strip that
          swallows clicks — which is the trap the note at the top of this file
          warns about. Only the seven marks are targets.

          Plain `<a href="#id">` rather than a click handler: it works from the
          keyboard for free, offers "open in new tab", puts the section in the
          URL so it can be shared, and needs no JavaScript to do its job.
        */}
        <nav
          aria-label="Jump to a section"
          data-spine-list
          className="pointer-events-auto hidden min-[1360px]:flex"
        >
          <ol className="flex flex-1 flex-col justify-between py-1">
            {sections.map((section) => (
              <li
                key={section.id}
                data-spine-mark={section.id}
                data-active="false"
                className="group flex h-2 items-center"
              >
                <a
                  href={`#${section.id}`}
                  data-spine-link
                  data-spine-label={section.label}
                  /*
                   * The mark stays an 8px hairline; `::before` gives it a 44px
                   * target so it can be hit without being seen. Seven sections
                   * across 46svh sit about 60px apart, so the targets clear
                   * each other.
                   *
                   * No focus ring: this sits inside `mix-blend-difference`,
                   * which would invert one into whatever is behind it. The
                   * focused state is carried by the mark itself instead —
                   * double the width and triple the brightness, plus its name
                   * appearing on the rail, which is a louder indicator than a
                   * ring would have been.
                   */
                  className="relative flex h-2 items-center before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-8 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] focus-visible:outline-none"
                >
                  <span className="sr-only">{section.label}</span>
                  {/* `group-data-` reads the state off the <li>, which is where
                      the handler writes it — a `data-[active]` variant here
                      would look at this span's own attribute and never match. */}
                  <span
                    aria-hidden="true"
                    className="h-px w-2 bg-[hsl(40_24%_96%/0.35)] transition-all duration-300 group-hover:w-4 group-hover:bg-[hsl(40_24%_96%)] group-focus-within:w-4 group-focus-within:bg-[hsl(40_24%_96%)] group-data-[active=true]:w-4 group-data-[active=true]:bg-[hsl(40_24%_96%)]"
                  />
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/*
          The name of the section you are in, set vertically so the component
          stays ~20px wide however long that name is. Written by the handler
          above rather than rendered from state.
        */}
        <span
          ref={labelRef}
          aria-hidden="true"
          className="hidden self-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(40_24%_96%/0.85)] transition-opacity duration-300 min-[1360px]:block"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        />
      </div>
    </div>
  );
}
