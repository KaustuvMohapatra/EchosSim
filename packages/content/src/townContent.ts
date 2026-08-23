/**
 * Authored town content (Sprint 29): data-driven population, locations, jobs,
 * groups and seeded relationships. No per-character code — validated data only.
 * Mira appears as a subtle resident; her distinctiveness lives in config.
 */

export interface LocationDef {
  id: string;
  name: string;
  capacity?: number;
  hours?: { openMinuteOfDay: number; closeMinuteOfDay: number };
}

const H = (oh: number, om: number, ch: number, cm: number) =>
  ({ openMinuteOfDay: oh * 60 + om, closeMinuteOfDay: ch * 60 + cm });

export const TOWN_LOCATIONS: readonly LocationDef[] = [
  { id: "apt_a", name: "Alder Apartments" },
  { id: "apt_b", name: "Birch Court Flats" },
  { id: "apt_c", name: "Cedar Row" },
  { id: "cafe", name: "Corner Cafe", capacity: 8, hours: H(6, 0, 20, 0) },
  { id: "bakery", name: "Bakery", hours: H(5, 30, 14, 0) },
  { id: "bookstore", name: "Bookstore", hours: H(9, 0, 18, 0) },
  { id: "library", name: "Library", hours: H(8, 30, 19, 0) },
  { id: "clinic", name: "Clinic", hours: H(8, 0, 17, 0) },
  { id: "studio", name: "Architecture Studio", hours: H(9, 0, 18, 0) },
  { id: "store", name: "General Store", hours: H(8, 0, 21, 0) },
  { id: "restaurant", name: "Riverside Restaurant", capacity: 10, hours: H(11, 0, 22, 30) },
  { id: "hall", name: "Community Hall", hours: H(9, 0, 21, 0) },
  { id: "park", name: "Park" },
];

export type TraitVector = Partial<Record<number, number>>;

export interface JobDefRef {
  title: string;
  workplaceId: string;
  shiftStartMinuteOfDay: number;
  shiftEndMinuteOfDay: number;
  incomePerHour: number;
}

export interface ResidentDef {
  id: string;
  name: string;
  homeId: string;
  /** Balanced baseline + these overrides keeps authoring compact. */
  traits?: TraitVector;
  job?: JobDefRef;
  preferences?: Record<string, number>;
  groups: string[];
  /** One-line human note for maintainers (not used by the simulation). */
  note?: string;
}

export interface GroupDef {
  id: string;
  kind: "Household" | "Family" | "FriendGroup" | "WorkplaceGroup" | "Club";
  name: string;
  meetingLocationId?: string;
}

const JOB = (
  title: string, workplaceId: string,
  sh: number, sm: number, eh: number, em: number, incomePerHour: number,
): JobDefRef => ({
  title, workplaceId,
  shiftStartMinuteOfDay: sh * 60 + sm, shiftEndMinuteOfDay: eh * 60 + em,
  incomePerHour,
});

export const TOWN_GROUPS: readonly GroupDef[] = [
  { id: "fam_alders", kind: "Household", name: "Alder Households" },
  { id: "fam_birch", kind: "Household", name: "Birch Households" },
  { id: "fam_cedar", kind: "Household", name: "Cedar Households" },
  { id: "wp_studio", kind: "WorkplaceGroup", name: "Studio Crew", meetingLocationId: "studio" },
  { id: "wp_cafe", kind: "WorkplaceGroup", name: "Cafe Team", meetingLocationId: "cafe" },
  { id: "wp_bakery", kind: "WorkplaceGroup", name: "Bakery Early Shift", meetingLocationId: "bakery" },
  { id: "wp_store", kind: "WorkplaceGroup", name: "Store Staff", meetingLocationId: "store" },
  { id: "club_books", kind: "Club", name: "Thursday Book Club", meetingLocationId: "library" },
  { id: "club_garden", kind: "Club", name: "Community Garden Club", meetingLocationId: "park" },
  { id: "friends_riverside", kind: "FriendGroup", name: "Riverside Friends" },
];

