// Categories, services catalogue and the maths behind vendor comparison and budget reports.
// Labels are Arabic; keys match the CHECK constraints in the database.

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------
export const DOCUMENT_CATEGORIES = {
  contract: "عقد",
  invoice: "فاتورة",
  minutes: "محضر اجتماع",
  decision: "قرار",
  correspondence: "مراسلة",
  other: "أخرى",
} as const;
export type DocumentCategory = keyof typeof DOCUMENT_CATEGORIES;

// ---------------------------------------------------------------------------
// Vendors: fields and the services each field usually offers (for comparison).
// ---------------------------------------------------------------------------
export const VENDOR_CATEGORIES = {
  cleaning_maintenance: "النظافة والصيانة",
  property_management: "إدارة الأملاك",
  elevators: "المصاعد",
  security: "الحراسة والأمن",
  pest_control: "مكافحة الحشرات",
  landscaping: "الزراعة والتنسيق",
  pools: "المسابح",
  fire_safety: "السلامة والحريق",
  other: "أخرى",
} as const;
export type VendorCategory = keyof typeof VENDOR_CATEGORIES;

/** Typical services per field; offers tick these (and may add their own). */
export const SERVICE_CATALOG: Record<VendorCategory, Record<string, string>> = {
  cleaning_maintenance: {
    daily_cleaning: "نظافة يومية للمرافق المشتركة",
    stairs_corridors: "تنظيف الدرج والممرات",
    glass: "تنظيف الواجهات الزجاجية",
    parking: "تنظيف المواقف",
    waste: "جمع ونقل النفايات",
    plumbing: "صيانة السباكة",
    electrical: "صيانة الكهرباء",
    ac: "صيانة التكييف المركزي",
    water_tanks: "تنظيف الخزانات",
    emergency_24_7: "طوارئ على مدار الساعة",
  },
  property_management: {
    fee_collection: "تحصيل رسوم الملاك",
    accounting: "المحاسبة والتقارير المالية",
    vendor_supervision: "الإشراف على المقاولين",
    meetings: "تنظيم اجتماعات الجمعية",
    legal: "المتابعة القانونية والنظامية",
    mullak_registration: "التسجيل والتحديث في منصة ملاك",
    complaints: "استقبال الشكاوى ومتابعتها",
  },
  elevators: {
    preventive: "صيانة وقائية دورية",
    breakdown_response: "الاستجابة للأعطال",
    spare_parts: "قطع الغيار مشمولة",
    emergency_24_7: "طوارئ على مدار الساعة",
    annual_inspection: "الفحص السنوي والشهادة",
    modernization: "تحديث وتطوير",
  },
  security: {
    guards_24_7: "حراسة على مدار الساعة",
    cctv_monitoring: "مراقبة الكاميرات",
    access_control: "التحكم في الدخول",
    visitor_log: "سجل الزوار",
    patrols: "جولات دورية",
    female_guard: "حارسة نسائية",
  },
  pest_control: {
    monthly_spraying: "رش دوري شهري",
    termites: "مكافحة النمل الأبيض",
    rodents: "مكافحة القوارض",
    emergency_visit: "زيارات طارئة",
    certificate: "شهادة معتمدة",
  },
  landscaping: {
    irrigation: "الري والصيانة",
    planting: "الزراعة والتشجير",
    trimming: "التقليم والتنسيق",
    lawn: "العناية بالمسطحات الخضراء",
  },
  pools: {
    cleaning: "تنظيف المسبح",
    chemicals: "المعالجة الكيميائية",
    lifeguard: "منقذ",
    equipment: "صيانة المضخات والفلاتر",
  },
  fire_safety: {
    extinguishers: "صيانة الطفايات",
    alarm_system: "صيانة نظام الإنذار",
    sprinklers: "صيانة الرشاشات",
    civil_defense: "متطلبات الدفاع المدني",
    training: "تدريب وإخلاء",
  },
  other: {},
};

export function serviceLabel(category: string, key: string): string {
  return SERVICE_CATALOG[category as VendorCategory]?.[key] ?? key;
}

export const OFFER_STATUSES = {
  offer: "عرض سعر",
  active: "عقد ساري",
  ended: "عقد منتهٍ",
  declined: "مرفوض",
} as const;
export type OfferStatus = keyof typeof OFFER_STATUSES;

export const PRICE_BASES = {
  per_unit_month: "لكل وحدة شهرياً",
  per_unit_year: "لكل وحدة سنوياً",
  per_month: "إجمالي شهري",
  per_year: "إجمالي سنوي",
} as const;
export type PriceBasis = keyof typeof PRICE_BASES;

