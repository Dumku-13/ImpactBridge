import { PrismaClient, type Role } from "@prisma/client";
import argon2 from "argon2";

/**
 * Seed script — creates demo accounts and a browseable set of organisations so
 * the app is immediately usable (and demoable) after a fresh migrate.
 *
 * Idempotent: every write is an upsert keyed on a natural unique field, so this
 * is safe to run repeatedly.
 *
 * Run with:  pnpm --filter @impactbridge/api db:seed
 */
const prisma = new PrismaClient();

const DEMO_PASSWORD = "Password123";

/** ₹1 = 100 paise. Money is stored in minor units everywhere. */
const rupees = (amount: number) => amount * 100;

const CATEGORIES = [
  {
    slug: "education",
    name: "Education",
    icon: "GraduationCap",
    description: "Schools, scholarships, and learning access.",
    sortOrder: 1,
  },
  {
    slug: "healthcare",
    name: "Healthcare",
    icon: "HeartPulse",
    description: "Clinics, treatment funds, and public health.",
    sortOrder: 2,
  },
  {
    slug: "women-empowerment",
    name: "Women Empowerment",
    icon: "Users",
    description: "Livelihoods, safety, and leadership for women.",
    sortOrder: 3,
  },
  {
    slug: "animals",
    name: "Animals",
    icon: "PawPrint",
    description: "Rescue, shelter, and wildlife conservation.",
    sortOrder: 4,
  },
  {
    slug: "disaster-relief",
    name: "Disaster Relief",
    icon: "LifeBuoy",
    description: "Emergency response and rebuilding.",
    sortOrder: 5,
  },
  {
    slug: "environment",
    name: "Environment",
    icon: "Leaf",
    description: "Climate, clean water, and conservation.",
    sortOrder: 6,
  },
];

interface DemoOrg {
  slug: string;
  name: string;
  mission: string;
  description: string;
  categories: string[];
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  foundedYear: number;
  website: string;
  fundingGoal: number;
  totalRaised: number;
  donorCount: number;
  rating: number;
  ratingCount: number;
  verified: boolean;
  coverUrl: string;
  metrics: Array<{ label: string; value: string; unit?: string }>;
  owner: { email: string; name: string };
}

