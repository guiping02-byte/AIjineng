import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRankingItemFromListedRepo,
  fetchJsonWithRetry,
  fetchTextWithRetry,
  fetchWithRetry,
  extractListDescriptionFromHtml,
  extractListNameFromHtml,
  mergeListedRankingItems,
  parseRepoFullNamesFromStarListHtml,
  parseStarListLinks,
  replaceExportedRecord,
  replaceExportedStringArray
} from "./sync-github-star-lists.mjs";

const repo = {
  full_name: "op7418/guizang-ppt-skill",
  name: "guizang-ppt-skill",
  description: "AI-agent Skill for generating polished HTML slide decks.",
  html_url: "https://github.com/op7418/guizang-ppt-skill",
  homepage: "",
  stargazers_count: 22734,
  language: "HTML",
  topics: ["ppt", "presentation"],
  owner: {
    login: "op7418",
    avatar_url: "https://avatars.githubusercontent.com/u/13505770?v=4"
  }
};

const existingItem = {
  rank: 9,
  slug: "op7418-guizang-ppt-skill",
  name: "guizang-ppt-skill",
  repo: "op7418/guizang-ppt-skill",
  avatarUrl: "https://avatars.githubusercontent.com/u/13505770?v=4",
  description: "适合快速生成高完成度 HTML 幻灯片的 PPT 技能包。",
  category: "AI 技能",
  libraryCategory: "PPT",
  collectionStatus: "候选观察",
  verificationStatus: "社区验证",
  sourceType: "GitHub 星标",
  platforms: ["GitHub", "HTML"],
  installPathCount: 1,
  collectedAt: "2026-07-21",
  reviewedAt: "2026-07-21",
  tags: ["PPT", "HTML 幻灯片"],
  weeklyGrowth: "+0",
  totalStars: "21.9k",
  score: "85 / 100",
  featured: true,
  insight: "这是已经手工整理过的中文说明。",
  websiteUrl: "https://github.com/op7418/guizang-ppt-skill",
  repoUrl: "https://github.com/op7418/guizang-ppt-skill",
  highlights: ["中文亮点"],
  useCases: ["中文场景"],
  limitations: ["中文限制"],
  alternatives: ["旧工具"]
};

test("parseStarListLinks extracts public GitHub star lists in page order", () => {
  const html = `
    <a href="/stars/guiping02-byte/lists/ppt-html">ppt/html</a>
    <a href="/stars/guiping02-byte/lists/%E5%BA%94%E7%94%A8">应用</a>
    <a href="/stars/other-user/lists/ignore-me">ignore</a>
  `;

  assert.deepEqual(parseStarListLinks(html, "guiping02-byte"), [
    {
      href: "/stars/guiping02-byte/lists/ppt-html",
      fallbackName: "ppt/html"
    },
    {
      href: "/stars/guiping02-byte/lists/%E5%BA%94%E7%94%A8",
      fallbackName: "应用"
    }
  ]);
});

test("parseRepoFullNamesFromStarListHtml extracts repository names from a list page", () => {
  const html = `
    <div id="user-list-repositories">
      <a href="/op7418/guizang-ppt-skill"><span>op7418 / </span>guizang-ppt-skill</a>
      <a href="/op7418/guizang-ppt-skill/stargazers">22,734</a>
      <a href="/hugohe3/ppt-master"><span>hugohe3 / </span>ppt-master</a>
    </div>
  `;

  assert.deepEqual(parseRepoFullNamesFromStarListHtml(html), [
    "op7418/guizang-ppt-skill",
    "hugohe3/ppt-master"
  ]);
});

test("extractListNameFromHtml prefers the GitHub document title over the global search heading", () => {
  const html = `
    <title>guiping02-byte&#39;s list / ppt/html · GitHub</title>
    <h1>Search code, repositories, users, issues, pull requests...</h1>
    <h1>ppt/html</h1>
  `;

  assert.equal(extractListNameFromHtml(html, "ppt/html"), "ppt/html");
});

test("extractListDescriptionFromHtml reads the GitHub list description", () => {
  const html = `
    <meta property="og:description" content="内容创作者必看，含排版，写作风格，去AI化，设计工具" />
    <h1>内容创作</h1>
    <div class="f4 mt-2 tmp-mb-3">页面正文描述</div>
  `;

  assert.equal(
    extractListDescriptionFromHtml(html),
    "内容创作者必看，含排版，写作风格，去AI化，设计工具"
  );
});

