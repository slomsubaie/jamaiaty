import { z } from "zod";
import { normalizeSaudiPhone } from "./phone.ts";
import { BOARD_PERMISSIONS, MEMBER_ROLES } from "./roles.ts";

export const saudiPhone = z
  .string()
  .transform((v, ctx) => {
    const n = normalizeSaudiPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "invalid_phone" });
      return z.NEVER;
    }
    return n;
  });

/** Body of the `add-member` Edge Function. */
export const addMemberInput = z
  .object({
    association_id: z.uuid(),
    full_name: z.string().trim().min(2).max(120),
    phone: saudiPhone,
    role: z.enum(MEMBER_ROLES),
    permissions: z.array(z.enum(BOARD_PERMISSIONS)).default([]),
    unit_id: z.uuid().optional(),
    share_pct: z.number().gt(0).max(100).optional(),
  })
  .refine((v) => v.role === "board_member" || v.permissions.length === 0, {
    message: "permissions only apply to board members",
    path: ["permissions"],
  });
export type AddMemberInput = z.input<typeof addMemberInput>;

/** Body of the `create-association` Edge Function (superadmin only). */
export const createAssociationInput = z.object({
  name: z.string().trim().min(2).max(200),
  city: z.string().trim().min(2).max(100),
  mullak_number: z.string().trim().max(50).optional(),
  president_name: z.string().trim().min(2).max(120),
  president_phone: saudiPhone,
});
export type CreateAssociationInput = z.input<typeof createAssociationInput>;

// ---------------------------------------------------------------------------
// Complaints & suggestions form. Used by the form (instant feedback) and by the
// submit-feedback Edge Function (authoritative check); the database checks again.
// ---------------------------------------------------------------------------

export const FEEDBACK_KINDS = ["complaint", "suggestion", "inquiry", "praise"] as const;
export const FEEDBACK_TOPICS = ["login", "association", "sections", "support", "other"] as const;
export const FEEDBACK_MESSAGE_MAX = 1000;

// Strip control characters (except newlines/tabs) and trim; keeps Arabic and emoji intact.
const clean = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

const optionalText = (max: number) =>
  z
    .string()
    .transform(clean)
    .pipe(z.string().max(max))
    .optional()
    .transform((v) => (v ? v : undefined));

export const feedbackInput = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  topic: z.enum(FEEDBACK_TOPICS).optional(),
  full_name: z.string().transform(clean).pipe(z.string().min(2, "name_short").max(100, "name_long")),
  email: z.string().transform((v) => clean(v).toLowerCase()).pipe(z.email("invalid_email").max(254)),
  phone: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v || !clean(v)) return undefined;
      const n = normalizeSaudiPhone(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "invalid_phone" });
        return z.NEVER;
      }
      return n;
    }),
  association_name: optionalText(150),
  message: z.string().transform(clean).pipe(z.string().min(1, "message_required").max(FEEDBACK_MESSAGE_MAX, "message_long")),
  consent: z.literal(true, { message: "consent_required" }),
  /** Honeypot: hidden from people; bots tend to fill it. Must stay empty. */
  website: z.string().max(0).optional(),
});
export type FeedbackInput = z.input<typeof feedbackInput>;
