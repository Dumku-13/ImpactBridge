import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { useState } from "react";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@impactbridge/shared";
import { apiPost, ApiError } from "@/lib/api";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { HoneypotField } from "@/components/ui/HoneypotField";
import { useBotGuard } from "@/hooks/useBotGuard";

export function ForgotPasswordPage() {
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  // The bot trap: forgot-password makes us send mail to an address the sender
  // chose, which is exactly what a spam script wants. See useBotGuard.
  const { trapRef, getBotFields } = useBotGuard();

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      // Note: the API returns the same generic message whether or not the
      // account exists, so this page cannot be used to discover who's registered.
      const res = await apiPost<{ message: string }>(
        "/auth/forgot-password",
        { ...values, ...getBotFields() },
      );
      setSentMessage(res.message);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    }
  });

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sentMessage ? (
        <Alert variant="success">
          {sentMessage}
          {import.meta.env.DEV && (
            <span className="mt-2 block text-xs">
              <strong>Dev tip:</strong> the reset link is printed in the API
              terminal.
            </span>
          )}
        </Alert>
      ) : (
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
              {...register("email")}
            />
          </Field>

          <Button type="submit" fullWidth isLoading={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
