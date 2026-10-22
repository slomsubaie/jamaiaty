import assert from "node:assert/strict";
import { test } from "node:test";
import { canManage, canRefreshAnalysis, canView, canViewBoardAnalysis, canViewForecast, isSupportSession, type Access } from "./access.ts";
import { folderSubtree, normalizeUrl } from "./queries.ts";

const future = new Date(Date.now() + 3600_000).toISOString();
const past = new Date(Date.now() - 1000).toISOString();
const none: Access = { role: null, roles: [], permissions: [], grants: [] };

test("president and delegated board members manage sections; others only view", () => {
  assert.equal(canManage({ ...none, role: "president" }, "sections"), true);
  assert.equal(canManage({ ...none, role: "board_member", permissions: ["custom_sections"] }, "sections"), true);
  assert.equal(canManage({ ...none, role: "board_member", permissions: ["finance"] }, "sections"), false);
  assert.equal(canManage({ ...none, role: "owner" }, "sections"), false);
  assert.equal(canView({ ...none, role: "owner" }, "sections"), true);
  assert.equal(canView({ ...none, role: "owner" }, "members"), false);
});

test("superadmin access follows the grant: scope, edit flag and expiry", () => {
  const read: Access = { ...none, grants: [{ id: "g", sections: ["sections"], can_edit: false, expires_at: future }] };
  assert.equal(isSupportSession(read), true);
  assert.equal(canView(read, "sections"), true);
  assert.equal(canManage(read, "sections"), false);
  assert.equal(canView(read, "units"), false);
  const edit: Access = { ...none, grants: [{ id: "g", sections: ["all"], can_edit: true, expires_at: future }] };
  assert.equal(canManage(edit, "sections"), true);
  assert.equal(canManage(edit, "units"), true);
  const expired: Access = { ...none, grants: [{ id: "g", sections: ["all"], can_edit: true, expires_at: past }] };
  assert.equal(canView(expired, "sections"), false);
  assert.equal(canView(none, "sections"), false);
});

test("analysis: owners get the overview only; forecast needs board + premium or a superadmin grant", () => {
  const owner: Access = { ...none, role: "owner" };
  const board: Access = { ...none, role: "board_member" };
  const pres: Access = { ...none, role: "president" };
  assert.equal(canViewBoardAnalysis(owner), false);
  assert.equal(canViewForecast(owner, "premium"), false);
  assert.equal(canViewBoardAnalysis(board), true);
  assert.equal(canViewForecast(board, "base"), false);
  assert.equal(canViewForecast(board, "premium"), true);
  assert.equal(canRefreshAnalysis(board), false);
  assert.equal(canRefreshAnalysis(pres), true);
  const sup: Access = { ...none, grants: [{ id: "g", sections: ["analysis"], can_edit: false, expires_at: future }] };
  assert.equal(canViewForecast(sup, "base"), true);
  assert.equal(canRefreshAnalysis(sup), true);
  const other: Access = { ...none, grants: [{ id: "g", sections: ["documents"], can_edit: true, expires_at: future }] };
  assert.equal(canViewBoardAnalysis(other), false);
  assert.equal(canViewForecast(none, "premium"), false);
});

test("folder subtree and URL normalization", () => {
  const folders = [
    { id: "a", parent_id: null },
    { id: "b", parent_id: "a" },
    { id: "c", parent_id: "b" },
    { id: "d", parent_id: null },
  ];
  assert.deepEqual(folderSubtree(folders, "a").sort(), ["a", "b", "c"]);
  assert.deepEqual(folderSubtree(folders, "d"), ["d"]);
  assert.equal(normalizeUrl(" example.com/x "), "https://example.com/x");
  assert.equal(normalizeUrl("http://a.b"), "http://a.b");
});

test("multiple grants combine per scope", () => {
  const a: Access = {
    ...none,
    grants: [
      { id: "1", sections: ["units"], can_edit: false, expires_at: future },
      { id: "2", sections: ["sections"], can_edit: true, expires_at: future },
    ],
  };
  assert.equal(canManage(a, "sections"), true);
  assert.equal(canManage(a, "units"), false);
  assert.equal(canView(a, "units"), true);
});

import { decodeActing, encodeActing, isSuperadminMode, roleOptions } from "./acting.ts";
import { grantActions } from "./queries.ts";

test("acting role: encode/decode and options", () => {
  const owner = { kind: "member", role: "owner", association_id: "a1" } as const;
  assert.equal(encodeActing(owner), "owner:a1");
  assert.deepEqual(decodeActing("owner:a1"), owner);
  assert.deepEqual(decodeActing("superadmin"), { kind: "superadmin" });
  assert.equal(decodeActing("hacker:a1"), null);
  const opts = roleOptions(true, [{ association_id: "a1", associations: { name: "Tal" }, roles: ["owner", "president"] }]);
  assert.deepEqual(opts.map((o) => `${o.label}|${o.detail ?? ""}`), ["مدير المنصة|", "رئيس الجمعية|Tal", "مالك|Tal"]);
  assert.equal(isSuperadminMode({ is_superadmin: true }, owner), false);
  assert.equal(isSuperadminMode({ is_superadmin: true }, { kind: "superadmin" }), true);
  assert.equal(isSuperadminMode({ is_superadmin: false }, { kind: "superadmin" }), false);
});

test("support request actions depend on the side and state", () => {
  const pending = { status: "pending", expires_at: null, direction: "association_request" };
  assert.deepEqual(grantActions(pending, "platform"), { canDecide: true, canCancel: false, canComplete: false, canEnd: false });
  assert.deepEqual(grantActions(pending, "association"), { canDecide: false, canCancel: true, canComplete: false, canEnd: false });
  const active = { status: "approved", expires_at: new Date(Date.now() + 60_000).toISOString(), direction: "association_request" };
  assert.deepEqual(grantActions(active, "platform"), { canDecide: false, canCancel: false, canComplete: true, canEnd: false });
  assert.deepEqual(grantActions(active, "association"), { canDecide: false, canCancel: false, canComplete: false, canEnd: true });
  const done = { status: "completed", expires_at: new Date().toISOString(), direction: "association_request" };
  assert.deepEqual(Object.values(grantActions(done, "platform")), [false, false, false, false]);
});

test("archive, vendors & finance access follows the board permissions", () => {
  const owner: Access = { ...none, role: "owner", roles: ["owner"] };
  const treasurer: Access = { ...none, role: "board_member", roles: ["board_member"], permissions: ["finance"] };
  assert.equal(canView(owner, "documents"), true);
  assert.equal(canManage(owner, "documents"), false);
  assert.equal(canView(owner, "vendors"), false, "owners get the directory, not full vendor data");
  assert.equal(canView(owner, "finance"), false, "owners get totals only");
  assert.equal(canManage(treasurer, "finance"), true);
  assert.equal(canManage(treasurer, "vendors"), false);
  assert.equal(canView(treasurer, "vendors"), true, "board sees vendors");
  const sup: Access = { ...none, grants: [{ id: "g", sections: ["vendors"], can_edit: true, expires_at: future }] };
  assert.equal(canManage(sup, "vendors"), true);
  assert.equal(canView(sup, "finance"), false);
});
