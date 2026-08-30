import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { z } from "zod";
import { passwordSchema } from "@impactbridge/shared";
import { apiPost, ApiError } from "@/lib/api";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

/**
 * The form adds a confirm-password field on top of the shared schema.
 *
 * `.refine` runs after the individual fields validate, and `path` attaches the
 * mismatch error to confirmPassword so it renders under the right input.
 * Confirmation is purely a UX guard against typos — the API neither needs nor
 * receives this field.
 */
const resetFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetFormValues = z.infer<typeof resetFormSchema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const res = await apiPost<{ message: string }>("/auth/reset-password", {
        token,
        password: values.password,
      });
      setDoneMessage(res.message);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    }
  });

  if (!token) {
    return (
      <AuthLayout title="Invalid reset link">
        <Alert variant="error">
          This link is missing its reset token. Request a new one from the
          forgot-password page.
        </Alert>
        <Link
          to="/forgot-password"
          className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Signing in everywhere else will be reset for security."
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {doneMessage ? (
        <div className="space-y-4">
          <Alert variant="success">{doneMessage}</Alert>
          <Link
            to="/login"
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError && <Alert variant="error">{formError}</Alert>}

          <Field
            label="New password"
            htmlFor="password"
            error={errors.password?.message}
            hint="At least 8 characters, with an uppercase letter and a number."
          >
            <PasswordInput
              id="password"
              autoComplete="new-password"
              placeholder="••••••••"
              hasError={!!errors.password}
              aria-invalid={!!errors.password}
              {...register("password")}
            />
          </Field>

          <Field
            label="Confirm new password"
            htmlFor="confirmPassword"
            error={errors.confirmPassword?.message}
          >
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              placeholder="••••••••"
              hasError={!!errors.confirmPassword}
              aria-invalid={!!errors.confirmPassword}
              {...register("confirmPassword")}
            />
          </Field>

          <Button type="submit" fullWidth isLoading={isSubmitting}>
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
