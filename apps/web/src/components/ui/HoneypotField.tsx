import { forwardRef } from "react";

/**
 * The honeypot input. Renders nothing a person can perceive or reach.
 *
 * Hidden by POSITION, deliberately not by `display: none` or `visibility:
 * hidden`. The cheap scrapers this catches are cheap precisely because they
 * skip fields the browser reports as unrendered — hiding it the obvious way
 * hides it from the bots too, and the trap catches nothing. Moving it off-screen
 * leaves it a fully real, fully rendered input that only a script would find.
 *
 * Each of the four attributes closes a different way a HUMAN could stumble into
 * it, which matters because anyone who does is refused a login they are entitled
 * to:
 *
 *   `aria-hidden`     — a screen reader never announces it, so it cannot be
 *                       filled by someone navigating the form by voice or braille.
 *   `tabIndex={-1}`   — Tab skips it, so it cannot be filled by someone who
 *                       never touches the mouse.
 *   `autoComplete="off"` — a password manager or the browser's own autofill
 *                       does not helpfully drop an address into it. This is the
 *                       likeliest false positive of the four by far.
 *   the label + name  — plausible enough ("company") that a form-filling script
 *                       wants to complete it.
 */
export const HoneypotField = forwardRef<HTMLInputElement>((_props, ref) => (
  <div
    aria-hidden="true"
    style={{
      position: "absolute",
      left: "-9999px",
      top: "auto",
      width: "1px",
      height: "1px",
      overflow: "hidden",
    }}
  >
    <label htmlFor="_hp">Company (leave this field empty)</label>
    <input
      ref={ref}
      id="_hp"
      name="_hp"
      type="text"
      defaultValue=""
      tabIndex={-1}
      autoComplete="off"
    />
  </div>
));
HoneypotField.displayName = "HoneypotField";
