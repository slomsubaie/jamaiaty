// What the signed-in user may do in one association: their membership, or — for a
// superadmin — an approved, unexpired support grant. Mirrors the RLS rules so the UI
// only offers actions the database will accept.
import { can, type BoardPermission, type MemberRole, type SupportSection } from "./roles.ts";

export interface ActiveGrant {
  id: string;
  sections: SupportSection[];
  can_edit: boolean;
  expires_at: string | null;
}

export interface Access {
  /** Highest role (president > board member > owner), or null when not a member. */
  role: MemberRole | null;
  /** Every role held, e.g. ["president", "owner"]. */
  roles: MemberRole[];
  permissions: BoardPermission[];
  /** Active support grants (superadmin only, when not a member). */
  grants: ActiveGrant[];
}

export type Area = "sections" | "units" | "members" | "documents" | "vendors" | "finance";

const membership = (a: Access) => (a.role ? { role: a.role, permissions: a.permissions } : null);

function grantCovers(a: Access, section: SupportSection | Area, write: boolean): boolean {
  const now = new Date();
  return a.grants.some(
    (g) =>
      (!g.expires_at || new Date(g.expires_at) > now) &&
      (!write || g.can_edit) &&
      (g.sections.includes(section as SupportSection) || g.sections.includes("all")),
  );
}

export function isBoard(a: Access): boolean {
  return a.role === "president" || a.role === "board_member";
}

const AREA_PERMISSION: Record<Area, BoardPermission> = {
  sections: "custom_sections",
  units: "owners_units",
  members: "owners_units",
  documents: "documents",
  vendors: "vendors_contracts",
  finance: "finance",
};

/**
 * Full view of an area. Owners get partial views elsewhere: documents shared with owners
 * (the database filters them), the vendor directory and the yearly finance totals.
 */
export function canView(a: Access, area: Area): boolean {
  if (area === "members" || area === "vendors" || area === "finance") return isBoard(a) || grantCovers(a, area, false);
  return a.role !== null || grantCovers(a, area, false);
}

export function canManage(a: Access, area: Area): boolean {
  return can(membership(a), AREA_PERMISSION[area]) || grantCovers(a, area as SupportSection, true);
}

/** Any member (owners included) may open the area in its owner form. */
export function isMember(a: Access): boolean {
  return a.role !== null;
}

/** Board members, permissions and the presidency are the president's alone. */
export function isPresident(a: Access): boolean {
  return a.role === "president";
}

export function canApproveSupport(a: Access): boolean {
  return can(membership(a), "approve_support_access");
}

export function isSupportSession(a: Access): boolean {
  return a.role === null && a.grants.length > 0;
}

/** The board's analysis (built from every document): the board, or a superadmin under grant. */
export function canViewBoardAnalysis(a: Access): boolean {
  return isBoard(a) || grantCovers(a, "analysis", false);
}

/** Forecast and recommendations: the board on the premium plan; a superadmin under grant on any plan. */
export function canViewForecast(a: Access, plan: string | null | undefined): boolean {
  return (isBoard(a) && plan === "premium") || grantCovers(a, "analysis", false);
}

/** Running the analysis again: the president, or a superadmin under grant. */
export function canRefreshAnalysis(a: Access): boolean {
  return isPresident(a) || grantCovers(a, "analysis", false);
}

/** When the last active grant ends (for the support banner). */
export function supportExpiresAt(a: Access): string | null {
  const times = a.grants.map((g) => g.expires_at).filter((x): x is string => Boolean(x)).sort();
  return times.at(-1) ?? null;
}
