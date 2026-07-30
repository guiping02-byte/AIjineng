import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const rankingsPath = join(rootDir, "src", "data", "rankings.json");
const rankingsTsPath = join(rootDir, "src", "data", "rankings.ts");
const shouldShowHelp = process.argv.includes("--help") || process.argv.includes("-h");

const helpText = `
Usage:
  pnpm add:ranking

What it does:
  Starts an interactive prompt for a new ranking item, appends it to
  src/data/rankings.json, then runs pnpm validate:data.

Input tips:
  - Comma-separated fields are accepted for tags, highlights, use cases,
    platforms, limitations, and alternatives.
  - Category must be one of the categories exported from src/data/rankings.ts.
  - Library category and status values must also match src/data/rankings.ts.
  - Alternatives must match existing project names.
  - Avatar URL defaults to the GitHub owner avatar inferred from owner/project.
`;

const slugify = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const readJson = async (path) => {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
};

const readExportedStringArray = async (exportName) => {
  const source = await readFile(rankingsTsPath, "utf8");
  const match = source.match(new RegExp(`export const ${exportName} = \\[([\\s\\S]*?)\\];`));

  if (!match) {
    throw new Error(`Could not find exported ${exportName} in src/data/rankings.ts`);
  }

  return [...match[1].matchAll(/"([^"]+)"/g)]
    .map((item) => item[1])
    .filter((value) => value !== "全部");
};

const parseList = (value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const askRequired = async (rl, question) => {
  while (true) {
    const answer = (await rl.question(question)).trim();

    if (answer) {
      return answer;
    }

    console.log("Please enter a value.");
  }
};

const askList = async (rl, question) => {
  while (true) {
    const answer = await askRequired(rl, question);
    const list = parseList(answer);

    if (list.length > 0) {
      return list;
    }

    console.log("Please enter at least one comma-separated value.");
  }
};

const askUrl = async (rl, question) => {
  while (true) {
    const answer = await askRequired(rl, question);

    try {
      const url = new URL(answer);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return answer;
      }
    } catch {
      // Keep prompting below.
    }

    console.log("Please enter a valid http(s) URL.");
  }
};

const askCategory = async (rl, categories) => {
  const categoryList = categories.map((category, index) => `${index + 1}. ${category}`).join("\n");

  while (true) {
    const answer = await askRequired(rl, `Category:\n${categoryList}\nChoose number or exact name: `);
    const index = Number(answer);

    if (Number.isInteger(index) && index >= 1 && index <= categories.length) {
      return categories[index - 1];
    }

    const category = categories.find((item) => item.toLowerCase() === answer.toLowerCase());

    if (category) {
      return category;
    }

    console.log("Please choose a valid category.");
  }
};

const askChoice = async (rl, label, options) => {
  const optionList = options.map((option, index) => `${index + 1}. ${option}`).join("\n");

  while (true) {
    const answer = await askRequired(rl, `${label}:\n${optionList}\nChoose number or exact name: `);
    const index = Number(answer);

    if (Number.isInteger(index) && index >= 1 && index <= options.length) {
      return options[index - 1];
    }

    const option = options.find((item) => item.toLowerCase() === answer.toLowerCase());

    if (option) {
      return option;
    }

    console.log(`Please choose a valid ${label.toLowerCase()}.`);
  }
};

const askPositiveInteger = async (rl, question) => {
  while (true) {
    const answer = await askRequired(rl, question);
    const value = Number(answer);

    if (Number.isInteger(value) && value >= 1) {
      return value;
    }

    console.log("Please enter a positive integer.");
  }
};

const askAlternatives = async (rl, existingNames) => {
  while (true) {
    const alternatives = await askList(rl, "Alternatives, comma-separated existing project names: ");
    const missing = alternatives.filter((name) => !existingNames.has(name));

    if (missing.length === 0) {
      return alternatives;
    }

    console.log(`Unknown project name(s): ${missing.join(", ")}`);
  }
};

const runValidateData = () =>
  new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const child = spawn(command, ["validate:data"], {
      cwd: rootDir,
      shell: false,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`pnpm validate:data exited with code ${code}`));
    });
  });

