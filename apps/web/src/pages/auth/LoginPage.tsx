import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { loginSchema, type LoginInput } from "@impactbridge/shared";
import { useAuth } from "@/auth/AuthContext";
import { homeForRole } from "@/auth/routes";
import { ApiError } from "@/lib/api";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { HoneypotField } from "@/components/ui/HoneypotField";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { useBotGuard } from "@/hooks/useBotGuard";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  // The honeypot input and the mount timestamp the server checks. See
  // `botGuardFields` in @impactbridge/shared for what it does with them.
  const { trapRef, getBotFields } = useBotGuard();

  /**
   * `zodResolver(loginSchema)` reuses the exact schema the API validates with.
   * The user gets instant feedback, and the server still re-validates — the
   * client check is convenience, the server check is the real boundary.
   */
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const user = await login({ ...values, ...getBotFields() });
      // Send them back where they were headed, else to their role's dashboard.
      /*
       * Rebuild the full target, not just the path. ProtectedRoute stores the
       * whole location, so dropping `search`/`hash` silently discarded things
       * like ?order_id=… — sending a donor back to a page that then couldn't
       * find their donation.
       */
      const stored = (location.state as { from?: Location })?.from;
      const from = stored
        ? `${stored.pathname}${stored.search ?? ""}${stored.hash ?? ""}`
        : undefined;

      navigate(from ?? homeForRole(user.role), { replace: true });
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    }
  });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue to ImpactBridge."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert variant="error">{formError}</Alert>}

        <HoneypotField ref={trapRef} />

        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            hasError={!!errors.email}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={errors.password?.message}
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="••••••••"
            hasError={!!errors.password}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
        </Field>

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" fullWidth isLoading={isSubmitting}>
          Sign in
        </Button>
      </form>

      {/* Dev convenience — makes the seeded accounts discoverable when demoing. */}
      {import.meta.env.DEV && (
        <div className="mt-6 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Demo accounts</p>
          <p>donor@ · ngo@ · funder@ · admin@impactbridge.dev</p>
          <p>Password: Password123</p>
        </div>
      )}
    </AuthLayout>
  );
}