/** Converts any price basis to a yearly total and a yearly price per unit. */
export function normalizePrice(amount: number, basis: PriceBasis, units: number) {
  const n = Math.max(units, 0);
  let perYear: number;
  switch (basis) {
    case "per_unit_month": perYear = amount * 12 * n; break;
    case "per_unit_year": perYear = amount * n; break;
    case "per_month": perYear = amount * 12; break;
    case "per_year": perYear = amount; break;
  }
  return { perYear, perUnitPerYear: n > 0 ? perYear / n : null };
}

export interface ComparableOffer {
  id: string;
  vendorName: string;
  title: string;
  status: string;
  services: string[];
  price_amount: number;
  price_basis: PriceBasis;
  vat_included: boolean;
}

/**
 * Side-by-side comparison of offers in one field: which services each covers and the price
 * converted to a yearly total and per unit per year, cheapest first.
 */
export function compareOffers(offers: ComparableOffer[], units: number) {
  const rows = offers
    .map((o) => ({ ...o, ...normalizePrice(Number(o.price_amount), o.price_basis, units) }))
    .sort((a, b) => a.perYear - b.perYear);
  const services = [...new Set(rows.flatMap((r) => r.services))];
  const cheapest = rows.length ? rows[0].perYear : null;
  // Services that the most offers include come first.
  services.sort((a, b) => rows.filter((r) => r.services.includes(b)).length - rows.filter((r) => r.services.includes(a)).length);
  return {
    services,
    rows: rows.map((r) => ({
      ...r,
      cheapest: cheapest !== null && r.perYear === cheapest,
      coverage: services.length ? r.services.length / services.length : 0,
      vsCheapest: cheapest ? r.perYear / cheapest - 1 : 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// Finance: budget lines and reports
// ---------------------------------------------------------------------------
export const INCOME_CATEGORIES = {
  owner_fees: "رسوم الملاك",
  rent: "إيرادات تأجير",
  other_income: "إيرادات أخرى",
} as const;
export const EXPENSE_CATEGORIES = {
  maintenance: "الصيانة",
  cleaning: "النظافة",
  security: "الحراسة",
  elevators: "المصاعد",
  utilities: "الكهرباء والمياه",
  management: "إدارة الأملاك",
  insurance: "التأمين",
  reserve: "الاحتياطي",
  other_expense: "مصروفات أخرى",
} as const;
export type BudgetCategory = keyof typeof INCOME_CATEGORIES | keyof typeof EXPENSE_CATEGORIES;
export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = { ...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES };

export const BUDGET_STATUSES = {
  draft: "مسودة",
  approved: "معتمدة",
  closed: "مقفلة",
} as const;
export type BudgetStatus = keyof typeof BUDGET_STATUSES;

export interface BudgetLineLike {
  kind: "income" | "expense" | string;
  category: string;
  planned_amount: number | string;
  actual_amount: number | string;
}

/** Totals, balance and per-category planned vs. actual (variance) for a budget. */
export function budgetReport(lines: BudgetLineLike[]) {
  const totals = { plannedIncome: 0, actualIncome: 0, plannedExpense: 0, actualExpense: 0 };
  const byCategory = new Map<string, { kind: string; category: string; planned: number; actual: number }>();
  for (const l of lines) {
    const planned = Number(l.planned_amount) || 0;
    const actual = Number(l.actual_amount) || 0;
    if (l.kind === "income") {
      totals.plannedIncome += planned;
      totals.actualIncome += actual;
    } else {
      totals.plannedExpense += planned;
      totals.actualExpense += actual;
    }
    const c = byCategory.get(l.category) ?? { kind: l.kind, category: l.category, planned: 0, actual: 0 };
    c.planned += planned;
    c.actual += actual;
    byCategory.set(l.category, c);
  }
  return {
    ...totals,
    plannedBalance: totals.plannedIncome - totals.plannedExpense,
    actualBalance: totals.actualIncome - totals.actualExpense,
    categories: [...byCategory.values()].map((c) => ({
      ...c,
      variance: c.actual - c.planned,
      variancePct: c.planned ? (c.actual - c.planned) / c.planned : null,
    })),
  };
}

/** Saudi riyal formatting with Arabic digits off (clearer in tables). */
export function formatSAR(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
}

/** CSV with a UTF-8 BOM so Excel shows Arabic correctly. */
export function toCSV(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Quote, and neutralise spreadsheet formula injection (=, +, -, @ at the start).
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
