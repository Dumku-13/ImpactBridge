import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

/**
 * Seed the parts of an organisation profile that make it a PROFILE rather than
 * a listing: photographs of the work, and the people accountable for it.
 *
 * Why this is a separate script from `seed.ts`
 * -------------------------------------------
 * `seed.ts` owns the identity of each organisation — slug, mission, funding
 * figures — and is re-run whenever those change. This only ADDS to organisations
 * that already exist and never touches a field `seed.ts` owns, so the two can be
 * run in either order, repeatedly, without fighting. It is idempotent by the
 * same rule as the main seed: every row it writes is keyed so a second run
 * replaces rather than duplicates.
 *
 * Run with:  pnpm --filter @impactbridge/api db:seed:profiles
 *
 * ── About the data ──────────────────────────────────────────────────────────
 *
 * This is demo content for a demo environment, exactly like the eight
 * organisations themselves. Two deliberate limits:
 *
 *  - Photographs are the project's OWN art-direction library, served from the
 *    web app at `/media/stills/...`. In production these URLs are Cloudinary
 *    delivery URLs written by the upload path; a root-relative path is the
 *    local equivalent and renders identically.
 *
 *  - Team members are seeded WITHOUT photographs. The library does contain
 *    photographs of real people, and captioning a real person as a named
 *    officer of a fictional nonprofit is a misrepresentation of them — the
 *    profile falls back to initials, which is the honest option and a state the
 *    UI has to handle for real organisations anyway.
 */
const prisma = new PrismaClient();

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The built media library lives in the web app's public folder. */
const STILLS_DIR = path.resolve(HERE, "../../web/public/media/stills");

interface GalleryImage {
  file: string;
  title: string;
}

/**
 * Photographs per cause.
 *
 * Every entry has been checked against the actual picture, and the caption is
 * derived from what is IN it — the alt text in `apps/web/src/content/media.ts`
 * is the source of truth for that. The first version of this table assigned
 * four photographs to every cause to make galleries look full, which put a
 * ration distribution and a sapling being planted on a dog-rescue's profile,
 * captioned "Treatment, close up". A gallery that shows the wrong work is
 * worse than a short one, on a platform whose whole argument is that what you
 * see is real.
 *
 * So counts vary, honestly: the library holds exactly ONE animal photograph, so
 * an animal charity gets one plate. `OrgGallery` is built to compose at any
 * count.
 *
 * `detail-closeup.jpg` is never used — it is two photographs in one file. The
 * media pipeline splits it into `detail-writing` and `detail-planting`.
 */
const GALLERY_BY_CAUSE: Record<string, GalleryImage[]> = {
  education: [
    { file: "ngo-children.jpg", title: "Students at the learning centre" },
    { file: "cause-education.jpg", title: "A class held in the open air" },
    { file: "detail-writing.jpg", title: "Classwork, mid-lesson" },
    { file: "detail-classroom-desk.jpg", title: "A desk and an exercise book" },
    { file: "children.jpg", title: "The end of a teaching day" },
  ],
  healthcare: [
    { file: "cause-healthcare.jpg", title: "A health worker with a patient" },
  ],
  "women-empowerment": [
    { file: "cause-women-empowerment.jpg", title: "The tailoring collective at work" },
    { file: "detail-fabric.jpg", title: "Cloth woven by members" },
  ],
  animals: [
    { file: "cause-animals.jpg", title: "Veterinary care, on the table" },
  ],
  "disaster-relief": [
    { file: "cause-disaster-relief.jpg", title: "After the water went down" },
    { file: "ngo-community.jpg", title: "Rations reaching a village" },
    { file: "detail-maps.jpg", title: "Planning the distribution by hand" },
  ],
  environment: [
    { file: "cause-environment.jpg", title: "Land back under cultivation" },
    { file: "forest-restoration.jpg", title: "The replanted slope" },
    { file: "detail-planting.jpg", title: "A sapling going into the ground" },
    { file: "forest-restoration-2.jpg", title: "Saplings raised for the next season" },
  ],
};

/**
 * Two colleagues per organisation, alongside the account owner.
 *
 * Roles rather than titles-as-decoration: on a funding platform "who is
 * accountable" means who signs the reports and who answers for the money, so
 * every organisation gets a programme lead and someone who owns finance and
 * compliance.
 */
