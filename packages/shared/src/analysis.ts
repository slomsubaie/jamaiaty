// Archive AI analysis: the shapes Claude must return (the edge functions pass these schemas as
// structured-output formats) and the labels the apps show. Keep the schemas to what structured
// outputs accept: objects, arrays, strings, numbers, booleans, enums and nullable fields.
import { z } from "zod";

export const ANALYSIS_TABS = ["overview", "finance", "contracts", "maintenance", "governance"] as const;
export type AnalysisTab = (typeof ANALYSIS_TABS)[number];

export const ANALYSIS_TAB_LABELS: Record<AnalysisTab, string> = {
  overview: "نظرة عامة",
  finance: "المالية",
  contracts: "العقود والموردون",
  maintenance: "الصيانة",
  governance: "الحوكمة",
};

export const ANALYSIS_INTERVALS = [7, 30, 90] as const;
export type AnalysisInterval = (typeof ANALYSIS_INTERVALS)[number];

const level = z.enum(["low", "medium", "high"]);
export type Level = z.infer<typeof level>;
export const LEVEL_LABELS: Record<Level, string> = { low: "منخفض", medium: "متوسط", high: "مرتفع" };

const sources = z.array(z.string()).describe("ids of the documents this is based on");

// ---------------------------------------------------------------------------
// Stage 1: one document
// ---------------------------------------------------------------------------
export const documentDigest = z.object({
  readable: z.boolean().describe("false when the file is blank, unreadable or not a document"),
  summary: z.string().describe("3-6 sentences in Arabic"),
  document_type: z.string(),
  date: z.string().nullable().describe("YYYY-MM-DD (Gregorian) when the document states one"),
  parties: z.array(z.string()),
  topics: z.array(z.enum(["finance", "contracts", "maintenance", "governance", "other"])),
  amounts: z.array(z.object({ label: z.string(), amount: z.number(), currency: z.string() })),
  key_facts: z.array(z.string()),
  obligations: z.array(z.object({ description: z.string(), due_date: z.string().nullable() })),
});
export type DocumentDigest = z.infer<typeof documentDigest>;

// ---------------------------------------------------------------------------
// Stage 2: historical overview, one per audience
// ---------------------------------------------------------------------------
const historyTab = z.object({
  summary: z.string(),
  highlights: z.array(z.object({ text: z.string(), sources })),
  metrics: z.array(z.object({
    label: z.string(),
    value: z.number(),
    unit: z.string().describe("e.g. ر.س or %"),
    year: z.number().nullable(),
    sources,
  })),
  timeline: z.array(z.object({ date: z.string().describe("YYYY-MM-DD or YYYY"), event: z.string(), sources })),
  risks: z.array(z.object({ text: z.string(), severity: level, sources })),
  data_gaps: z.array(z.string()).describe("what is missing from the archive to judge this topic"),
});
export type HistoryTab = z.infer<typeof historyTab>;

export const analysisResult = z.object({
  overview: historyTab,
  finance: historyTab,
  contracts: historyTab,
  maintenance: historyTab,
  governance: historyTab,
});
export type AnalysisResult = z.infer<typeof analysisResult>;

// ---------------------------------------------------------------------------
// Stage 2: forecast for the board
// ---------------------------------------------------------------------------
const forecastTab = z.object({
  details: z.string().describe("deeper professional analysis of the history, several paragraphs"),
  outlook: z.array(z.object({ year: z.number(), expectation: z.string(), likelihood: level, sources })),
  projections: z.array(z.object({
    label: z.string(),
    unit: z.string(),
    points: z.array(z.object({ year: z.number(), value: z.number(), estimated: z.boolean() })),
  })),
  recommendations: z.array(z.object({
    action: z.string(),
    rationale: z.string(),
    priority: level,
    timeframe: z.string().describe("e.g. خلال 3 أشهر"),
    sources,
  })),
});
export type ForecastTab = z.infer<typeof forecastTab>;

export const forecastResult = z.object({
  horizon_years: z.array(z.number()),
  assumptions: z.array(z.string()),
  overview: forecastTab,
  finance: forecastTab,
  contracts: forecastTab,
  maintenance: forecastTab,
  governance: forecastTab,
});
export type ForecastResult = z.infer<typeof forecastResult>;
