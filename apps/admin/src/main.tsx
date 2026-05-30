import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import "./index.css";
import { queryClient } from "@/lib/query-client";
import { router } from "@/router";
import { useAuthStore } from "@/lib/auth-store";
import { BrandGlyph, Wordmark } from "@/components/brand";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

function Splash() {
  return (
    <div className="bg-background flex min-h-svh items-center justify-center">
      <div className="flex animate-pulse items-center gap-3">
        <BrandGlyph size={40} />
        <Wordmark size={24} />
      </div>
    </div>
  );
}

function Root() {
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Re-run route guards when auth state changes (e.g. token expiry / logout).
  useEffect(() => {
    if (status !== "loading") void router.invalidate();
  }, [status]);

  if (status === "loading") return <Splash />;
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delay={200}>
        <Root />
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
