import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveProjectAccess } from "./permissions";

const PROJECT_ID = 10;
const PCS = [
  { id: 100, companyId: 1 },
  { id: 101, companyId: 2 },
  { id: 102, companyId: 3 },
];

describe("resolveProjectAccess", () => {
  it("returns null for users with no membership and no assignment", () => {
    const result = resolveProjectAccess({
      projectId: PROJECT_ID,
      companyMemberships: [{ companyId: 99, role: "member" }],
      assignments: [],
      projectCompanyRows: PCS,
    });
    assert.equal(result, null);
  });

  it("plain member membership does NOT grant access", () => {
    const result = resolveProjectAccess({
      projectId: PROJECT_ID,
      companyMemberships: [{ companyId: 1, role: "member" }],
      assignments: [],
      projectCompanyRows: PCS,
    });
    assert.equal(result, null);
  });

  it("company admin on a participating company gets project admin", () => {
    const result = resolveProjectAccess({
      projectId: PROJECT_ID,
      companyMemberships: [{ companyId: 1, role: "admin" }],
      assignments: [],
      projectCompanyRows: PCS,
    });
    assert.ok(result);
    assert.equal(result!.isAdmin, true);
    assert.deepEqual(result!.projectCompanyIds, [100]);
  });

  it("company admin on a non-participating company is denied", () => {
    const result = resolveProjectAccess({
      projectId: PROJECT_ID,
      companyMemberships: [{ companyId: 999, role: "admin" }],
      assignments: [],
      projectCompanyRows: PCS,
    });
    assert.equal(result, null);
  });

  it("PM assignment grants pm role with no project_company scoping", () => {
    const result = resolveProjectAccess({
      projectId: PROJECT_ID,
      companyMemberships: [],
      assignments: [{ role: "pm", companyId: null }],
      projectCompanyRows: PCS,
    });
    assert.ok(result);
    assert.equal(result!.isPm, true);
    assert.equal(result!.isAdmin, false);
    assert.deepEqual(result!.projectCompanyIds, []);
  });

  it("contractor assignment scopes projectCompanyIds to its company only", () => {
    const result = resolveProjectAccess({
      projectId: PROJECT_ID,
      companyMemberships: [{ companyId: 99, role: "member" }],
      assignments: [{ role: "contractor_lead", companyId: 2 }],
      projectCompanyRows: PCS,
    });
    assert.ok(result);
    assert.equal(result!.isContractor, true);
    assert.equal(result!.isPm, false);
    assert.equal(result!.isAdmin, false);
    assert.deepEqual(result!.projectCompanyIds, [101]);
  });

  it("viewer-only flag is set when only viewer role applies", () => {
    const result = resolveProjectAccess({
      projectId: PROJECT_ID,
      companyMemberships: [],
      assignments: [{ role: "viewer", companyId: null }],
      projectCompanyRows: PCS,
    });
    assert.ok(result);
    assert.equal(result!.isViewerOnly, true);
  });

  it("admin + contractor combine roles and projectCompanyIds", () => {
    const result = resolveProjectAccess({
      projectId: PROJECT_ID,
      companyMemberships: [{ companyId: 1, role: "admin" }],
      assignments: [{ role: "contractor_member", companyId: 2 }],
      projectCompanyRows: PCS,
    });
    assert.ok(result);
    assert.equal(result!.isAdmin, true);
    assert.equal(result!.isContractor, true);
    assert.deepEqual(result!.projectCompanyIds.sort(), [100, 101]);
  });
});
