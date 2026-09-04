import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, Check } from "lucide-react";
import { formatMoneyCompact } from "@impactbridge/shared";
import { usePublicStats } from "@/api/stats";
import { useOrganizations } from "@/api/organizations";
import { useGrants } from "@/api/grants";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

/**
 * The landing opening: one sentence at display scale that explodes in the
 * BACKGROUND while the platform's real figures scroll over it.
 *
 * ── The structure, which is the whole trick ────────────────────────────────
 *
 *   zone (3.4 screens tall, ink)
 *   ├── background — `sticky top-0`, one screen: the headline, plus an ink
 *   │   wash that strengthens as you descend
 *   └── foreground — normal flow, pulled up over the background by a negative
 *       bottom margin on the sticky element, so the figures travel across a
 *       headline that is still coming apart behind them
 *
 * Taken from the F1 dashboard, which explodes a car across three viewports and
 * lets its editorial scenes ride over the wreckage at 60% ink. Same idea,
 * different subject: here the thing being taken apart is the claim, and what
 * scrolls over it is the evidence for the claim.
 *
 * ── Not pinned ─────────────────────────────────────────────────────────────
 *
 * `position: sticky`, never `ScrollTrigger.pin`. The pin is banned here and the
 * ban was earned twice (HANDOFF §3.1): it moves the element into a generated
 * spacer at fixed position, where a margin or a full-bleed breakout renders
 * off-frame and leaves a blank band.
 *
 * ── One variable, no animation library ─────────────────────────────────────
 *
 * A single rAF-throttled listener writes `--op-p` (0 → 1) onto the zone, and
 * every movement is a `calc()` off it in index.css — the F1 dashboard's
 * `--hero-p` method. Beyond being cheap, it is the only version of this that
 * can be TESTED: motion expressed as arithmetic on a variable can be driven by
 * hand and measured, which a timeline cannot.
 *
 * The rules are gated behind `.op-scrub`, added by that listener. Without it —
 * reduced motion, no JS, a script that threw — the letters sit at their natural
 * positions at full opacity and the page reads as a still headline. Never a
 * blank ink field (§3.2).
 */

/**
 * The sentence, split to characters so each can move independently.
 *
 * The pieces are `aria-hidden` and the real line is announced once from the
 * `sr-only` copy in the heading: a screen reader spelling out "F — U — N — D"
 * is how kinetic type usually fails the people least able to route around it.
 */
/*
 * The opening plays once per page LOAD, not once per mount. Returning to the
 * home page from elsewhere in the app is not an arrival, and replaying the
 * reveal every time someone navigates back would turn a first impression into
 * a toll booth.
 */
let introPlayed = false;

