import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const rankingsPath = join(rootDir, "src", "data", "rankings.json");
const defaultGithubUser = "guiping02-byte";
const defaultDate = new Date().toISOString().slice(0, 10);

const pptKeywords = [
  "ppt",
  "powerpoint",
  "presentation",
  "presentations",
  "slide",
  "slides",
  "deck",
  "keynote",
  "幻灯片",
  "演示",
  "简报",
  "课件"
];

const readJson = async (path) => {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
};

const writeJson = async (path, data) => {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const normalizeText = (value) => String(value ?? "").toLowerCase();

const repoKey = (item) => normalizeText(item.repo || item.full_name || item.repoUrl || item.html_url);
const manualCopyFields = ["description", "insight", "tags", "highlights", "useCases", "limitations"];

export const slugFromRepo = (fullName) =>
  normalizeText(fullName)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const formatStars = (count) => {
  const stars = Number.isFinite(count) ? count : 0;

  if (stars >= 1000) {
    return `${(stars / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }

  return String(stars);
};

export const filterPptRepos = (repos) =>
  repos.filter((repo) => {
    const searchableText = [
      repo.full_name,
      repo.name,
      repo.description,
      repo.homepage,
      ...(Array.isArray(repo.topics) ? repo.topics : [])
    ]
      .filter(Boolean)
      .map(normalizeText)
      .join(" ");

    return pptKeywords.some((keyword) => searchableText.includes(normalizeText(keyword)));
  });

const uniqueNonEmpty = (values) => [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];

const buildScore = (stars) => {
  const safeStars = Number.isFinite(stars) ? stars : 0;
  const score = Math.min(88, Math.round(68 + Math.log10(safeStars + 1) * 4));
  return `${score} / 100`;
};

export const buildRankingItemFromRepo = (repo, options) => {
  const repoUrl = repo.html_url || `https://github.com/${repo.full_name}`;
  const date = options.date || defaultDate;
  const topics = Array.isArray(repo.topics) ? repo.topics : [];
  const tags = uniqueNonEmpty([...topics.slice(0, 5), "ppt", "github-star"]);
  const alternatives = uniqueNonEmpty(options.alternatives || []).slice(0, 3);
  const language = repo.language ? String(repo.language) : "";

  return {
    rank: options.rank,
    slug: slugFromRepo(repo.full_name),
    name: repo.name || repo.full_name,
    repo: repo.full_name,
    avatarUrl: repo.owner?.avatar_url || `https://github.com/${repo.owner?.login || repo.full_name.split("/")[0]}.png?size=96`,
    description: repo.description || "从 GitHub 星标同步进来的 PPT 相关工具，适合后续补充中文说明和使用场景。",
    category: "AI 技能",
    libraryCategory: "PPT",
    collectionStatus: "候选观察",
    verificationStatus: "社区验证",
    sourceType: "GitHub 星标",
    platforms: uniqueNonEmpty(["GitHub", language]),
    installPathCount: 1,
    collectedAt: date,
    reviewedAt: date,
    tags,
    weeklyGrowth: "+0",
    totalStars: formatStars(repo.stargazers_count),
    score: buildScore(repo.stargazers_count),
    featured: false,
    insight: "这是从你的 GitHub 星标同步进来的 PPT 相关项目，适合先放入候选观察，再逐步补充实测结论。",
    websiteUrl: repo.homepage || repoUrl,
    repoUrl,
    highlights: [
      "来自你的 GitHub 星标，方便把平时收藏的 PPT 工具沉淀到站内。",
      "已自动归入 PPT 分类，可以在工具库里用分类和搜索快速找到。",
      "保留 GitHub 仓库链接，后续可以继续补充中文教程、适用人群和示例。"
    ],
    useCases: [
      "想把 GitHub 上收藏的 PPT 技巧、模板或自动化工具集中管理。",
      "需要给刚入门 AI 的同事快速找到可试用的 PPT 相关工具。",
      "准备后续把高价值仓库整理成中文教程或工作流卡片。"
    ],
    limitations: [
      "当前同步依据仓库名称、描述和 topic 关键词判断，可能需要人工二次确认。",
      "GitHub 星标只能说明你收藏过，不代表已经完成深度实测。"
    ],
    alternatives
  };
};

export const mergeRankingItems = (existingItems, incomingItems) => {
  const merged = [...existingItems];
  const indexByRepo = new Map();

  merged.forEach((item, index) => {
    indexByRepo.set(repoKey(item), index);
    if (item.repoUrl) {
      indexByRepo.set(normalizeText(item.repoUrl), index);
    }
  });

  let nextRank = Math.max(0, ...merged.map((item) => item.rank || 0)) + 1;

  incomingItems.forEach((incomingItem) => {
    const existingIndex = indexByRepo.get(repoKey(incomingItem)) ?? indexByRepo.get(normalizeText(incomingItem.repoUrl));

    if (existingIndex !== undefined) {
      const existingItem = merged[existingIndex];
      const preservedManualCopy = Object.fromEntries(
        manualCopyFields.map((field) => [field, existingItem[field]])
      );
      merged[existingIndex] = {
        ...existingItem,
        ...incomingItem,
        ...preservedManualCopy,
        rank: existingItem.rank,
        collectedAt: existingItem.collectedAt || incomingItem.collectedAt,
        featured: existingItem.featured
      };
      return;
    }

    const itemToInsert = {
      ...incomingItem,
      rank: nextRank
    };
    nextRank += 1;
    merged.push(itemToInsert);
    indexByRepo.set(repoKey(itemToInsert), merged.length - 1);
    indexByRepo.set(normalizeText(itemToInsert.repoUrl), merged.length - 1);
  });

  return merged;
};

const parseLinkHeader = (linkHeader) => {
  if (!linkHeader) {
    return {};
  }

  return Object.fromEntries(
    linkHeader.split(",").map((part) => {
      const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
      return match ? [match[2], match[1]] : ["", ""];
    }).filter(([rel, url]) => rel && url)
  );
};

const fetchStarredRepos = async (user) => {
  const repos = [];
  let url = `https://api.github.com/users/${encodeURIComponent(user)}/starred?per_page=100`;

  while (url) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "skill-market-radar",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub starred API returned ${response.status} ${response.statusText}`);
    }

    const page = await response.json();
    repos.push(...page);
    url = parseLinkHeader(response.headers.get("link")).next;
  }

  return repos;
};

const getAlternativeNames = (rankings) => rankings.map((item) => item.name).filter(Boolean).slice(0, 3);

const main = async () => {
  const userArg = process.argv.find((arg) => arg.startsWith("--user="));
  const user = userArg?.split("=")[1] || process.env.GITHUB_STARS_USER || defaultGithubUser;
  const dryRun = process.argv.includes("--dry-run");
  const date = process.env.SYNC_DATE || defaultDate;
  const rankings = await readJson(rankingsPath);
  const starredRepos = await fetchStarredRepos(user);
  const pptRepos = filterPptRepos(starredRepos);
  const alternatives = getAlternativeNames(rankings);
  const maxRank = Math.max(0, ...rankings.map((item) => item.rank || 0));
  const incomingItems = pptRepos.map((repo, index) =>
    buildRankingItemFromRepo(repo, {
      rank: maxRank + index + 1,
      date,
      alternatives
    })
  );
  const merged = mergeRankingItems(rankings, incomingItems);
  const addedCount = merged.length - rankings.length;
  const matchedRepos = pptRepos.map((repo) => repo.full_name).join(", ") || "none";

  if (!dryRun) {
    await writeJson(rankingsPath, merged);
  }

  console.log(`Fetched ${starredRepos.length} starred repos from ${user}.`);
  console.log(`Matched ${pptRepos.length} PPT repos: ${matchedRepos}.`);
  console.log(`${dryRun ? "Dry run" : "Updated rankings.json"}; added ${addedCount}, total ${merged.length}.`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
