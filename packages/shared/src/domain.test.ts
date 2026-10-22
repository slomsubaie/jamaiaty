import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetReport, compareOffers, normalizePrice, toCSV } from "./domain.ts";

test("price normalisation: every basis → yearly total and per unit per year", () => {
  assert.deepEqual(normalizePrice(100, "per_unit_month", 40), { perYear: 48000, perUnitPerYear: 1200 });
  assert.deepEqual(normalizePrice(1200, "per_unit_year", 40), { perYear: 48000, perUnitPerYear: 1200 });
  assert.deepEqual(normalizePrice(4000, "per_month", 40), { perYear: 48000, perUnitPerYear: 1200 });
  assert.deepEqual(normalizePrice(48000, "per_year", 40), { perYear: 48000, perUnitPerYear: 1200 });
  assert.deepEqual(normalizePrice(48000, "per_year", 0), { perYear: 48000, perUnitPerYear: null });
});

test("comparison: cheapest first, service coverage, % above cheapest", () => {
  const { rows, services } = compareOffers([
    { id: "a", vendorName: "أ", title: "", status: "offer", services: ["daily_cleaning", "glass"], price_amount: 5000, price_basis: "per_month", vat_included: true },
    { id: "b", vendorName: "ب", title: "", status: "active", services: ["daily_cleaning", "glass", "parking"], price_amount: 1000, price_basis: "per_unit_year", vat_included: true },
  ], 40);
  assert.deepEqual(rows.map((r) => r.id), ["b", "a"]);
  assert.equal(rows[0].cheapest, true);
  assert.equal(rows[0].perYear, 40000);
  assert.equal(rows[1].perYear, 60000);
  assert.equal(Math.round(rows[1].vsCheapest * 100), 50);
  assert.equal(rows[0].coverage, 1);
  assert.equal(services.length, 3);
});

test("budget report: totals, balance and variance per category", () => {
  const r = budgetReport([
    { kind: "income", category: "owner_fees", planned_amount: "100000", actual_amount: 90000 },
    { kind: "expense", category: "cleaning", planned_amount: 40000, actual_amount: 42000 },
    { kind: "expense", category: "cleaning", planned_amount: 10000, actual_amount: 8000 },
  ]);
  assert.equal(r.plannedBalance, 50000);
  assert.equal(r.actualBalance, 40000);
  const cleaning = r.categories.find((c) => c.category === "cleaning")!;
  assert.deepEqual([cleaning.planned, cleaning.actual, cleaning.variance], [50000, 50000, 0]);
});

test("CSV export: BOM for Excel, quoting, formula injection neutralised", () => {
  const csv = toCSV([["البند", "مبلغ"], ['=HYPERLINK("x")', 5], ['قال "نعم"', null]]);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes(`"قال ""نعم"""`));
});
