import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { formatStars, slugFromRepo } from "./sync-ppt-stars.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const rankingsPath = join(rootDir, "src", "data", "rankings.json");
const rankingsTsPath = join(rootDir, "src", "data", "rankings.ts");
const defaultGithubUser = "guiping02-byte";
const defaultDate = new Date().toISOString().slice(0, 10);
const manualCopyFields = ["description", "insight", "tags", "highlights", "useCases", "limitations"];

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, data) => {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const normalizeText = (value) => String(value ?? "").toLowerCase();
const uniqueNonEmpty = (values) => [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
const repoKey = (item) => normalizeText(item.repo || item.full_name || item.repoUrl || item.html_url);

const decodeHtmlEntities = (value) =>
  String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const listSlugToName = (slug) => decodeURIComponent(slug).replace(/-/g, "/");

const buildScore = (stars) => {
  const safeStars = Number.isFinite(stars) ? stars : 0;
  const score = Math.min(88, Math.round(68 + Math.log10(safeStars + 1) * 4));
  return `${score} / 100`;
};

const categoryForListName = (listName) => {
  if (listName === "应用" || listName === "新闻资讯") {
    return "AI 应用";
  }

  return "AI 技能";
};

export const extractListNameFromHtml = (html, fallbackName) => {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  const source = title || h1 || fallbackName;
  const text = decodeHtmlEntities(source)
    .replace(/<[^>]+>/g, "")
    .replace(/^.* list \//i, "")
    .replace(/ · GitHub$/i, "")
    .trim();

  return text || fallbackName;
};

export const extractListDescriptionFromHtml = (html) => {
  const metaDescription = html.match(/<meta property="og:description" content="([^"]*)"/i)?.[1]
    || html.match(/<meta name="twitter:description" content="([^"]*)"/i)?.[1];
  const bodyDescription = html.match(/<h1[^>]*>[\s\S]*?<\/h1>\s*<\/div>\s*<div class="[^"]*\bf4\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  const source = metaDescription || bodyDescription || "";

  return decodeHtmlEntities(source)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

export const parseStarListLinks = (html, user) => {
  const escapedUser = user.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`href="(\\/stars\\/${escapedUser}\\/lists\\/([^"]+))"`, "g");
  const seen = new Set();
  const links = [];

  for (const match of html.matchAll(pattern)) {
    const href = match[1].replace(/&amp;/g, "&");
    const slug = match[2];

    if (seen.has(href)) {
      continue;
    }

    seen.add(href);
    links.push({
      href,
      fallbackName: listSlugToName(slug)
    });
  }

  return links;
};

export const parseRepoFullNamesFromStarListHtml = (html) => {
  const sectionStart = html.search(/<div id="user-list-repositories"/i);
  const repositorySection = sectionStart >= 0 ? html.slice(sectionStart) : html;
  const seen = new Set();
  const repos = [];

  for (const match of repositorySection.matchAll(/href="\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)"/g)) {
    const fullName = match[1];

    if (seen.has(fullName)) {
      continue;
    }

    seen.add(fullName);
    repos.push(fullName);
  }

  return repos;
};

export const buildRankingItemFromListedRepo = (repo, options) => {
  const repoUrl = repo.html_url || `https://github.com/${repo.full_name}`;
  const date = options.date || defaultDate;
  const topics = Array.isArray(repo.topics) ? repo.topics : [];
  const listName = options.listName;
  const language = repo.language ? String(repo.language) : "";
  const tags = uniqueNonEmpty([...topics.slice(0, 5), listName, "GitHub 星标"]);
  const alternatives = uniqueNonEmpty(options.alternatives || []).slice(0, 3);

  return {
    rank: options.rank,
    slug: slugFromRepo(repo.full_name),
    name: repo.name || repo.full_name,
    repo: repo.full_name,
    avatarUrl: repo.owner?.avatar_url || `https://github.com/${repo.owner?.login || repo.full_name.split("/")[0]}.png?size=96`,
    description: repo.description || `从你的 GitHub「${listName}」列表同步进来的工具，适合后续补充中文说明和使用场景。`,
    category: categoryForListName(listName),
    libraryCategory: listName,
    collectionStatus: "候选观察",
    verificationStatus: "社区验证",
    sourceType: "GitHub Star List",
    platforms: uniqueNonEmpty(["GitHub", language]),
    installPathCount: 1,
    collectedAt: date,
    reviewedAt: date,
    tags,
    weeklyGrowth: "+0",
    totalStars: formatStars(repo.stargazers_count),
    score: buildScore(repo.stargazers_count),
    featured: false,
    insight: `这是从你的 GitHub「${listName}」收藏列表同步进来的项目，可以先作为候选沉淀，再逐步补充实测结论。`,
    websiteUrl: repo.homepage || repoUrl,
    repoUrl,
    highlights: [
      `来自你的 GitHub「${listName}」列表，网页分类会和 GitHub 收藏分类保持一致。`,
      "保留 GitHub 仓库链接，方便后续回到源码、文档或示例继续查看。",
      "同步时会补齐星标数、语言和仓库头像，减少手工维护成本。"
    ],
    useCases: [
      "想把 GitHub 上收藏的 AI 工具按原有列表沉淀到站内。",
      "需要给同事展示自己筛过的一组仓库，而不是临时翻 GitHub 收藏夹。",
      "准备后续把高价值仓库整理成中文教程、工作流卡片或工具说明。"
    ],
    limitations: [
      "当前同步只能读取 GitHub 公开可访问的 Star Lists，私有或未公开列表需要登录态支持。",
      "GitHub 星标只能说明你收藏过，不代表已经完成深度实测。"
    ],
    alternatives
  };
};

const normalizeAlternatives = (items) => {
  const names = items.map((item) => item.name).filter(Boolean);

  return items.map((item) => {
    const validExisting = Array.isArray(item.alternatives)
      ? item.alternatives.filter((name) => name !== item.name && names.includes(name))
      : [];
    const fallback = names.filter((name) => name !== item.name);

    return {
      ...item,
      alternatives: uniqueNonEmpty([...validExisting, ...fallback, item.name]).slice(0, 3)
    };
  });
};

export const mergeListedRankingItems = (existingItems, incomingItems) => {
  const existingByRepo = new Map();

  existingItems.forEach((item) => {
    existingByRepo.set(repoKey(item), item);
    if (item.repoUrl) {
      existingByRepo.set(normalizeText(item.repoUrl), item);
    }
  });

  const merged = incomingItems.map((incomingItem, index) => {
    const existingItem = existingByRepo.get(repoKey(incomingItem)) || existingByRepo.get(normalizeText(incomingItem.repoUrl));
    const preservedManualCopy = existingItem
      ? Object.fromEntries(manualCopyFields.map((field) => [field, existingItem[field]]))
      : {};

    return {
      ...(existingItem || {}),
      ...incomingItem,
      ...preservedManualCopy,
      rank: index + 1,
      collectedAt: existingItem?.collectedAt || incomingItem.collectedAt,
      featured: existingItem?.featured ?? incomingItem.featured
    };
  });

  return normalizeAlternatives(merged);
};

export const replaceExportedStringArray = (source, exportName, values) => {
  const replacement = `export const ${exportName} = [\n${values.map((value) => `  ${JSON.stringify(value)}`).join(",\n")}\n];`;
  const pattern = new RegExp(`export const ${exportName} = \\[[\\s\\S]*?\\];`);

  if (!pattern.test(source)) {
    throw new Error(`Could not find exported ${exportName}.`);
  }

  return source.replace(pattern, replacement);
};

export const replaceExportedRecord = (source, exportName, record) => {
  const entries = Object.entries(record);
  const replacement = `export const ${exportName} = {\n${entries.map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(",\n")}\n};`;
  const pattern = new RegExp(`export const ${exportName} = \\{[\\s\\S]*?\\};`);

  if (pattern.test(source)) {
    return source.replace(pattern, replacement);
  }

  return source.replace(
    /export const rankings = rankingsData as RankingItem\[];/,
    `${replacement}\n\nexport const rankings = rankingsData as RankingItem[];`
  );
};

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "skill-market-radar",
  "X-GitHub-Api-Version": "2022-11-28"
};