export const RESIDENTS: readonly ResidentDef[] = [
  // --- Alder apartments ---
  {
    id: "npc_mira", name: "Mira", homeId: "apt_a",
    traits: { 0: 0.89, 5: 0.9, 7: 0.67, 11: 0.78, 12: 0.68 },
    job: JOB("Junior Architect", "studio", 9, 15, 17, 45, 16),
    preferences: { rain: 0.88, cafe: 0.78 },
    groups: ["fam_alders", "wp_studio", "club_books"],
    note: "The fixture. Subtle by design.",
  },
  {
    id: "npc_rohan", name: "Rohan", homeId: "apt_a",
    traits: { 1: 0.82, 11: 0.85, 6: 0.35 },
    job: JOB("Baker", "bakery", 4, 45, 13, 30, 12),
    groups: ["fam_alders", "wp_bakery"],
    note: "Early shifts; short fuse under pressure.",
  },
  {
    id: "npc_anika", name: "Anika", homeId: "apt_b",
    traits: { 7: 0.9, 3: 0.75 },
    job: JOB("Barista", "cafe", 6, 0, 14, 0, 10),
    groups: ["fam_birch", "wp_cafe", "club_books"],
  },
  {
    id: "npc_priya", name: "Priya", homeId: "apt_a",
    traits: { 0: 0.72, 5: 0.66, 1: 0.74 },
    job: JOB("Clinic Nurse", "clinic", 7, 45, 16, 15, 14),
    groups: ["fam_alders", "club_garden"],
  },
  {
    id: "npc_dev", name: "Dev", homeId: "apt_b",
    traits: { 8: 0.72, 2: 0.55 },
    job: JOB("Store Clerk", "store", 9, 0, 17, 30, 9),
    groups: ["fam_birch", "wp_store", "friends_riverside"],
  },
  {
    id: "npc_leah", name: "Leah", homeId: "apt_c",
    traits: { 4: 0.68, 9: 0.7 },
    job: JOB("Teacher", "hall", 8, 30, 15, 30, 13),
    groups: ["fam_cedar", "club_books"],
  },

  // --- Birch court ---
  {
    id: "npc_tomas", name: "Tomas", homeId: "apt_b",
    traits: { 13: 0.85, 6: 0.75 },
    job: JOB("Librarian", "library", 8, 30, 17, 0, 12),
    groups: ["fam_birch", "club_books"],
  },
  {
    id: "npc_sana", name: "Sana", homeId: "apt_b",
    traits: { 3: 0.8, 9: 0.66 },
    job: JOB("Chef", "restaurant", 14, 0, 22, 0, 15),
    groups: ["fam_birch", "friends_riverside"],
  },
  {
    id: "npc_viktor", name: "Viktor", homeId: "apt_a",
    traits: { 12: 0.8, 4: 0.62 },
    job: JOB("Carpenter", "studio", 8, 0, 16, 30, 13),
    groups: ["fam_alders", "wp_studio"],
  },
  {
    id: "npc_hana", name: "Hana", homeId: "apt_c",
    traits: { 0: 0.76, 7: 0.6 },
    job: JOB("Bookseller", "bookstore", 9, 0, 17, 30, 10),
    groups: ["fam_cedar", "club_books", "friends_riverside"],
  },

  // --- Cedar row ---
  {
    id: "npc_marco", name: "Marco", homeId: "apt_c",
    traits: { 2: 0.75, 8: 0.6, 1: 0.4 },
    job: JOB("Waiter", "restaurant", 15, 0, 23, 0, 10),
    groups: ["fam_cedar", "friends_riverside"],
  },
  {
    id: "npc_ines", name: "Ines", homeId: "apt_c",
    traits: { 5: 0.8, 0: 0.7 },
    job: undefined,
    groups: ["fam_cedar", "club_garden"],
    note: "Retired; days are her own.",
  },
  {
    id: "npc_kofi", name: "Kofi", homeId: "apt_a",
    traits: { 1: 0.78, 3: 0.72 },
    job: JOB("Store Manager", "store", 8, 0, 18, 0, 16),
    groups: ["fam_alders", "wp_store", "club_garden"],
  },
  {
    id: "npc_yuki", name: "Yuki", homeId: "apt_b",
    traits: { 0: 0.84, 4: 0.55 },
    job: JOB("Drafter", "studio", 9, 30, 18, 0, 12),
    groups: ["fam_birch", "wp_studio"],
  },

  // --- The rest of the neighbourhood ---
  {
    id: "npc_bo", name: "Bo", homeId: "apt_c",
    traits: { 8: 0.8, 7: 0.45, 12: 0.6 },
    job: JOB("Barista (evening)", "cafe", 14, 0, 20, 30, 10),
    groups: ["fam_cedar", "wp_cafe"],
    note: "Keeps to the edges of every room.",
  },
  {
    id: "npc_clara", name: "Clara", homeId: "apt_a",
    traits: { 3: 0.85, 6: 0.8 },
    job: JOB("Clinic Receptionist", "clinic", 8, 0, 16, 0, 11),
    groups: ["fam_alders", "club_garden"],
  },
  {
    id: "npc_dmitri", name: "Dmitri", homeId: "apt_b",
    traits: { 11: 0.8, 13: 0.7 },
    job: JOB("Restaurant Manager", "restaurant", 13, 0, 22, 30, 17),
    groups: ["fam_birch", "friends_riverside"],
  },
  {
    id: "npc_eva", name: "Eva", homeId: "apt_c",
    traits: { 5: 0.72, 9: 0.6 },
    job: JOB("Bakery Assistant", "bakery", 5, 0, 12, 30, 9),
    groups: ["fam_cedar", "wp_bakery", "club_books"],
  },
  {
    id: "npc_farid", name: "Farid", homeId: "apt_a",
    traits: { 1: 0.7, 10: 0.85 },
    job: JOB("Bookkeeper", "studio", 9, 0, 17, 0, 14),
    groups: ["fam_alders", "wp_studio"],
  },
  {
    id: "npc_grace", name: "Grace", homeId: "apt_b",
    traits: { 7: 0.7, 4: 0.6 },
    job: undefined,
    groups: ["fam_birch", "club_books", "club_garden", "friends_riverside"],
    note: "Between jobs; everywhere and curious.",
  },
  {
    id: "npc_hugo", name: "Hugo", homeId: "apt_c",
    traits: { 6: 0.3, 12: 0.72 },
    job: JOB("Cook", "restaurant", 14, 30, 22, 30, 12),
    groups: ["fam_cedar", "friends_riverside"],
  },
  {
    id: "npc_isla", name: "Isla", homeId: "apt_a",
    traits: { 0: 0.8, 2: 0.65 },
    job: JOB("Library Assistant", "library", 12, 0, 19, 30, 9),
    groups: ["fam_alders", "club_books"],
  },
  {
    id: "npc_jonas", name: "Jonas", homeId: "apt_b",
    traits: { 13: 0.75, 9: 0.5 },
    job: JOB("Store Assistant", "store", 12, 0, 20, 30, 9),
    groups: ["fam_birch", "wp_store"],
  },
  {
    id: "npc_kira", name: "Kira", homeId: "apt_c",
    traits: { 8: 0.66, 5: 0.7 },
    job: JOB("Gardener", "park", 7, 0, 15, 0, 10),
    groups: ["fam_cedar", "club_garden"],
  },
  {
    id: "npc_liam", name: "Liam", homeId: "apt_a",
    traits: { 2: 0.6, 1: 0.55 },
    job: JOB("Waiter", "restaurant", 11, 0, 19, 0, 10),
    groups: ["fam_alders", "friends_riverside"],
  },

  // Seeded rivals/strain (small, believable frictions).
  {
    id: "npc_nadia", name: "Nadia", homeId: "apt_b",
    traits: { 4: 0.78, 12: 0.75, 3: 0.35 },
    job: JOB("Health Inspector", "clinic", 9, 0, 16, 30, 15),
    groups: ["fam_birch"],
    note: "Recent disputes with two kitchens in town.",
  },
];

