import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Props {
  children: ReactNode;
  /**
   * When this value changes, a boundary that is currently showing its fallback
   * resets itself. We pass the current pathname, so navigating away from a
   * broken page recovers instead of leaving the error stuck on screen forever.
   */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * React unmounts the ENTIRE tree when a render throws and nothing catches it —
 * which is why a single bad `.map()` on the grants page turned the whole app
 * into a blank white screen with no clue as to why.
 *
 * A boundary converts that into a contained, readable failure. This has to be a
 * class component: `getDerivedStateFromError` has no hooks equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the component stack in the console — it names the component that
    // actually threw, which the message alone does not.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-20 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </span>

        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Something broke on this page
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The rest of the app is still fine — try again, or head back and
            retrace your steps.
          </p>
        </div>

        {/*
          In dev the message is the whole point of being here; in production it
          is noise at best and an information leak at worst.
        */}
        {import.meta.env.DEV && (
          <pre className="w-full overflow-x-auto rounded-lg border border-border bg-secondary p-3 text-left text-xs text-muted-foreground">
            {error.message}
          </pre>
        )}

        <div className="flex gap-2">
          <Button type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.assign("/")}
          >
            Go home
          </Button>
        </div>
      </div>
    );
  }
}