const main = async () => {
  if (shouldShowHelp) {
    console.log(helpText.trim());
    return;
  }

  const rankings = await readJson(rankingsPath);
  const categories = await readExportedStringArray("categories");
  const libraryCategories = await readExportedStringArray("libraryCategories");
  const collectionStatuses = await readExportedStringArray("collectionStatuses");
  const verificationStatuses = await readExportedStringArray("verificationStatuses");

  if (!Array.isArray(rankings)) {
    throw new Error("src/data/rankings.json must contain a top-level array.");
  }

  const existingSlugs = new Set(rankings.map((item) => item.slug));
  const existingNames = new Set(rankings.map((item) => item.name));
  const nextRank = rankings.reduce((max, item) => Math.max(max, item.rank || 0), 0) + 1;
  const rl = createInterface({ input, output });

  try {
    const name = await askRequired(rl, "Project name: ");
    const slugDefault = slugify(name);
    const slugAnswer = (await rl.question(`Slug (${slugDefault}): `)).trim();
    const slug = slugAnswer || slugDefault;

    if (!slug) {
      throw new Error("Could not generate a slug. Please use ASCII letters or numbers in the project name, or enter a custom slug.");
    }

    if (existingSlugs.has(slug)) {
      throw new Error(`Slug already exists: ${slug}`);
    }

    if (existingNames.has(name)) {
      throw new Error(`Project name already exists: ${name}`);
    }

    const category = await askCategory(rl, categories);
    const repo = await askRequired(rl, "Repo label, e.g. owner/project: ");
    const inferredOwner = repo.split("/")[0];
    const avatarDefault = inferredOwner ? `https://github.com/${inferredOwner}.png?size=96` : "";
    const avatarAnswer = (await rl.question(`Avatar URL (${avatarDefault}): `)).trim();
    const avatarUrl = avatarAnswer || avatarDefault;
    const description = await askRequired(rl, "Short description: ");
    const libraryCategory = await askChoice(rl, "Library category", libraryCategories);
    const collectionStatus = await askChoice(rl, "Collection status", collectionStatuses);
    const verificationStatus = await askChoice(rl, "Verification status", verificationStatuses);
    const sourceType = await askRequired(rl, "Source type, e.g. Agent Skill: ");
    const platforms = await askList(rl, "Platforms, comma-separated: ");
    const installPathCount = await askPositiveInteger(rl, "Install path count: ");
    const collectedAt = await askRequired(rl, "Collected at, YYYY-MM-DD: ");
    const reviewedAt = await askRequired(rl, "Reviewed at, YYYY-MM-DD: ");
    const tags = await askList(rl, "Tags, comma-separated: ");
    const weeklyGrowth = await askRequired(rl, "Weekly growth, e.g. +1.2k: ");
    const totalStars = await askRequired(rl, "Total stars, e.g. 8.4k: ");
    const score = await askRequired(rl, "Score, e.g. 81 / 100: ");
    const featuredAnswer = (await rl.question("Featured? (y/N): ")).trim().toLowerCase();
    const insight = await askRequired(rl, "Editorial insight: ");
    const websiteUrl = await askUrl(rl, "Website URL: ");
    const repoUrl = await askUrl(rl, "Repository URL: ");
    const highlights = await askList(rl, "Highlights, comma-separated: ");
    const useCases = await askList(rl, "Use cases, comma-separated: ");
    const limitations = await askList(rl, "Limitations, comma-separated: ");
    const alternatives = await askAlternatives(rl, existingNames);

    const nextItem = {
      rank: nextRank,
      slug,
      name,
      repo,
      avatarUrl,
      description,
      category,
      libraryCategory,
      collectionStatus,
      verificationStatus,
      sourceType,
      platforms,
      installPathCount,
      collectedAt,
      reviewedAt,
      tags,
      weeklyGrowth,
      totalStars,
      score,
      featured: featuredAnswer === "y" || featuredAnswer === "yes",
      insight,
      websiteUrl,
      repoUrl,
      highlights,
      useCases,
      limitations,
      alternatives
    };

    rankings.push(nextItem);
    await writeFile(rankingsPath, `${JSON.stringify(rankings, null, 2)}\n`, "utf8");
    console.log(`Added ${name} to src/data/rankings.json.`);
    await runValidateData();
  } finally {
    rl.close();
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
