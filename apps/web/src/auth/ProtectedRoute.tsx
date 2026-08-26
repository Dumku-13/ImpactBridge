import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { Role } from "@impactbridge/shared";
import { useAuth } from "./AuthContext";
import { homeForRole } from "./routes";
import { FullPageSpinner } from "@/components/ui/FullPageSpinner";

/**
 * Route guard.
 *
 * Important framing: this is UX, not security. A determined user can edit their
 * own JavaScript and render any page they like — which is exactly why every
 * protected endpoint on the server independently enforces requireAuth and
 * requireRole. The client guard just prevents honest users from seeing broken
 * or empty screens.
 */
export function ProtectedRoute({ allow }: { allow?: Role[] }) {
  const { user, isBootstrapping } = useAuth();
  const location = useLocation();

  // Wait for the refresh-cookie check before deciding — otherwise we'd flash
  // the login page for a user who is in fact signed in.
  if (isBootstrapping) return <FullPageSpinner />;

  if (!user) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allow && !allow.includes(user.role)) {
    // Signed in, wrong role → send them to their own dashboard.
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  return <Outlet />;
}

/** For /login and /signup: a signed-in user shouldn't see these at all. */
export function PublicOnlyRoute() {
  const { user, isBootstrapping } = useAuth();

  if (isBootstrapping) return <FullPageSpinner />;
  if (user) return <Navigate to={homeForRole(user.role)} replace />;

  return <Outlet />;
}
