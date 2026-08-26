/**
 * One import site for every role's dashboard, so the router doesn't need to
 * know where each one lives.
 *
 * All four are now fully built (Donor: Phase 2, NGO: Phase 3, Funder: Phase 4,
 * Admin: Phase 5), so the shared placeholder they started from is gone.
 */
export { DonorDashboard } from "./DonorDashboard";
export { NgoDashboard } from "./NgoDashboard";
export { FunderDashboard } from "./FunderDashboard";
export { AdminDashboard } from "./AdminDashboard";
