import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRankingItemFromRepo,
  filterPptRepos,
  mergeRankingItems,
  slugFromRepo
} from "./sync-ppt-stars.mjs";

const baseRepo = {
  full_name: "op7418/guizang-ppt-skill",
  name: "guizang-ppt-skill",
  description: "AI-agent Skill for generating polished HTML slide decks.",
  html_url: "https://github.com/op7418/guizang-ppt-skill",
  homepage: "",
  stargazers_count: 21851,
  language: "JavaScript",
  topics: ["ppt", "presentation"],
  owner: {
    login: "op7418",
    avatar_url: "https://avatars.githubusercontent.com/u/13505770?v=4"
  },
  updated_at: "2026-07-20T01:02:03Z"
};

const existingItems = [
  {
    rank: 1,
    slug: "signalforge",
    name: "SignalForge",
    repo: "microsoft/agent-framework",
    avatarUrl: "https://github.com/microsoft.png?size=96",
    description: "Existing item",
    category: "AI 技能",
    libraryCategory: "必装底座",
    collectionStatus: "深度核验",
    verificationStatus: "官方",
    sourceType: "官方开发工具",
    platforms: ["GitHub"],
    installPathCount: 1,
    collectedAt: "2026-07-19",
    reviewedAt: "2026-07-19",
    tags: ["agent"],
    weeklyGrowth: "+0",
    totalStars: "1",
    score: "80 / 100",
    featured: false,
    insight: "Existing insight",
    websiteUrl: "https://example.com",
    repoUrl: "https://github.com/microsoft/agent-framework",
    highlights: ["Existing highlight"],
    useCases: ["Existing use case"],
    limitations: ["Existing limitation"],
    alternatives: ["Kernel Scout"]
  },
  {
    rank: 2,
    slug: "kernel-scout",
    name: "Kernel Scout",
    repo: "example/kernel-scout",
    avatarUrl: "https://github.com/example.png?size=96",
    description: "Existing item",
    category: "开发工具",
    libraryCategory: "开发工具",
    collectionStatus: "候选观察",
    verificationStatus: "需校验",
    sourceType: "GitHub",
    platforms: ["GitHub"],
    installPathCount: 1,
    collectedAt: "2026-07-19",
    reviewedAt: "2026-07-19",
    tags: ["kernel"],
    weeklyGrowth: "+0",
    totalStars: "2",
    score: "75 / 100",
    featured: false,
    insight: "Existing insight",
    websiteUrl: "https://example.com/kernel",
    repoUrl: "https://github.com/example/kernel-scout",
    highlights: ["Existing highlight"],
    useCases: ["Existing use case"],
    limitations: ["Existing limitation"],
    alternatives: ["SignalForge"]
  }
];

test("filterPptRepos keeps presentation-related GitHub repositories only", () => {
  const repos = [
    baseRepo,
    {
      ...baseRepo,
      full_name: "example/chat-agent",
      name: "chat-agent",
      description: "A general chat assistant",
      topics: ["chat"]
    }
  ];

  assert.deepEqual(filterPptRepos(repos).map((repo) => repo.full_name), [
    "op7418/guizang-ppt-skill"
  ]);
});

test("slugFromRepo creates stable slugs from repository full names", () => {
  assert.equal(slugFromRepo("op7418/guizang-ppt-skill"), "op7418-guizang-ppt-skill");
});

test("buildRankingItemFromRepo creates a valid PPT library item", () => {
  const item = buildRankingItemFromRepo(baseRepo, {
    rank: 3,
    date: "2026-07-20",
    alternatives: ["SignalForge", "Kernel Scout"]
  });

  assert.equal(item.rank, 3);
  assert.equal(item.slug, "op7418-guizang-ppt-skill");
  assert.equal(item.repo, "op7418/guizang-ppt-skill");
  assert.equal(item.libraryCategory, "PPT");
  assert.equal(item.collectionStatus, "候选观察");
  assert.equal(item.verificationStatus, "社区验证");
  assert.equal(item.repoUrl, "https://github.com/op7418/guizang-ppt-skill");
  assert.equal(item.totalStars, "21.9k");
  assert.deepEqual(item.alternatives, ["SignalForge", "Kernel Scout"]);
});

test("mergeRankingItems updates an existing repo instead of appending duplicates", () => {
  const currentPptItem = buildRankingItemFromRepo(baseRepo, {
    rank: 3,
    date: "2026-07-19",
    alternatives: ["SignalForge", "Kernel Scout"]
  });
  const refreshedPptItem = {
    ...currentPptItem,
    totalStars: "22.0k",
    reviewedAt: "2026-07-20"
  };

  const merged = mergeRankingItems([...existingItems, currentPptItem], [refreshedPptItem]);

  assert.equal(merged.length, 3);
  assert.equal(
    merged.find((item) => item.repo === "op7418/guizang-ppt-skill").totalStars,
    "22.0k"
  );
});

test("mergeRankingItems preserves manual Chinese copy for an existing repo", () => {
  const currentPptItem = {
    ...buildRankingItemFromRepo(baseRepo, {
      rank: 3,
      date: "2026-07-19",
      alternatives: ["SignalForge", "Kernel Scout"]
    }),
    description: "适合快速生成高完成度 HTML 幻灯片的 PPT 技能包。",
    insight: "这是一条已经手工整理过的中文说明。",
    tags: ["PPT", "HTML 幻灯片"],
    highlights: ["中文亮点 1"],
    useCases: ["中文场景 1"],
    limitations: ["中文限制 1"]
  };
  const refreshedPptItem = buildRankingItemFromRepo(baseRepo, {
    rank: 3,
    date: "2026-07-20",
    alternatives: ["SignalForge", "Kernel Scout"]
  });

  const merged = mergeRankingItems([...existingItems, currentPptItem], [refreshedPptItem]);
  const updated = merged.find((item) => item.repo === "op7418/guizang-ppt-skill");

  assert.equal(updated.description, "适合快速生成高完成度 HTML 幻灯片的 PPT 技能包。");
  assert.equal(updated.insight, "这是一条已经手工整理过的中文说明。");
  assert.deepEqual(updated.tags, ["PPT", "HTML 幻灯片"]);
  assert.deepEqual(updated.highlights, ["中文亮点 1"]);
  assert.deepEqual(updated.useCases, ["中文场景 1"]);
  assert.deepEqual(updated.limitations, ["中文限制 1"]);
});

test("mergeRankingItems appends new repos after the current max rank", () => {
  const pptItem = buildRankingItemFromRepo(baseRepo, {
    rank: 99,
    date: "2026-07-20",
    alternatives: ["SignalForge", "Kernel Scout"]
  });

  const merged = mergeRankingItems(existingItems, [pptItem]);
  const inserted = merged.find((item) => item.repo === "op7418/guizang-ppt-skill");

  assert.equal(inserted.rank, 3);
  assert.equal(merged.length, 3);
});
