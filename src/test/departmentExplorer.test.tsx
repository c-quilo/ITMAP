import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/DepartmentCollaborationGraph", () => ({
  default: () => null,
}));

vi.mock("@/components/DepartmentReachGraph", () => ({
  default: () => null,
}));

vi.mock("@/lib/researcherSearch", () => ({
  getOrganizationConnectionNetworks: vi.fn(),
  getOrganizationProfile: vi.fn(),
  suggestOrganizations: vi.fn().mockResolvedValue([]),
  listOrganizations: vi.fn().mockResolvedValue([
    {
      name: "Department of Mechanical Engineering",
      kind: "department",
      researcherCount: 180,
      score: 1,
      groupKey: "engineering",
      groupName: "Faculty of Engineering",
      groupResearcherCount: 2176,
      groupUnitCount: 10,
      parentName: "Faculty of Engineering",
      scope: "faculty",
      officialUrl: "https://www.imperial.ac.uk/engineering/departments/",
    },
    {
      name: "Grantham Institute for Climate Change",
      kind: "institute",
      researcherCount: 48,
      score: 1,
      groupKey: "cross-college",
      groupName: "Cross-College institutes & centres",
      groupResearcherCount: 98,
      groupUnitCount: 5,
      parentName: "Imperial College London",
      scope: "cross-college",
      officialUrl: "https://www.imperial.ac.uk/multidisciplinary-research/",
    },
  ]),
}));

import DepartmentExplorer from "@/components/DepartmentExplorer";

describe("DepartmentExplorer", () => {
  it("loads and groups the organisation directory", async () => {
    render(<DepartmentExplorer />);

    expect(await screen.findByText("Department of Mechanical Engineering")).toBeVisible();
    expect(screen.getAllByText("Grantham Institute for Climate Change")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Faculty of Engineering" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Cross-College institutes & centres" })).toBeVisible();
    expect(screen.getByText("2 organisations")).toBeVisible();
  });
});
