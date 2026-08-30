import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, type InputProps } from "./Input";
import { cn } from "@/lib/utils";

/**
 * A password field with a show/hide toggle.
 *
 * Wraps `Input` rather than replacing it, so the border, focus ring, error
 * state and sizing stay defined in exactly one place — a forked copy of those
 * classes would drift the moment the palette is retuned.
 *
 * `forwardRef` is not optional here: React Hook Form's `register()` hands back a
 * `ref` and RHF cannot read, focus or reset the field without it. Swallowing the
 * ref produces a form that validates but whose "focus the first invalid field"
 * behaviour silently does nothing.
 */
export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const label = visible ? "Hide password" : "Show password";

    return (
      <div className="relative">
        {/*
          The toggle sits BEFORE the input in the DOM, and is pulled onto the
          right edge with absolute positioning.

          The obvious markup puts it after the input, which reads correctly but
          wedges a button between the last field and the submit button: every
          keyboard user signing in then tabs password → eye → Sign in, and the
          extra stop lands at the exact moment they are trying to submit.
          Ordering it first moves that stop to before they start typing, where
          it is also more useful — a screen reader announces that a reveal
          control exists on the way INTO the field rather than on the way out.

          It stays a genuine tab stop either way; `tabIndex={-1}` would tidy the
          order by making the control keyboard-unreachable, which is not a trade
          worth making.
        */}
        <button
          type="button"
          // Without `type="button"` this submits the form. Buttons inside a
          // <form> default to type="submit", so tapping the eye would post a
          // half-typed password.
          onClick={() => setVisible((current) => !current)}
          // `aria-pressed` is what makes this a toggle rather than an action:
          // the state is announced, not just the label. Both change, because a
          // pressed state alone reads as "Show password, pressed" — ambiguous
          // about whether the password is now showing.
          aria-pressed={visible}
          aria-label={label}
          title={label}
          className={cn(
            "absolute right-1 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md",
            "text-muted-foreground transition-all duration-200 ease-out-soft",
            "hover:bg-secondary hover:text-foreground active:scale-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>

        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          /*
           * `pr-11` reserves the button's width inside the field. Without it a
           * long password scrolls straight under the eye and the last few
           * characters are unreadable at precisely the moment the user revealed
           * them to check for a typo.
           */
          className={cn("pr-11", className)}
          /*
           * A revealed password is still not prose. Left to itself the browser
           * will underline it as a spelling mistake and, on mobile, capitalise
           * the first letter of what the user types.
           */
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          {...props}
        />
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