function SplitLine({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");

  return (
    <span className={className}>
      {words.map((word, w) => (
        <span key={`${word}-${w}`} aria-hidden="true" className="op-word inline-block whitespace-nowrap">
          {[...word].map((char, c) => (
            <span key={`${char}-${c}`} className="op-char inline-block will-change-transform">
              {char}
            </span>
          ))}
          {w < words.length - 1 && <span className="inline-block">&nbsp;</span>}
        </span>
      ))}
    </span>
  );
}

export function Opening() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: stats } = usePublicStats();

  /*
   * The records behind the figures.
   *
   * Both endpoints are public and already used by Browse and Grants, so this
   * costs two cached requests and no new server code. They exist because the
   * right-hand half of these screens was empty ink: a paragraph floating in a
   * void with the exploded headline drifting past it. Filling that with texture
   * was the wrong instinct — the honest fill is the evidence itself. A number
   * claiming "8 organisations verified" is worth more when the eight are named
   * beside it.
   */
  const { data: organizations } = useOrganizations({ pageSize: 8, sort: "most-funded" });
  const { data: openGrants } = useGrants({ openOnly: true, pageSize: 4, sort: "deadline" });

  /*
   * ── The opening reveal ────────────────────────────────────────────────────
   *
   * Gated on the FONTS, not on a timer.
   *
   * The three faces here are self-hosted with `font-display: swap`, so the
   * headline paints in a fallback and then reflows into Archivo. At
   * `clamp(2.75rem, min(15vw, 17svh), 13rem)` and width 62% that reflow is a
   * visible lurch on every cold load. Waiting for `document.fonts.ready` puts
   * the reveal exactly over the top of it: the same moment stops being a
   * glitch and becomes the entrance. An intro that covers a real event earns
   * its time; one that invents a wait is just a spinner with better taste.
   *
   * The race against 800ms is the safety valve — a slow or failed font fetch
   * must never hold the page hostage behind an animation that has not started.
   *
   * ── Why this moves the WORDS and not the letters ──────────────────────────
   *
   * `.op-char` already carries a transform, written by CSS from `--op-p` as
   * you scroll. Animating the letters here would mean GSAP writing inline
   * transforms over that rule and killing the scroll explosion. The word spans
   * are a free layer above them: nested transforms compose, so a word can rise
   * while each letter inside it keeps its own scroll-driven vector.
   *
   * ── Why it fades from 0.3 and not from 0 ──────────────────────────────────
   *
   * The house rule, and this file's own hard-won one: an animation that is
   * created but never advances paints and HOLDS its first keyframe. At zero
   * that is a headline which is simply gone — the failure this project has
   * shipped twice. At 0.3 the worst case is "briefly dim". Nothing is hidden
   * by the stylesheet either; the start state is set by the same JavaScript
   * that clears it, so a script that never runs leaves a page that is merely
   * un-animated rather than blank.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (introPlayed || prefersReducedMotion()) return;

    /*
     * Words, not lines. A line rising as one block reads as a panel sliding;
     * six words arriving in sequence reads as type setting itself, which is
     * the whole point of an opening on a page whose subject is a headline.
     */
    const words = Array.from(root.querySelectorAll<HTMLElement>(".op-word"));
    const chrome = Array.from(root.querySelectorAll<HTMLElement>(".op-chrome"));
    if (words.length === 0) return;

    const targets = [...words, ...chrome];
    /*
     * `clearProps` rather than leaving the end values inline: `.op-chrome`
     * takes its opacity from a scroll-driven CSS rule afterwards, and an inline
     * opacity would outrank it for the rest of the session.
     */
    const release = () => gsap.set(targets, { clearProps: "opacity,transform" });

    gsap.set(words, { yPercent: 60, opacity: 0.3 });
    // 0.3 here too, for the reason above — the rule is not just for the headline.
    gsap.set(chrome, { opacity: 0.3, y: 8 });

    let cancelled = false;
    let timeline: gsap.core.Timeline | undefined;

    const fontsReady = document.fonts
      ? document.fonts.ready.then(() => undefined)
      : Promise.resolve();
    const ceiling = new Promise<void>((resolve) => {
      setTimeout(resolve, 800);
    });

    void Promise.race([fontsReady, ceiling]).then(() => {
      if (cancelled) return;

      /*
       * Claimed here rather than on the way in. Setting it at the top of the
       * effect meant the first mount burned the flag without animating
       * anything, so StrictMode's mount → cleanup → mount left the second pass
       * returning early and the reveal never played at all. Worse than the dev
       * symptom: any remount would have disabled the opening permanently.
       * Marking it at the point the timeline is actually built ties the flag to
       * the thing it is supposed to describe.
       */
      introPlayed = true;
      timeline = gsap.timeline({ onComplete: release });

      /*
       * Words first, 70ms apart. Slower than the 0.5s the rest of the page
       * enters at, because this type is an order of magnitude larger and the
       * eye reads the whole line as one object — the same duration that feels
       * composed on a card reads as a twitch at 13rem.
       */
      timeline
        .to(words, {
          yPercent: 0,
          opacity: 1,
          duration: 0.95,
          ease: "power3.out",
          stagger: 0.07,
        })
        // The chrome settles under the headline rather than after it: starting
        // at 0.3s overlaps the second line, so the screen resolves as one
        // movement instead of a queue of them.
        .to(chrome, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.08 }, 0.3);
    });

    return () => {
      cancelled = true;
      timeline?.kill();
      release();
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const chars = Array.from(root.querySelectorAll<HTMLElement>(".op-char"));
    const headline = root.querySelector<HTMLElement>(".op-headline");
    if (!headline || chars.length === 0) return;

    /*
     * Measure once, before anything moves: each letter's direction is the
     * vector from the centre of the headline through its own centre. Stored on
     * the element as custom properties, so the scroll handler afterwards writes
     * exactly ONE value for the whole zone and CSS does the rest.
     *
     * Radial, not random — a shared origin reads as an explosion, random
     * scatter reads as a bug.
     */
    const measure = () => {
      const box = headline.getBoundingClientRect();
      const centreX = box.left + box.width / 2;
      const centreY = box.top + box.height / 2;

      for (const char of chars) {
        const rect = char.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - centreX;
        const dy = rect.top + rect.height / 2 - centreY;
        const distance = Math.hypot(dx, dy) || 1;

        // Generous distances: by the end of the travel the line should be off
        // the edges of the screen, not hovering near where it started. The
        // `abs` terms scale with how far out a letter already sits, so the
        // composition opens from the middle rather than sliding as a block.
        char.style.setProperty("--cx", String(Math.round((dx / distance) * (260 + Math.abs(dx) * 1.1))));
        char.style.setProperty("--cy", String(Math.round((dy / distance) * (210 + Math.abs(dy) * 2.6))));
        char.style.setProperty("--cr", String(Math.round((dx / distance) * 26)));
      }

      /*
       * The zone's own geometry, in DOCUMENT space, cached for the scroll loop.
       *
       * `update()` used to call `root.getBoundingClientRect()` on every frame,
       * which forces a synchronous layout — and it runs interleaved with the
       * other scroll listeners' writes, so each read had to flush their pending
       * style work first. Caching here makes the per-frame path pure
       * arithmetic:  rect.top === zoneTop - scrollY.
       *
       * Only reflows change these, and every reflow path already re-runs
       * `measure()`: resize, fonts landing, and the ResizeObserver below.
       */
      const zone = root.getBoundingClientRect();
      zoneTop = zone.top + window.scrollY;
      zoneHeight = zone.height;
    };

    let zoneTop = 0;
    let zoneHeight = 0;

    if (prefersReducedMotion()) return;

    measure();

    /*
     * The route draws with `stroke-dashoffset`, which needs the path's real
     * length in user units — there is no CSS way to ask for it. Measured once
     * and written as `--len`, after which the draw is pure arithmetic on
     * `--op-p` like everything else.
     */
    root.classList.add("op-scrub");

    let frame = 0;

    const update = () => {
      frame = 0;
      // The travel is the zone's height less the one viewport the sticky
      // background occupies. `-rect.top` is `scrollY - zoneTop`; see measure().
      const travel = zoneHeight - window.innerHeight;
      const progress = travel > 0 ? (window.scrollY - zoneTop) / travel : 0;
      root.style.setProperty("--op-p", Math.min(Math.max(progress, 0), 1).toFixed(4));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    const onResize = () => {
      // Vectors are pixel distances taken at one layout; a resize changes the
      // type size and every one of them is then wrong.
      root.style.setProperty("--op-p", "0");
      measure();
      onScroll();
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    // Web fonts land after mount and change every glyph's width, so the first
    // measurement is taken against fallback metrics.
    document.fonts?.ready.then(onResize);

    /*
     * Now that the zone's geometry is cached rather than read per frame, any
     * height change that fires no resize event would leave the cache stale —
     * and this zone contains the live record panels, which grow when their
     * request lands. Watching the box itself catches that.
     */
    const observer = new ResizeObserver(onResize);
    observer.observe(root);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
      root.classList.remove("op-scrub");
    };
  }, [stats]);

  const currency = stats?.currency ?? "inr";

  const topOrganizations = organizations?.items ?? [];
  const grants = openGrants?.items ?? [];
  /* The biggest raiser sets the scale for the bars, so the longest is full
     width and the rest are honestly proportional to it — never a fixed ramp. */
  const largestRaised = Math.max(
    1,
    ...topOrganizations.map((organization) => organization.totalRaisedMinor),
  );

  /**
   * Each screen: the figure on the left, the RECORDS BEHIND IT on the right.
   *
   * The panel is the point. A statistic on an empty field is a claim; the same
   * statistic beside the rows it was computed from is a receipt, and this
   * product's entire argument is that it can show the rows.
   */
  const figures = [
    {
      value: stats ? formatMoneyCompact(stats.totalRaisedMinor, currency) : "—",
      label: "given so far",
      body: "Summed from completed donations — not pledges, not intentions. Every one has a receipt with a number on it.",
      panelTitle: "Where it went",
      rows: topOrganizations.length,
      emptyLine: "Fetching the organisations this was given to…",
      panel: (
        /*
          Pointing at one organisation recedes the other five, so a list of six
          figures becomes one figure at a time. Its rule thickens and takes the
          accent, which is the only moment on this panel where a bar is allowed
          to be loud.

          A named CSS group rather than component state: hover state here would
          re-render the whole opening on every pointer move across the list, and
          this panel sits inside a scroll-scrubbed zone that cannot afford it.
        */
        <ul className="group/orgs space-y-3.5">
          {topOrganizations.slice(0, 6).map((organization) => (
            <li
              key={organization.id}
              className="group/row opacity-100 transition-opacity duration-300 ease-out-soft group-hover/orgs:opacity-40 hover:!opacity-100"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="truncate text-sm text-[hsl(var(--paper)/0.82)] transition-colors duration-300 group-hover/row:text-[hsl(var(--paper))]">
                  {organization.name}
                </span>
                <span className="tnum shrink-0 text-sm font-semibold text-accent">
                  {formatMoneyCompact(organization.totalRaisedMinor, organization.currency)}
                </span>
              </div>
              {/* Proportional to the largest raiser, so the bars compare
                  against each other rather than against nothing. */}
              <div className="mt-1.5 h-px w-full bg-[hsl(var(--paper)/0.12)] transition-all duration-300 ease-out-soft group-hover/row:h-0.5">
                <div
                  className="h-full bg-[hsl(var(--paper)/0.55)] transition-colors duration-300 ease-out-soft group-hover/row:bg-accent"
                  style={{
                    width: `${Math.max(4, Math.round((organization.totalRaisedMinor / largestRaised) * 100))}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      ),
    },
    {
      value: stats ? `${stats.verifiedOrganizations}/${stats.organizations}` : "—",
      label: "organisations verified",
      body: "A person read their registration documents and signed off before the page went live. The date of that decision is printed on every profile.",
      panelTitle: "Checked, one by one",
      rows: topOrganizations.length,
      emptyLine: "Fetching the verification record…",
      panel: (
        <ul className="grid grid-cols-2 gap-x-6 gap-y-3">
          {topOrganizations.map((organization) => (
            <li
              key={organization.id}
              className="flex items-baseline gap-2 border-b border-[hsl(var(--paper)/0.1)] pb-2"
            >
              <Check
                className={
                  organization.verified
                    ? "h-3 w-3 shrink-0 translate-y-0.5 text-primary"
                    : "h-3 w-3 shrink-0 translate-y-0.5 text-[hsl(var(--paper)/0.3)]"
                }
              />
              <span className="min-w-0 flex-1 truncate text-xs text-[hsl(var(--paper)/0.8)]">
                {organization.name}
              </span>
              <span className="shrink-0 text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--paper)/0.4)]">
                {organization.city ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      value: stats ? String(stats.openGrants) : "—",
      label: "grants open right now",
      body: "Each publishes its eligibility rules, its deadline and the size of its fund up front — and every decision made on it is written to an audit log.",
      panelTitle: "Taking applications",
      rows: grants.length,
      emptyLine: "Fetching the grants currently open…",
      panel: (
        <ul className="space-y-4">
          {grants.map((grant) => {
            const daysLeft = Math.max(
              0,
              Math.ceil((new Date(grant.deadline).getTime() - Date.now()) / 86_400_000),
            );

            return (
              <li key={grant.id} className="border-b border-[hsl(var(--paper)/0.12)] pb-4">
                <p className="text-sm font-semibold text-[hsl(var(--paper)/0.9)]">
                  {grant.title}
                </p>
                <p className="tnum mt-1.5 flex flex-wrap items-baseline gap-x-4 text-xs text-[hsl(var(--paper)/0.55)]">
                  <span className="font-semibold text-accent">
                    {formatMoneyCompact(grant.amountMinor, grant.currency)}
                  </span>
                  <span>{daysLeft} days left</span>
                  <span>
                    {grant.categories.slice(0, 2).map((category) => category.name).join(" · ")}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      ),
    },
  ];

  return (
    <div
      ref={rootRef}
      /* `--ink` / `--paper`: the theme-INDEPENDENT pair. The semantic tokens
         swap with the theme and would invert this whole zone in dark mode
         (HANDOFF §3.3). 3.4 screens is the explode distance — the F1 dashboard
         spends three on its car, and the length is load-bearing for the same
         reason: too short and it never finishes coming apart. */
      /*
       * `min-h`, NOT `h`. With a fixed height the foreground — one empty screen,
       * three figures at 80svh each and the buttons — added up taller than the
       * zone, and the last block hung out of the bottom and landed on top of
       * the section below it. A zone whose height is a constant while its
       * content is not is a bug waiting for a longer sentence.
       */
      className="relative min-h-[340svh] bg-[hsl(var(--ink))] text-[hsl(var(--paper))]"
    >
      {/* ── Background: the headline, exploding ─────────────────────────── */}
      {/*
        `-mb-[100svh]` is what pulls the foreground up over this layer. The
        sticky element still occupies its screen and sticks normally; the
        negative margin only stops it consuming a screen of the zone's height.
      */}
      <div className="op-ground sticky top-0 -mb-[100svh] flex h-svh items-center overflow-hidden">
        <div className="w-full px-6">
          <h1
            className="op-headline mx-auto max-w-[110rem] font-grotesk uppercase leading-[0.8] tracking-[-0.05em]"
            style={{
              /*
               * Archivo's width axis at its narrow extreme. The face has
               * carried 62–125% all along and this site only ever used the
               * middle of it; at 62% and weight 900 it is effectively a
               * different typeface, for no extra download. Narrow is also what
               * lets a line this large stay a line rather than a wall.
               */
              fontStretch: "62%",
              fontWeight: 900,
              /*
               * Sized against viewport HEIGHT as well as width. `16vw` alone
               * gave 205px a line, which put 935px of content into a 900px
               * panel and clipped the call to action off the bottom.
               */
              fontSize: "clamp(2.75rem, min(15vw, 17svh), 13rem)",
            }}
          >
            <SplitLine text="Funding that" className="op-line block" />
            <SplitLine text="actually reaches" className="op-line block" />
            <SplitLine text="the ground." className="op-line block text-accent" />
            <span className="sr-only">
              Funding that actually reaches the ground.
            </span>
          </h1>
        </div>



        {/*
          The wash. Strengthens as you descend so the figures crossing in front
          stay legible against whatever the letters are doing behind them — the
          F1 dashboard rides its scenes over the exploded car the same way, at
          60% ink. Inert, above the type, below the route and the foreground.
        */}
        <div aria-hidden="true" className="op-wash pointer-events-none absolute inset-0" />
      </div>

      {/* ── Foreground: what scrolls over it ────────────────────────────── */}
      <div className="relative z-10">
        {/* Screen one is deliberately almost empty: the headline gets the
            opening to itself before anything travels across it. */}
        <section className="flex h-svh flex-col justify-between px-6 pb-10 pt-24">
          <p className="op-chrome mx-auto w-full max-w-[110rem] text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--paper)/0.55)]">
            Verified nonprofits · transparent grants
          </p>
          <p className="op-chrome mx-auto inline-flex w-full max-w-[110rem] items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--paper)/0.55)]">
            <ArrowDown className="h-3 w-3" />
            Keep scrolling
          </p>
        </section>

        {/*
          Every figure is read live from /stats/public, which serves only values
          derivable from a row count or a SUM — which is why this opening is
          allowed to put them at this size.
        */}
        {figures.map((figure, index) => (
          <section
            key={figure.label}
            className="flex min-h-[85svh] items-center px-6 py-16"
          >
            <div className="mx-auto grid w-full max-w-[110rem] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
              {/* ── The figure ─────────────────────────────────────────── */}
              <div className="border-l-2 border-primary pl-6 sm:pl-8">
                <p className="tnum text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--paper)/0.55)]">
                  {String(index + 1).padStart(2, "0")} / 03
                </p>
                <p
                  className="tnum mt-5 font-grotesk font-extrabold leading-none text-[hsl(var(--paper))]"
                  style={{ fontStretch: "76%", fontSize: "clamp(3.5rem, 9vw, 8rem)" }}
                >
                  {figure.value}
                </p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                  {figure.label}
                </p>
                <p className="mt-5 max-w-md text-base leading-relaxed text-[hsl(var(--paper)/0.72)]">
                  {figure.body}
                </p>
              </div>

              {/*
                ── The records behind it ────────────────────────────────────
                This half of the screen was empty ink. Texture did not fix it
                and a giant outlined numeral did not either — both were
                decoration standing in for content. What belongs here is the
                evidence: the organisations, their money, the live grants. Real
                rows, from the same public endpoints Browse and Grants use.

                Slightly translucent over the exploding headline, so the letters
                still read through the panel rather than being boxed out.
              */}
              {/*
                No `backdrop-blur` here, deliberately — it used to carry
                `backdrop-blur-[2px]`.

                A backdrop filter forces the browser to re-sample and re-blur
                everything painted underneath the element on every frame it
                changes. This panel sits directly over the exploding headline,
                whose letters are transformed on every scroll frame, so the
                backdrop was being re-blurred continuously through the whole
                opening — the single most expensive scroll section on the site.
                AppLayout's header and Dialog's scrim both already refuse
                backdrop-blur for exactly this reason; this one had slipped
                through.

                At 2px the blur was barely perceptible anyway. The ink fill goes
                0.55 -> 0.62 to recover the legibility the blur was providing,
                which costs nothing to paint.
              */}
              <div className="rounded-sm border border-[hsl(var(--paper)/0.14)] bg-[hsl(var(--ink)/0.62)] p-6 sm:p-8">
                <p className="mb-6 flex items-baseline justify-between gap-4 border-b border-[hsl(var(--paper)/0.14)] pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--paper)/0.5)]">
                  {figure.panelTitle}
                  <span className="text-[hsl(var(--paper)/0.55)]">Live</span>
                </p>

                {/*
                  An empty panel is worse than no panel — a bordered box with a
                  heading and nothing under it reads as broken, which is exactly
                  the complaint this whole section exists to answer. The rows
                  come from the network, so "nothing yet" is a state that WILL
                  happen: first paint, a slow request, an API that is down.
                  Say so in a line rather than showing a hole.
                */}
                {figure.rows > 0 ? (
                  figure.panel
                ) : (
                  <p className="text-sm leading-relaxed text-[hsl(var(--paper)/0.55)]">
                    {figure.emptyLine}
                  </p>
                )}
              </div>
            </div>
          </section>
        ))}

        <section className="flex items-center px-6 pb-24 pt-12">
          <div className="mx-auto w-full max-w-[110rem]">
            <div className="flex flex-wrap items-center gap-4 border-t border-[hsl(var(--paper)/0.15)] pt-10">
              <Link
                to="/browse"
                className="group inline-flex h-12 items-center gap-2 rounded-lg bg-[hsl(var(--paper))] px-6 text-sm font-semibold text-[hsl(var(--ink))] transition-all duration-200 ease-out-soft active:scale-[0.97]"
              >
                Explore nonprofits
                <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out-soft group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/grants"
                className="text-sm font-semibold text-[hsl(var(--paper)/0.8)] underline-offset-8 transition-colors hover:text-[hsl(var(--paper))] hover:underline"
              >
                Browse grants
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
