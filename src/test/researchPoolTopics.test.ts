import { describe, expect, it } from "vitest";
import { buildResearchPoolTopicLandscape } from "@/lib/researcherSearch";
import type { Researcher } from "@/data/mockData";

function researcher(id: string, topics: NonNullable<Researcher["openAlexTopics"]>): Researcher {
  return {
    id,
    name: `Researcher ${id}`,
    title: "Researcher",
    department: "Department",
    faculty: "Faculty",
    summary: "",
    keywords: [],
    matchedKeywords: [],
    relevanceScore: 80,
    publications: [],
    imageInitials: id,
    role: "lecturer",
    openAlexTopics: topics,
  };
}

describe("buildResearchPoolTopicLandscape", () => {
  it("ranks topics by researcher coverage and ignores contextual topics", () => {
    const pesticideTopic = {
      openalexTopicId: "T1",
      label: "Pesticide exposure and health risks",
      keywords: ["pesticides", "exposure"],
      topicStrength: 0.4,
      paperCount: 6,
      recentPaperCount: 3,
      trend: "emerging",
      relevance: 0.92,
    };
    const landscape = buildResearchPoolTopicLandscape([
      researcher("1", [
        pesticideTopic,
        {
          label: "Unrelated context",
          keywords: [],
          topicStrength: 0.8,
          paperCount: 20,
          recentPaperCount: 1,
          trend: "stable",
          relevance: 0.05,
        },
      ]),
      researcher("2", [{ ...pesticideTopic, paperCount: 4, recentPaperCount: 1 }]),
    ]);

    expect(landscape).toHaveLength(1);
    expect(landscape[0]).toMatchObject({
      label: "Pesticide exposure and health risks",
      researcherCount: 2,
      paperCount: 10,
      recentPaperCount: 4,
      emerging: true,
    });
  });
});