const ORGANISATIONS: DemoOrg[] = [
  {
    slug: "vidya-jyoti-foundation",
    name: "Vidya Jyoti Foundation",
    /*
     * Edited through the NGO dashboard and kept — the line lives here, not just
     * in the database, because `db:seed` rewrites `mission` on every run and a
     * change made only to the row would silently revert on the next re-seed.
     */
    mission: "Education for rural girls in Karnataka",
    description:
      "Vidya Jyoti runs after-school learning centres in villages across Kalaburagi and Yadgir districts of north Karnataka, where most of our students are the first in their family to attend school. We combine daily academic support with a monthly stipend that offsets the income a child would otherwise earn, which is the single biggest reason families pull students out early. Every centre is staffed by teachers hired from the same community.",
    categories: ["education"],
    city: "Kalaburagi",
    state: "Karnataka",
    latitude: 17.3297,
    longitude: 76.8343,
    foundedYear: 2014,
    website: "https://example.org/vidya-jyoti",
    fundingGoal: rupees(2_500_000),
    totalRaised: rupees(1_840_000),
    donorCount: 412,
    rating: 4.8,
    ratingCount: 96,
    verified: true,
    coverUrl:
      "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=2000&q=80",
    metrics: [
      { label: "Students supported", value: "3,200", unit: "since 2014" },
      { label: "Class 12 completion", value: "94%" },
      { label: "Learning centres", value: "17" },
    ],
    owner: { email: "ngo@impactbridge.dev", name: "Ravi Menon" },
  },
  {
    slug: "aarogya-community-health",
    name: "Aarogya Community Health",
    mission:
      "Mobile clinics bringing primary care to villages without a doctor.",
    description:
      "Aarogya operates four mobile clinics across rural Karnataka, each visiting the same set of villages on a fixed weekly schedule so patients can rely on continuity of care. We focus on maternal health, diabetes and hypertension screening, and childhood immunisation — conditions where early detection changes outcomes dramatically but where the nearest clinic is often forty kilometres away.",
    categories: ["healthcare"],
    city: "Mysuru",
    state: "Karnataka",
    latitude: 12.2958,
    longitude: 76.6394,
    foundedYear: 2011,
    website: "https://example.org/aarogya",
    fundingGoal: rupees(4_000_000),
    totalRaised: rupees(3_120_000),
    donorCount: 738,
    rating: 4.9,
    ratingCount: 184,
    verified: true,
    coverUrl:
      "https://images.unsplash.com/photo-1516574187841-cb9cc2ca948b?w=2000&q=80",
    metrics: [
      { label: "Patients treated", value: "58,000", unit: "lifetime" },
      { label: "Villages served", value: "94" },
      { label: "Immunisation rate", value: "91%" },
    ],
    owner: { email: "aarogya@impactbridge.dev", name: "Dr. Lakshmi Iyer" },
  },
  {
    slug: "saheli-livelihoods-collective",
    name: "Saheli Livelihoods Collective",
    mission:
      "Turning women's self-help groups into sustainable small businesses.",
    description:
      "Saheli works with 240 self-help groups across rural Rajasthan, providing the three things that most often stand between a group and a viable business: working capital, bookkeeping skills, and a route to market. Groups that complete our eighteen-month programme have an average monthly income four times higher than when they joined, and we track that number for three years afterwards.",
    categories: ["women-empowerment", "education"],
    city: "Jaipur",
    state: "Rajasthan",
    latitude: 26.9124,
    longitude: 75.7873,
    foundedYear: 2016,
    website: "https://example.org/saheli",
    fundingGoal: rupees(1_800_000),
    totalRaised: rupees(960_000),
    donorCount: 254,
    rating: 4.6,
    ratingCount: 61,
    verified: true,
    coverUrl:
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=2000&q=80",
    metrics: [
      { label: "Women in programme", value: "2,880" },
      { label: "Average income increase", value: "4.1×" },
      { label: "Businesses started", value: "310" },
    ],
    owner: { email: "saheli@impactbridge.dev", name: "Nisha Chaudhary" },
  },
  {
    slug: "streetpaws-rescue",
    name: "StreetPaws Rescue",
    mission:
      "Sterilisation, vaccination, and rehoming for Bengaluru's street dogs.",
    description:
      "StreetPaws runs a catch-neuter-vaccinate-return programme across twelve Bengaluru wards, alongside a small shelter for animals too injured to return to the street. Sterilisation is unglamorous work, but it is the only humane intervention that actually reduces street dog populations and rabies risk over time — and it costs a fraction of what shelters cost.",
    categories: ["animals"],
    city: "Bengaluru",
    state: "Karnataka",
    latitude: 12.9716,
    longitude: 77.5946,
    foundedYear: 2018,
    website: "https://example.org/streetpaws",
    fundingGoal: rupees(900_000),
    totalRaised: rupees(342_000),
    donorCount: 189,
    rating: 4.5,
    ratingCount: 47,
    verified: true,
    coverUrl:
      "https://images.unsplash.com/photo-1552053831-71594a27632d?w=2000&q=80",
    metrics: [
      { label: "Animals sterilised", value: "11,400" },
      { label: "Rabies vaccinations", value: "18,900" },
      { label: "Dogs rehomed", value: "620" },
    ],
    owner: { email: "streetpaws@impactbridge.dev", name: "Arjun Pillai" },
  },
  {
    slug: "setu-disaster-response",
    name: "Setu Disaster Response",
    mission:
      "First-72-hours relief teams for floods and cyclones on the east coast.",
    description:
      "Setu maintains pre-positioned supply caches and trained volunteer teams in six coastal districts, so relief arrives in the first seventy-two hours rather than the second week. We deliberately do not do long-term rebuilding — we hand over to partner organisations once the acute phase ends, which keeps our response capacity free for the next event.",
    categories: ["disaster-relief"],
    city: "Bhubaneswar",
    state: "Odisha",
    latitude: 20.2961,
    longitude: 85.8245,
    foundedYear: 2013,
    website: "https://example.org/setu",
    fundingGoal: rupees(6_000_000),
    totalRaised: rupees(2_450_000),
    donorCount: 903,
    rating: 4.7,
    ratingCount: 212,
    verified: true,
    coverUrl:
      "https://images.unsplash.com/photo-1547683905-f686c993aae5?w=2000&q=80",
    metrics: [
      { label: "People reached", value: "146,000" },
      { label: "Deployments", value: "38" },
      { label: "Median response time", value: "31 hrs" },
    ],
    owner: { email: "setu@impactbridge.dev", name: "Debashis Nayak" },
  },
  {
    slug: "nilgiri-watershed-trust",
    name: "Nilgiri Watershed Trust",
    mission:
      "Restoring shola forests and the streams that fifty villages drink from.",
    description:
      "The Nilgiri Watershed Trust restores native shola-grassland habitat in the upper catchment of the Bhavani river. Invasive wattle and eucalyptus plantations have measurably reduced dry-season stream flow; removing them and replanting native species reverses that. We publish stream-gauge data from every restored catchment so the impact is independently checkable.",
    categories: ["environment"],
    city: "Ooty",
    state: "Tamil Nadu",
    latitude: 11.4102,
    longitude: 76.695,
    foundedYear: 2009,
    website: "https://example.org/nilgiri",
    fundingGoal: rupees(3_200_000),
    totalRaised: rupees(2_980_000),
    donorCount: 566,
    rating: 4.9,
    ratingCount: 138,
    verified: true,
    coverUrl:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=2000&q=80",
    metrics: [
      { label: "Hectares restored", value: "1,240" },
      { label: "Native saplings planted", value: "310,000" },
      { label: "Dry-season flow increase", value: "+22%" },
    ],
    owner: { email: "nilgiri@impactbridge.dev", name: "Meenakshi Raman" },
  },
  {
    slug: "kadam-skills-mission",
    name: "Kadam Skills Mission",
    mission:
      "Six-month vocational training with a guaranteed placement interview.",
    description:
      "Kadam trains young adults from low-income households in electrical work, CNC operation, and hospitality — trades with genuine local demand rather than whatever is fashionable. Every graduate gets at least three placement interviews with our employer partners. We publish our placement rate honestly, including the graduates who did not find work.",
    categories: ["education", "women-empowerment"],
    city: "Ahmedabad",
    state: "Gujarat",
    latitude: 23.0225,
    longitude: 72.5714,
    foundedYear: 2017,
    website: "https://example.org/kadam",
    fundingGoal: rupees(2_000_000),
    totalRaised: rupees(430_000),
    donorCount: 97,
    rating: 4.3,
    ratingCount: 28,
    verified: false,
    coverUrl:
      "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=2000&q=80",
    metrics: [
      { label: "Graduates placed", value: "1,150" },
      { label: "Placement rate", value: "78%" },
      { label: "Women in cohort", value: "46%" },
    ],
    owner: { email: "kadam@impactbridge.dev", name: "Farhan Qureshi" },
  },
  {
    slug: "jal-mitra-water",
    name: "Jal Mitra Water Initiative",
    mission:
      "Community-managed water systems in villages facing severe scarcity.",
    description:
      "Jal Mitra builds and hands over village-managed water infrastructure — check dams, recharge wells, and piped supply — with a village water committee trained to maintain it. Infrastructure that nobody owns falls apart within three years, so the handover process matters more than the construction, and we spend a third of our budget on it.",
    categories: ["environment", "healthcare"],
    city: "Nagpur",
    state: "Maharashtra",
    latitude: 21.1458,
    longitude: 79.0882,
    foundedYear: 2015,
    website: "https://example.org/jal-mitra",
    fundingGoal: rupees(5_000_000),
    totalRaised: rupees(1_275_000),
    donorCount: 331,
    rating: 4.4,
    ratingCount: 73,
    verified: true,
    coverUrl:
      "https://images.unsplash.com/photo-1594398901394-4e34939a4fd0?w=2000&q=80",
    metrics: [
      { label: "Villages with year-round water", value: "68" },
      { label: "Litres recharged annually", value: "410M" },
      { label: "Committees still active after 5 yrs", value: "89%" },
    ],
    owner: { email: "jalmitra@impactbridge.dev", name: "Sunita Deshmukh" },
  },
];

