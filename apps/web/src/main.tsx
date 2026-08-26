import React, { Suspense, lazy, type ComponentType } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute, PublicOnlyRoute } from "./auth/ProtectedRoute";
import { AppLayout } from "./components/layout/AppLayout";
import { ToastProvider } from "./components/ui/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PageFallback } from "./components/PageFallback";
import { LoginPage } from "./pages/auth/LoginPage";
/*
 * Self-hosted variable fonts. `soft` carries Fraunces' SOFT axis (the warmth in
 * the headings) at roughly half the weight of the all-axes file; Manrope ships
 * weight only. Bundled rather than fetched from a CDN: no third-party request,
 * no layout shift waiting on someone else's server, and it works offline.
 */
import "@fontsource-variable/fraunces/soft.css";
import "@fontsource-variable/manrope";
// `wdth` rather than the default: it carries the width axis as well as weight,
// which is the point of using Archivo for display type.
import "@fontsource-variable/archivo/wdth.css";
import "./index.css";

/**
 * Every page used to be imported eagerly, which meant one ~550KB bundle: a
 * visitor landing on /login still downloaded and parsed all four dashboards,
 * the 800-line application detail page, react-hook-form and zod before anything
 * appeared. Splitting per route means each page arrives when it's actually
 * needed.
 *
 * The pages use named exports, so each needs mapping to the `default` shape
 * `React.lazy` expects — hence this helper rather than 18 repetitions of it.
 *
 * Login stays eager as a common entry point. Home does NOT: it is the only
 * route that uses GSAP, and importing it eagerly pulled GSAP + ScrollTrigger
 * (~70KB) into the shared entry chunk that every other route loads — so
 * signing in or opening a dashboard paid for scroll choreography it never
 * runs. Splitting it costs one round trip on the landing page and takes the
 * shared chunk from 127KB to well under 100KB gzipped.
 */
function lazyPage(
  loader: () => Promise<Record<string, unknown>>,
  exportName: string,
) {
  return lazy(async () => ({
    default: (await loader())[exportName] as ComponentType,
  }));
}

const HomePage = lazyPage(() => import("./pages/HomePage"), "HomePage");
const SignupPage = lazyPage(() => import("./pages/auth/SignupPage"), "SignupPage");
const VerifyEmailPage = lazyPage(() => import("./pages/auth/VerifyEmailPage"), "VerifyEmailPage");
const ForgotPasswordPage = lazyPage(() => import("./pages/auth/ForgotPasswordPage"), "ForgotPasswordPage");
const ResetPasswordPage = lazyPage(() => import("./pages/auth/ResetPasswordPage"), "ResetPasswordPage");
const BrowsePage = lazyPage(() => import("./pages/BrowsePage"), "BrowsePage");
const GrantsPage = lazyPage(() => import("./pages/GrantsPage"), "GrantsPage");
const GrantDetailPage = lazyPage(() => import("./pages/GrantDetailPage"), "GrantDetailPage");
const ApplyPage = lazyPage(() => import("./pages/ApplyPage"), "ApplyPage");
const ApplicationDetailPage = lazyPage(() => import("./pages/ApplicationDetailPage"), "ApplicationDetailPage");
const MyApplicationsPage = lazyPage(() => import("./pages/MyApplicationsPage"), "MyApplicationsPage");
const GrantApplicantsPage = lazyPage(() => import("./pages/GrantApplicantsPage"), "GrantApplicantsPage");
const OrganizationProfilePage = lazyPage(() => import("./pages/OrganizationProfilePage"), "OrganizationProfilePage");
const DonationSuccessPage = lazyPage(() => import("./pages/DonationSuccessPage"), "DonationSuccessPage");

// Imported from their own files rather than the barrel, or all four dashboards
// would land in a single chunk and a donor would download the admin console.
const DonorDashboard = lazyPage(() => import("./pages/dashboards/DonorDashboard"), "DonorDashboard");
const NgoDashboard = lazyPage(() => import("./pages/dashboards/NgoDashboard"), "NgoDashboard");
const FunderDashboard = lazyPage(() => import("./pages/dashboards/FunderDashboard"), "FunderDashboard");
const AdminDashboard = lazyPage(() => import("./pages/dashboards/AdminDashboard"), "AdminDashboard");

/**
 * React Query owns all *server* state (fetching, caching, refetching, loading
 * and error flags) so we never hand-roll useEffect + useState for data.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't retry auth failures — the api client already handles token
      // refresh, so a persistent 401 means genuinely signed out.
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* AuthProvider sits inside the router so its hooks can navigate. */}
        <AuthProvider>
          {/*
            ToastProvider wraps the routes rather than sitting beside them, so
            any page or mutation can raise a confirmation. It portals to
            document.body, so its position here costs no layout.
          */}
          {/*
            Outermost net. Pages under AppLayout have their own boundary that
            keeps the header alive; this one catches everything else (home, the
            auth pages) so no throw can ever blank the document again.
          */}
          <ToastProvider>
          <ErrorBoundary>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<HomePage />} />

                {/* Signed-out only — a logged-in user is bounced to their dashboard */}
                <Route element={<PublicOnlyRoute />}>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignupPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                </Route>

                {/* Reachable either way — they arrive from an email link */}
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />

                {/*
                  ONE AppLayout for every page that has the app shell. It used to
                  be declared twice — once for public browsing, once inside
                  ProtectedRoute — which made React Router treat them as different
                  elements: going from /browse to /donor unmounted the whole
                  shell and rebuilt the header, the notification bell and its
                  socket subscription. Nesting the guards inside a single layout
                  keeps that node stable across navigation.
                */}
                <Route element={<AppLayout />}>
                  {/*
                    Public browsing — no sign-in required. Discovery being open
                    is deliberate: donors should be able to explore before
                    committing to an account.
                  */}
                  <Route path="/browse" element={<BrowsePage />} />
                  <Route path="/grants" element={<GrantsPage />} />
                  <Route path="/grants/:slug" element={<GrantDetailPage />} />
                  <Route path="/ngo/:slug" element={<OrganizationProfilePage />} />

                  {/* Signed-in, role-gated */}
                  <Route element={<ProtectedRoute />}>
                    <Route element={<ProtectedRoute allow={["DONOR"]} />}>
                      <Route path="/donor" element={<DonorDashboard />} />
                      <Route
                        path="/donate/complete"
                        element={<DonationSuccessPage />}
                      />
                    </Route>
                    <Route element={<ProtectedRoute allow={["NGO_ADMIN"]} />}>
                      <Route path="/ngo" element={<NgoDashboard />} />
                      <Route path="/ngo/applications" element={<MyApplicationsPage />} />
                      <Route path="/grants/:slug/apply" element={<ApplyPage />} />
                    </Route>
                    <Route element={<ProtectedRoute allow={["NGO_ADMIN", "FUNDER", "PLATFORM_ADMIN"]} />}>
                      <Route path="/applications/:id" element={<ApplicationDetailPage />} />
                    </Route>

                    <Route element={<ProtectedRoute allow={["FUNDER"]} />}>
                      <Route path="/funder" element={<FunderDashboard />} />
                      <Route path="/funder/grants/:grantId/applicants" element={<GrantApplicantsPage />} />
                    </Route>
                    <Route element={<ProtectedRoute allow={["PLATFORM_ADMIN"]} />}>
                      <Route path="/admin" element={<AdminDashboard />} />
                    </Route>
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