test("buildRankingItemFromListedRepo uses the GitHub list name as the library category", () => {
  const item = buildRankingItemFromListedRepo(repo, {
    rank: 1,
    date: "2026-07-30",
    listName: "ppt/html",
    alternatives: ["ppt-master"]
  });

  assert.equal(item.rank, 1);
  assert.equal(item.repo, "op7418/guizang-ppt-skill");
  assert.equal(item.libraryCategory, "ppt/html");
  assert.equal(item.sourceType, "GitHub Star List");
  assert.equal(item.totalStars, "22.7k");
  assert.deepEqual(item.alternatives, ["ppt-master"]);
});

test("mergeListedRankingItems keeps only listed repos, reranks, and preserves manual copy", () => {
  const incoming = buildRankingItemFromListedRepo(repo, {
    rank: 1,
    date: "2026-07-30",
    listName: "ppt/html",
    alternatives: []
  });
  const staleItem = {
    ...existingItem,
    rank: 1,
    name: "SignalForge",
    repo: "microsoft/agent-framework",
    slug: "signalforge"
  };

  const merged = mergeListedRankingItems([staleItem, existingItem], [incoming]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].rank, 1);
  assert.equal(merged[0].libraryCategory, "ppt/html");
  assert.equal(merged[0].description, "适合快速生成高完成度 HTML 幻灯片的 PPT 技能包。");
  assert.equal(merged[0].insight, "这是已经手工整理过的中文说明。");
  assert.equal(merged[0].featured, true);
  assert.deepEqual(merged[0].alternatives, ["guizang-ppt-skill"]);
});

test("replaceExportedStringArray updates library categories while keeping other exports", () => {
  const source = `
export const categories = [
  "全部",
  "AI 技能"
];

export const libraryCategories = [
  "全部",
  "PPT"
];
`;

  assert.equal(
    replaceExportedStringArray(source, "libraryCategories", ["全部", "ppt/html", "应用"]),
    `
export const categories = [
  "全部",
  "AI 技能"
];

export const libraryCategories = [
  "全部",
  "ppt/html",
  "应用"
];
`
  );
});

test("replaceExportedRecord updates category descriptions while keeping other exports", () => {
  const source = `
export const libraryCategoryDescriptions = {
  "PPT": "旧介绍"
};

export const rankings = rankingsData as RankingItem[];
`;

  assert.equal(
    replaceExportedRecord(source, "libraryCategoryDescriptions", {
      "内容创作": "内容创作者必看，含排版，写作风格，去AI化，设计工具",
      "ppt/html": ""
    }),
    `
export const libraryCategoryDescriptions = {
  "内容创作": "内容创作者必看，含排版，写作风格，去AI化，设计工具",
  "ppt/html": ""
};

export const rankings = rankingsData as RankingItem[];
`
  );
});

test("fetchWithRetry retries transient network failures", async () => {
  let calls = 0;
  const response = { ok: true, status: 200, statusText: "OK" };
  const fetchImpl = async () => {
    calls += 1;

    if (calls === 1) {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })
      });
    }

    return response;
  };

  assert.equal(await fetchWithRetry("https://github.com/example", {}, fetchImpl), response);
  assert.equal(calls, 2);
});

test("fetchTextWithRetry retries when response body reading is interrupted", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => {
        if (calls === 1) {
          throw Object.assign(new TypeError("terminated"), {
            cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })
          });
        }

        return "<html>ok</html>";
      }
    };
  };

  assert.equal(await fetchTextWithRetry("https://github.com/example", {}, fetchImpl), "<html>ok</html>");
  assert.equal(calls, 2);
});

test("fetchJsonWithRetry retries when JSON body reading is interrupted", async () => {
  let calls = 0;
  const payload = { full_name: "op7418/guizang-ppt-skill" };
  const fetchImpl = async () => {
    calls += 1;

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        if (calls === 1) {
          throw Object.assign(new TypeError("terminated"), {
            cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })
          });
        }

        return payload;
      }
    };
  };

  assert.deepEqual(await fetchJsonWithRetry("https://api.github.com/repos/example/repo", {}, fetchImpl), payload);
  assert.equal(calls, 2);
});
