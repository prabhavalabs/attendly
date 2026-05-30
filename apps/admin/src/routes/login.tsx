import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { loginSchema, type LoginInput } from "@tuition/shared";

import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { BrandGlyph, Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  account_suspended: "Your account has been suspended. Contact an administrator.",
  validation_error: "Please check the details you entered.",
};

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    try {
      await login(values.email, values.password);
      navigate({ to: "/" });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "request_failed";
      const message =
        ERROR_MESSAGES[code] ?? "Could not sign in. Please try again.";
      form.setError("password", { message });
      toast.error(message);
    }
  }

  return (
    <main className="bg-background flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex items-center gap-3">
          <BrandGlyph size={44} />
          <Wordmark size={26} />
        </div>

        {/* Card motif: white surface, layered shadow, teal edge band */}
        <div
          className="bg-card relative overflow-hidden rounded-2xl border"
          style={{ boxShadow: "var(--sh-card)" }}
        >
          <span
            className="absolute inset-y-0 left-0 w-1.5"
            style={{ background: "var(--brand-600)" }}
            aria-hidden
          />
          <div className="p-7 pl-8">
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Sign in to the attendly admin portal.
            </p>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 grid gap-4" noValidate>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          autoComplete="email"
                          placeholder="you@institute.lk"
                          autoFocus
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="current-password"
                          placeholder="••••••••"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  size="lg"
                  className="mt-1 w-full"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </Form>
          </div>
        </div>

        <p className="text-muted-foreground mt-6 text-center text-xs">
          attendly — attendance, billing &amp; notifications.
        </p>
      </div>
    </main>
  );
}