const htmlHeaders = {
  Accept: "text/html",
  "User-Agent": "skill-market-radar"
};

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export const fetchWithRetry = async (url, options = {}, fetchImpl = fetch) => {
  const maxAttempts = options.maxAttempts || 3;
  const retryDelayMs = options.retryDelayMs || 500;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { maxAttempts: _maxAttempts, retryDelayMs: _retryDelayMs, ...fetchOptions } = options;
      return await fetchImpl(url, fetchOptions);
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        throw error;
      }

      await sleep(retryDelayMs * attempt);
    }
  }

  throw lastError;
};

export const fetchTextWithRetry = async (url, options = {}, fetchImpl = fetch) => {
  const maxAttempts = options.maxAttempts || 3;
  const retryDelayMs = options.retryDelayMs || 500;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithRetry(url, { ...options, maxAttempts: 1 }, fetchImpl);

      if (!response.ok) {
        throw new Error(`${url} returned ${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        throw error;
      }

      await sleep(retryDelayMs * attempt);
    }
  }

  throw lastError;
};

export const fetchJsonWithRetry = async (url, options = {}, fetchImpl = fetch) => {
  const maxAttempts = options.maxAttempts || 3;
  const retryDelayMs = options.retryDelayMs || 500;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithRetry(url, { ...options, maxAttempts: 1 }, fetchImpl);

      if (!response.ok) {
        throw new Error(`${url} returned ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        throw error;
      }

      await sleep(retryDelayMs * attempt);
    }
  }

  throw lastError;
};

