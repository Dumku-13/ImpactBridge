import {
  checkTransition,
  availableTransitions,
  actorForRole,
} from "./grantWorkflow.js";

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass += 1;
  else {
    fail += 1;
    console.log(`  ✗ ${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    return;
  }
  console.log(`  ✓ ${name}`);
}

console.log("\nHappy path — each step allowed for the right actor:");
check("DRAFT→SUBMITTED by NGO", checkTransition("DRAFT", "SUBMITTED", "NGO"), null);
check("SUBMITTED→REVIEW_PENDING by FUNDER", checkTransition("SUBMITTED", "REVIEW_PENDING", "FUNDER"), null);
check("REVIEW_PENDING→REVIEWER_ASSIGNED by FUNDER", checkTransition("REVIEW_PENDING", "REVIEWER_ASSIGNED", "FUNDER"), null);
check("REVIEWER_ASSIGNED→INTERVIEW by FUNDER", checkTransition("REVIEWER_ASSIGNED", "INTERVIEW", "FUNDER"), null);
check("INTERVIEW→APPROVED by FUNDER", checkTransition("INTERVIEW", "APPROVED", "FUNDER"), null);
check("APPROVED→FUNDS_RELEASED by FUNDER", checkTransition("APPROVED", "FUNDS_RELEASED", "FUNDER"), null);
check("FUNDS_RELEASED→IN_PROGRESS by NGO", checkTransition("FUNDS_RELEASED", "IN_PROGRESS", "NGO"), null);
check("IN_PROGRESS→COMPLETED by FUNDER", checkTransition("IN_PROGRESS", "COMPLETED", "FUNDER"), null);

console.log("\nStage skipping must be blocked (409):");
check("SUBMITTED→FUNDS_RELEASED", checkTransition("SUBMITTED", "FUNDS_RELEASED", "FUNDER")?.status, 409);
check("DRAFT→APPROVED", checkTransition("DRAFT", "APPROVED", "FUNDER")?.status, 409);
check("SUBMITTED→COMPLETED", checkTransition("SUBMITTED", "COMPLETED", "FUNDER")?.status, 409);

console.log("\nWrong actor must be blocked (403):");
check("NGO cannot approve", checkTransition("INTERVIEW", "APPROVED", "NGO")?.status, 403);
check("NGO cannot release funds", checkTransition("APPROVED", "FUNDS_RELEASED", "NGO")?.status, 403);
check("FUNDER cannot submit for the NGO", checkTransition("DRAFT", "SUBMITTED", "FUNDER")?.status, 403);
check("FUNDER cannot start the work", checkTransition("FUNDS_RELEASED", "IN_PROGRESS", "FUNDER")?.status, 403);

console.log("\nTerminal states are final (409):");
check("COMPLETED→IN_PROGRESS", checkTransition("COMPLETED", "IN_PROGRESS", "FUNDER")?.status, 409);
check("REJECTED→APPROVED", checkTransition("REJECTED", "APPROVED", "FUNDER")?.status, 409);
check("WITHDRAWN→SUBMITTED", checkTransition("WITHDRAWN", "SUBMITTED", "NGO")?.status, 409);

console.log("\nNGO cannot withdraw after money is committed:");
check("APPROVED→WITHDRAWN blocked", checkTransition("APPROVED", "WITHDRAWN", "NGO")?.status, 409);
check("SUBMITTED→WITHDRAWN allowed", checkTransition("SUBMITTED", "WITHDRAWN", "NGO"), null);

console.log("\nRole mapping:");
check("NGO_ADMIN → NGO", actorForRole("NGO_ADMIN"), "NGO");
check("FUNDER → FUNDER", actorForRole("FUNDER"), "FUNDER");
check("DONOR → null", actorForRole("DONOR"), null);
check("PLATFORM_ADMIN → null", actorForRole("PLATFORM_ADMIN"), null);

console.log("\nUI options are actor-scoped:");
check(
  "funder options at SUBMITTED",
  availableTransitions("SUBMITTED", "FUNDER").map((t) => t.to),
  ["REVIEW_PENDING", "REJECTED"],
);
check(
  "NGO options at SUBMITTED",
  availableTransitions("SUBMITTED", "NGO").map((t) => t.to),
  ["WITHDRAWN"],
);
check("no options at COMPLETED", availableTransitions("COMPLETED", "FUNDER"), []);

console.log("\nSkip-interview path (a funder may approve without interviewing):");
check("REVIEWER_ASSIGNED→APPROVED by FUNDER", checkTransition("REVIEWER_ASSIGNED", "APPROVED", "FUNDER"), null);
check("REVIEWER_ASSIGNED→APPROVED by NGO blocked", checkTransition("REVIEWER_ASSIGNED", "APPROVED", "NGO")?.status, 403);

console.log("\nRejection is available at every pre-decision stage:");
check("SUBMITTED→REJECTED", checkTransition("SUBMITTED", "REJECTED", "FUNDER"), null);
check("REVIEW_PENDING→REJECTED", checkTransition("REVIEW_PENDING", "REJECTED", "FUNDER"), null);
check("REVIEWER_ASSIGNED→REJECTED", checkTransition("REVIEWER_ASSIGNED", "REJECTED", "FUNDER"), null);
check("INTERVIEW→REJECTED", checkTransition("INTERVIEW", "REJECTED", "FUNDER"), null);
check("NGO cannot reject its own application", checkTransition("SUBMITTED", "REJECTED", "NGO")?.status, 403);

console.log("\nA funder can rescind an approval before funds move, but not after:");
check("APPROVED→REJECTED by FUNDER", checkTransition("APPROVED", "REJECTED", "FUNDER"), null);
check("APPROVED→REJECTED by NGO blocked", checkTransition("APPROVED", "REJECTED", "NGO")?.status, 403);
check("FUNDS_RELEASED→REJECTED blocked", checkTransition("FUNDS_RELEASED", "REJECTED", "FUNDER")?.status, 409);

console.log("\nWithdrawal is the NGO's alone, at every pre-decision stage:");
check("DRAFT→WITHDRAWN", checkTransition("DRAFT", "WITHDRAWN", "NGO"), null);
check("REVIEW_PENDING→WITHDRAWN", checkTransition("REVIEW_PENDING", "WITHDRAWN", "NGO"), null);
check("REVIEWER_ASSIGNED→WITHDRAWN", checkTransition("REVIEWER_ASSIGNED", "WITHDRAWN", "NGO"), null);
check("INTERVIEW→WITHDRAWN", checkTransition("INTERVIEW", "WITHDRAWN", "NGO"), null);
check("FUNDER cannot withdraw for the NGO", checkTransition("SUBMITTED", "WITHDRAWN", "FUNDER")?.status, 403);

console.log("\nCompletion is the funder's call:");
check("NGO cannot mark complete", checkTransition("IN_PROGRESS", "COMPLETED", "NGO")?.status, 403);

console.log("\nBranching states offer every legal option:");
check(
  "funder options at REVIEWER_ASSIGNED",
  availableTransitions("REVIEWER_ASSIGNED", "FUNDER").map((t) => t.to),
  ["INTERVIEW", "APPROVED", "REJECTED"],
);
check(
  "funder options at APPROVED",
  availableTransitions("APPROVED", "FUNDER").map((t) => t.to),
  ["FUNDS_RELEASED", "REJECTED"],
);
check("NGO has no options at APPROVED", availableTransitions("APPROVED", "NGO"), []);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
