import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { useState } from "react";
import { Building2, HandCoins, Heart, MailCheck } from "lucide-react";
import {
  registerSchema,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type RegisterInput,
  type SignupRole,
} from "@impactbridge/shared";
import { apiPost, ApiError } from "@/lib/api";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS: Array<{ value: SignupRole; icon: typeof Heart }> = [
  { value: "DONOR", icon: Heart },
  { value: "NGO_ADMIN", icon: Building2 },
  { value: "FUNDER", icon: HandCoins },
];

export function SignupPage() {
  const [formError, setFormError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", role: "DONOR" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await apiPost("/auth/register", values);
      setRegisteredEmail(values.email);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    }
  });

  // Success state — registration deliberately does NOT log you in; the account
  // is inert until the emailed link is clicked.
  if (registeredEmail) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={`We've sent a verification link to ${registeredEmail}.`}
      >
        <div className="space-y-4">
          <div className="flex justify-center rounded-lg border border-border bg-secondary p-8">
            <MailCheck className="h-10 w-10 text-primary" />
          </div>
          <Alert variant="info">
            Click the link in that email to activate your account, then sign in.
            {import.meta.env.DEV && (
              <span className="mt-2 block text-xs">
                <strong>Dev tip:</strong> the link is printed in the API
                terminal — no real email is sent.
              </span>
            )}
          </Alert>
          <Link
            to="/login"
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Go to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Choose how you'll use ImpactBridge."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {formError && <Alert variant="error">{formError}</Alert>}

        {/*
          Role picker as radio cards. `Controller` bridges RHF and a custom
          control — plain register() only works for native inputs.
          Rendered as a real radiogroup so it's keyboard and screen-reader
          navigable, not a div pretending to be a control.
        */}
        <Controller
          name="role"
          control={control}
          render={({ field }) => (
            <fieldset className="space-y-2">
              <legend className="mb-2 block text-sm font-medium text-foreground">
                I am a…
              </legend>
              <div role="radiogroup" className="grid gap-2">
                {ROLE_OPTIONS.map(({ value, icon: Icon }) => {
                  const selected = field.value === value;
                  return (
                    <label
                      key={value}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-secondary",
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name={field.name}
                        value={value}
                        checked={selected}
                        onChange={() => field.onChange(value)}
                        onBlur={field.onBlur}
                      />
                      <Icon
                        className={cn(
                          "mt-0.5 h-5 w-5 shrink-0",
                          selected ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {ROLE_LABELS[value]}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {ROLE_DESCRIPTIONS[value]}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        />

        <Field label="Full name" htmlFor="name" error={errors.name?.message}>
          <Input
            id="name"
            autoComplete="name"
            placeholder="Aditi Rao"
            hasError={!!errors.name}
            aria-invalid={!!errors.name}
            {...register("name")}
          />
        </Field>

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

        <Field
          label="Password"
          htmlFor="password"
          error={errors.password?.message}
          hint="At least 8 characters, with an uppercase letter and a number."
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            hasError={!!errors.password}
            aria-invalid={!!errors.password}
            {...register("password")}
          />
        </Field>

        <Button type="submit" fullWidth isLoading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
