import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";
import { AuthLayout } from "@/components/layout/AuthLayout";

type Status = "verifying" | "success" | "error";

/**
 * Landing page for the emailed verification link (/verify-email?token=…).
 * It reads the token from the query string and posts it to the API.
 */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState("");

  /*
   * React 18 StrictMode intentionally runs effects twice in development. Since
   * verification tokens are SINGLE-USE, a naive effect would consume the token
   * on the first run and then show "invalid link" on the second. This ref makes
   * the request fire exactly once.
   */
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    if (!token) {
      setStatus("error");
      setMessage("This link is missing its verification token.");
      return;
    }

    apiPost<{ message: string }>("/auth/verify-email", { token })
      .then((res) => {
        setStatus("success");
        setMessage(res.message);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(
          err instanceof ApiError
            ? err.message
            : "We couldn't verify your email. Try again.",
        );
      });
  }, [token]);

  return (
    <AuthLayout title="Email verification">
      <div className="space-y-5">
        {status === "verifying" && (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Verifying your email…</span>
          </div>
        )}

        {status === "success" && (
          <>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-primary" />
              <p className="text-sm text-foreground">{message}</p>
            </div>
            <Link
              to="/login"
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign in
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-destructive" />
              <p className="text-sm text-foreground">{message}</p>
            </div>
            <Link
              to="/signup"
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Back to sign up
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