/**
 * Directional seeds. Keys are [fromId, toId]; values are dimension overrides
 * over an all-zero base. Modest numbers — history should be earned, not given.
 */
export const SEED_RELATIONSHIPS: ReadonlyArray<{
  from: string; to: string;
  affinity?: number; trust?: number; respect?: number; familiarity?: number;
  grievance?: number; attraction?: number;
}> = [
  // Household warmth.
  { from: "npc_mira", to: "npc_rohan", familiarity: 0.4, affinity: 0.25, trust: 0.2 },
  { from: "npc_rohan", to: "npc_mira", familiarity: 0.4, affinity: 0.15, trust: 0.15 },
  { from: "npc_mira", to: "npc_kofi", familiarity: 0.35, affinity: 0.2, trust: 0.25, respect: 0.2 },
  { from: "npc_priya", to: "npc_clara", familiarity: 0.45, affinity: 0.35, trust: 0.3 },
  { from: "npc_tomas", to: "npc_sana", familiarity: 0.4, affinity: 0.3, trust: 0.25 },
  { from: "npc_leah", to: "npc_hana", familiarity: 0.35, affinity: 0.3 },
  { from: "npc_ines", to: "npc_kira", familiarity: 0.5, affinity: 0.45, trust: 0.4, respect: 0.3 },

  // Workmates know each other.
  { from: "npc_anika", to: "npc_bo", familiarity: 0.3, affinity: 0.1 },
  { from: "npc_yuki", to: "npc_farid", familiarity: 0.3, affinity: 0.15 },
  { from: "npc_eva", to: "npc_rohan", familiarity: 0.3, affinity: 0.2, trust: 0.15 },

  // Friendships.
  { from: "npc_grace", to: "npc_hana", familiarity: 0.4, affinity: 0.4, trust: 0.3 },
  { from: "npc_marco", to: "npc_liam", familiarity: 0.4, affinity: 0.35 },
  { from: "npc_sana", to: "npc_dmitri", familiarity: 0.35, affinity: 0.25, trust: 0.2 },

  // Crushes (quiet).
  { from: "npc_liam", to: "npc_isla", familiarity: 0.3, affinity: 0.3, attraction: 0.55 },

  // Frictions & rivalry (the reason gossip exists).
  { from: "npc_nadia", to: "npc_sana", familiarity: 0.3, grievance: 0.45, affinity: -0.3 },
  { from: "npc_sana", to: "npc_nadia", familiarity: 0.3, grievance: 0.5, affinity: -0.4, trust: -0.2 },
  { from: "npc_nadia", to: "npc_hugo", familiarity: 0.25, grievance: 0.35, affinity: -0.25 },
  { from: "npc_rohan", to: "npc_dmitri", familiarity: 0.25, grievance: 0.3, affinity: -0.2 },
  { from: "npc_dmitri", to: "npc_rohan", familiarity: 0.25, grievance: 0.28, affinity: -0.18 },

  // Acquaintances.
  { from: "npc_jonas", to: "npc_dev", familiarity: 0.2, affinity: 0.08 },
  { from: "npc_isla", to: "npc_tomas", familiarity: 0.25, affinity: 0.15, respect: 0.2 },
];
