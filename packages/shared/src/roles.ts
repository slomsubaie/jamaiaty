// Mirrors the `member_role` and `board_permission` enums in supabase/migrations.
// The database (RLS) is the real enforcement; these are for showing/hiding UI.

export const MEMBER_ROLES = ["president", "board_member", "owner"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ROLE_RANK: Record<MemberRole, number> = { president: 1, board_member: 2, owner: 3 };

/** Highest role first: president, board member, owner. */
export function sortRoles(roles: MemberRole[]): MemberRole[] {
  return [...new Set(roles)].sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]);
}

export const BOARD_PERMISSIONS = [
  "documents",
  "vendors_contracts",
  "finance",
  "owners_units",
  "announcements",
  "approve_support_access",
  "custom_sections",
] as const;
export type BoardPermission = (typeof BOARD_PERMISSIONS)[number];

export interface Membership {
  association_id: string;
  role: MemberRole;
  permissions: BoardPermission[];
}

/** The president implicitly holds every board permission. */
export function can(m: Pick<Membership, "role" | "permissions"> | null | undefined, perm: BoardPermission): boolean {
  if (!m) return false;
  if (m.role === "president") return true;
  return m.role === "board_member" && m.permissions.includes(perm);
}

export const SUPPORT_SECTIONS = ["all", "sections", "units", "members", "documents", "vendors", "finance", "analysis"] as const;
export type SupportSection = (typeof SUPPORT_SECTIONS)[number];

export const FOLDER_VISIBILITIES = ["owners", "board"] as const;
export type FolderVisibility = (typeof FOLDER_VISIBILITIES)[number];

export const ITEM_KINDS = ["note", "link", "file"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