const fetchRepo = async (fullName) => {
  try {
    return await fetchJsonWithRetry(`https://api.github.com/repos/${fullName}`, { headers: githubHeaders });
  } catch (error) {
    throw new Error(`Could not fetch GitHub repo details for ${fullName}: ${error.message}`, { cause: error });
  }
};

const fetchGithubStarLists = async (user) => {
  const profileUrl = `https://github.com/${encodeURIComponent(user)}?tab=stars`;
  const profileHtml = await fetchTextWithRetry(profileUrl, { headers: htmlHeaders });
  const links = parseStarListLinks(profileHtml, user);
  const lists = [];

  for (const link of links) {
    const url = new URL(link.href, "https://github.com").href;
    const html = await fetchTextWithRetry(url, { headers: htmlHeaders });

    lists.push({
      name: extractListNameFromHtml(html, link.fallbackName),
      description: extractListDescriptionFromHtml(html),
      url,
      repoFullNames: parseRepoFullNamesFromStarListHtml(html)
    });
  }

  return lists;
};

const syncLibraryCategories = async (lists, dryRun) => {
  const source = await readFile(rankingsTsPath, "utf8");
  const listNames = lists.map((list) => list.name);
  const descriptions = Object.fromEntries(lists.map((list) => [list.name, list.description]));
  const nextSource = replaceExportedRecord(
    replaceExportedStringArray(source, "libraryCategories", ["全部", ...listNames]),
    "libraryCategoryDescriptions",
    descriptions
  );

  if (!dryRun) {
    await writeFile(rankingsTsPath, nextSource, "utf8");
  }
};

const main = async () => {
  const userArg = process.argv.find((arg) => arg.startsWith("--user="));
  const user = userArg?.split("=")[1] || process.env.GITHUB_STARS_USER || defaultGithubUser;
  const dryRun = process.argv.includes("--dry-run");
  const date = process.env.SYNC_DATE || defaultDate;
  const rankings = await readJson(rankingsPath);
  const lists = await fetchGithubStarLists(user);
  const listNames = lists.map((list) => list.name);
  const repoCache = new Map();
  const incomingItems = [];
  let nextRank = 1;

  for (const list of lists) {
    for (const fullName of list.repoFullNames) {
      const key = normalizeText(fullName);

      if (repoCache.has(key)) {
        continue;
      }

      const repo = await fetchRepo(fullName);
      repoCache.set(key, repo);
      incomingItems.push(
        buildRankingItemFromListedRepo(repo, {
          rank: nextRank,
          date,
          listName: list.name,
          alternatives: rankings.map((item) => item.name).filter(Boolean)
        })
      );
      nextRank += 1;
    }
  }

  const merged = mergeListedRankingItems(rankings, incomingItems);

  if (!dryRun) {
    await writeJson(rankingsPath, merged);
    await syncLibraryCategories(lists, dryRun);
  }

  console.log(`Fetched ${lists.length} public star lists from ${user}: ${listNames.join(", ") || "none"}.`);
  console.log(`Synced ${merged.length} repositories from public GitHub Star Lists.`);
  console.log(`${dryRun ? "Dry run" : "Updated rankings.json and rankings.ts"}.`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