const PLATFORM_USERS: Array<{ email: string; name: string; role: Role }> = [
  {
    email: "admin@impactbridge.dev",
    name: "Platform Admin",
    role: "PLATFORM_ADMIN",
  },
  { email: "donor@impactbridge.dev", name: "Aditi Rao", role: "DONOR" },
  { email: "funder@impactbridge.dev", name: "Meera Kulkarni", role: "FUNDER" },
];

async function main() {
  console.log("🌱 Seeding database...\n");

  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    raw: false,
  });

  // ── Categories ────────────────────────────────────────────────────────────
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
  }
  console.log(`  ✓ ${CATEGORIES.length} categories`);

  // ── Platform users (admin, donor, funder) ─────────────────────────────────
  for (const demo of PLATFORM_USERS) {
    await prisma.user.upsert({
      where: { email: demo.email },
      update: {},
      create: { ...demo, passwordHash, emailVerifiedAt: new Date() },
    });
  }
  console.log(`  ✓ ${PLATFORM_USERS.length} platform users`);

  // ── Organisations, each with its own NGO_ADMIN owner ──────────────────────
  for (const org of ORGANISATIONS) {
    const owner = await prisma.user.upsert({
      where: { email: org.owner.email },
      update: {},
      create: {
        email: org.owner.email,
        name: org.owner.name,
        role: "NGO_ADMIN",
        passwordHash,
        emailVerifiedAt: new Date(),
      },
    });

    /*
     * The same payload is used for both create and update, so re-running the
     * seed after a schema change actually refreshes existing rows. An empty
     * `update: {}` would silently leave old records on the previous shape —
     * which is exactly how a newly added column ends up NULL everywhere.
     *
     * `set` (not `connect`) on categories replaces the relation wholesale, so
     * removing a category from this file removes it from the database too.
     *
     * Two fields are deliberately NOT in here, and are applied on create only
     * (see `seedOnlyOnCreate` below): the running money totals. Once
     * `seedDonations.ts` has run they are derived from real Donation rows, and
     * re-seeding to restore profile text would overwrite them with the static
     * figures in this file — a demo whose "raised" figure no longer matches its
     * own donation history. That risk is the only reason `db:seed` was
     * previously unsafe to re-run, which in turn is how one organisation sat
     * with its profile wiped for weeks.
     */
    const organizationData = {
      name: org.name,
      mission: org.mission,
      description: org.description,
      ownerId: owner.id,
      city: org.city,
      state: org.state,
      country: "India",
      latitude: org.latitude,
      longitude: org.longitude,
      status: "ACTIVE" as const,
      rating: org.rating,
      ratingCount: org.ratingCount,
      fundingGoalMinor: org.fundingGoal,
      coverUrl: org.coverUrl,
      website: org.website,
      contactEmail: org.owner.email,
      foundedYear: org.foundedYear,
    };

    const categoryRefs = org.categories.map((slug) => ({ slug }));

    /*
     * Values this file may PROPOSE but must never IMPOSE.
     *
     * Each one is authored at runtime by somebody with more authority than a
     * seed file, and re-running the seed to restore profile text must not undo
     * their work:
     *
     *  - the money totals are recomputed from real Donation rows by
     *    `seedDonations.ts`; the static figures here would contradict the
     *    donation history the platform can actually show.
     *  - verification is a decision a platform admin made and the audit log
     *    recorded. A re-seed silently unverifying an organisation would be the
     *    platform contradicting its own audit trail — on a product whose entire
     *    argument is that every decision is traceable.
     *
     * Written as a pair: the flag for querying, the timestamp for display.
     */
    const seedOnlyOnCreate = {
      totalRaisedMinor: org.totalRaised,
      donorCount: org.donorCount,
      verified: org.verified,
      verifiedAt: org.verified ? new Date() : null,
    };

    const organization = await prisma.organization.upsert({
      where: { slug: org.slug },
      // `set` replaces the whole relation, so a category removed from this file
      // is removed from the row too. It is only valid on update.
      update: { ...organizationData, categories: { set: categoryRefs } },
      create: {
        slug: org.slug,
        ...organizationData,
        ...seedOnlyOnCreate,
        categories: { connect: categoryRefs },
      },
    });

    // Metrics are replaced wholesale so re-seeding can't duplicate them.
    await prisma.impactMetric.deleteMany({
      where: { organizationId: organization.id },
    });
    await prisma.impactMetric.createMany({
      data: org.metrics.map((metric, index) => ({
        organizationId: organization.id,
        label: metric.label,
        value: metric.value,
        unit: metric.unit ?? null,
        sortOrder: index,
      })),
    });
  }
  console.log(`  ✓ ${ORGANISATIONS.length} organisations with impact metrics`);

  console.log(`\n  Password for every demo account: ${DEMO_PASSWORD}`);
  console.log(`  Sign in as donor@impactbridge.dev to browse and donate.\n`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
