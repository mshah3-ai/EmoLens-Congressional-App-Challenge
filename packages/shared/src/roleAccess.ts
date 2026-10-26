/**
 * What each invited role will and won't see, in plain words, for the preview the owner reads before creating an invite
 * code (SPEC 7.1, 23.2). Each item is an i18n key under `invite.access.` (English and Spanish). The rules themselves
 * are enforced by the database's row-level security; docs/PRIVACY_REVIEW.md lists the test behind each one.
 */
export type InvitedRole = 'caregiver' | 'teacher' | 'clinician';

export const ROLE_ACCESS: Record<InvitedRole, { sees: string[]; never: string[] }> = {
  caregiver: {
    sees: ['logEverything', 'seeEverything', 'placeNames'],
    never: ['manageTeam', 'deleteChild'],
  },
  teacher: {
    sees: ['logAtSchool', 'schoolOutlook', 'strategies', 'schoolEpisodes', 'teamNames'],
    never: ['medsSleepHealth', 'homePlaces', 'patternsReports'],
  },
  clinician: {
    sees: ['portalSummaries', 'everythingSynced', 'clinicianNotes'],
    never: ['changeLogs', 'manageTeam'],
  },
};

/** True for everyone: what never leaves the family's phone (SPEC 7.2 exclusions, 27.1). */
export const NEVER_SHARED = 'neverLeavesPhone';
