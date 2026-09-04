import { useState } from "react";
import { useDonations, useDonorStats } from "@/api/donations";
import { useBookmarkedOrganizations } from "@/api/organizations";
import { ContributionTimeline } from "@/components/donor/ContributionTimeline";
import { GivingOverview } from "@/components/donor/GivingOverview";
import { ImpactStory } from "@/components/donor/ImpactStory";
import { SavedOrganisations } from "@/components/donor/SavedOrganisations";

export function DonorDashboard() {
  const [page, setPage] = useState(1);
  const { data: stats, isPending: statsPending } = useDonorStats();
  const { data: donations, isPending: donationsPending } = useDonations(page);
  const { data: bookmarks } = useBookmarkedOrganizations();

  return (
    /*
     * No `space-y` here. Each section carries its own vertical padding and a
     * hairline rule, so an extra gap between them would push the rules away
     * from the content they divide and break the one rhythm holding the page
     * together.
     */
    <div>
      <GivingOverview stats={stats} isPending={statsPending} />

      <ImpactStory donations={donations?.items} isPending={donationsPending} />

      <ContributionTimeline
        donations={donations}
        isPending={donationsPending}
        page={page}
        onPageChange={setPage}
      />

      <SavedOrganisations bookmarks={bookmarks} />
    </div>
  );
}