const COLLEAGUES: Record<string, Array<{ name: string; role: string; bio: string }>> = {
  "vidya-jyoti-foundation": [
    {
      name: "Anjali Verma",
      role: "Programme Lead, Learning Centres",
      /* No centre count here on purpose: the number of learning centres is an
         impact metric the organisation authors itself, and a figure duplicated
         into a bio is a figure that will eventually contradict it. */
      bio: "Runs the learning centres and the teacher training that keeps them staffed.",
    },
    {
      name: "Suresh Kamble",
      role: "Finance & Compliance",
      bio: "Owns the annual audit, FCRA filings and every grant report that leaves the office.",
    },
  ],
  "aarogya-community-health": [
    {
      name: "Priya Nambiar",
      role: "Field Operations Lead",
      bio: "Plans the mobile clinic routes and supervises the community health workers.",
    },
    {
      name: "Mohan Krishnan",
      role: "Finance & Compliance",
      bio: "Tracks spend against each grant and prepares the quarterly utilisation reports.",
    },
  ],
  "saheli-livelihoods-collective": [
    {
      name: "Rukmini Bhosale",
      role: "Livelihoods Programme Lead",
      bio: "Works with the self-help groups on production, pricing and market access.",
    },
    {
      name: "Kavita Shinde",
      role: "Finance & Compliance",
      bio: "Handles member accounts, revolving-fund records and donor reporting.",
    },
  ],
  "streetpaws-rescue": [
    {
      name: "Dr. Nandini Rao",
      role: "Chief Veterinarian",
      bio: "Leads the surgical and vaccination programme across the city's wards.",
    },
    {
      name: "Imran Sheikh",
      role: "Operations & Compliance",
      bio: "Runs the shelter roster and keeps the municipal licences and records current.",
    },
  ],
  "setu-disaster-response": [
    {
      name: "Pratima Behera",
      role: "Response Coordinator",
      bio: "Mobilises the district teams within the first seventy-two hours of an event.",
    },
    {
      name: "Ashok Sahu",
      role: "Logistics & Compliance",
      bio: "Accounts for every consignment from procurement to the household that received it.",
    },
  ],
  "nilgiri-watershed-trust": [
    {
      name: "Karthik Subramanian",
      role: "Watershed Programme Lead",
      bio: "Oversees catchment mapping, check dams and the nursery that supplies them.",
    },
    {
      name: "Leela Thomas",
      role: "Finance & Compliance",
      bio: "Maintains the grant ledger and the landholder agreements behind each site.",
    },
  ],
  "kadam-skills-mission": [
    {
      name: "Zoya Ansari",
      role: "Training Programme Lead",
      bio: "Designs the trade curricula and places graduates with employer partners.",
    },
    {
      name: "Vikram Joshi",
      role: "Finance & Compliance",
      bio: "Reports placement and spend figures to funders on a fixed quarterly cycle.",
    },
  ],
  "jal-mitra-water": [
    {
      name: "Sandeep Patil",
      role: "Water Systems Lead",
      bio: "Responsible for borewell siting, hand-pump repair and water-quality testing.",
    },
    {
      name: "Gauri Kulkarni",
      role: "Finance & Compliance",
      bio: "Keeps the village-level maintenance accounts and the funder reports they feed.",
    },
  ],
};

/** Real byte size, so the figure the NGO dashboard prints isn't a lie. */
function fileBytes(file: string): number {
  try {
    return fs.statSync(path.join(STILLS_DIR, file)).size;
  } catch {
    return 0;
  }
}

async function main() {
  console.log("\n  Seeding profile content (gallery + team)\n");

  if (!fs.existsSync(STILLS_DIR)) {
    console.error(
      `  ✗ Media library not found at ${STILLS_DIR}\n` +
        "    Run `node scripts/build-media.mjs` from the repo root first.",
    );
    process.exit(1);
  }

  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      owner: { select: { name: true } },
      categories: { select: { slug: true } },
    },
  });

  if (organizations.length === 0) {
    console.error("  ✗ No organisations found. Run `db:seed` first.");
    process.exit(1);
  }

  let galleryCount = 0;
  let memberCount = 0;

  for (const org of organizations) {
    /*
     * Gallery images are matched to the organisation's FIRST cause, with the
     * second cause's set used to fill out anything short. An organisation with
     * an unrecognised cause simply gets no gallery rather than a wrong one.
     */
    const images = org.categories
      .flatMap((category) => GALLERY_BY_CAUSE[category.slug] ?? [])
      /* Two causes can nominate the same photograph; show it once. */
      .filter(
        (image, index, all) =>
          all.findIndex((other) => other.file === image.file) === index,
      )
      .slice(0, 5);

    /*
     * Idempotency: the publicId is derived from the organisation and the file,
     * so re-running replaces this script's own rows and cannot touch a document
     * uploaded through the app. Delete-then-create rather than upsert because
     * the set itself may have shrunk between runs.
     */
    await prisma.document.deleteMany({
      where: { organizationId: org.id, publicId: { startsWith: `seed/${org.slug}/` } },
    });

    if (images.length > 0) {
      await prisma.document.createMany({
        data: images.map((image) => ({
          organizationId: org.id,
          type: "GALLERY_IMAGE" as const,
          title: image.title,
          url: `/media/stills/${image.file}`,
          publicId: `seed/${org.slug}/${image.file}`,
          bytes: fileBytes(image.file),
          format: "jpg",
          resourceType: "image",
          /*
           * Gallery images are the ONLY document type that may be public. The
           * profile query filters on `isPublic` AND `type` precisely so that a
           * mistake here cannot publish registration paperwork.
           */
          isPublic: true,
        })),
      });
      galleryCount += images.length;
    }

    /* The account owner leads the organisation; colleagues follow. */
    const team = [
      {
        name: org.owner.name,
        role: "Founder & Director",
        bio: `Signs for ${org.name} and is accountable for every grant it accepts.`,
      },
      ...(COLLEAGUES[org.slug] ?? []),
    ];

    // Replaced wholesale, exactly as `seed.ts` does with impact metrics.
    await prisma.teamMember.deleteMany({ where: { organizationId: org.id } });
    await prisma.teamMember.createMany({
      data: team.map((member, index) => ({
        organizationId: org.id,
        name: member.name,
        role: member.role,
        bio: member.bio,
        // Deliberately no photograph — see the note at the top of this file.
        photoUrl: null,
        sortOrder: index,
      })),
    });
    memberCount += team.length;
  }

  console.log(
    `  ✓ ${galleryCount} gallery photographs and ${memberCount} team members ` +
      `across ${organizations.length} organisations\n`,
  );
}

main()
  .catch((err) => {
    console.error("Profile seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
