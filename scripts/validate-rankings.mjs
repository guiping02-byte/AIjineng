import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const rankingsPath = join(rootDir, "src", "data", "rankings.json");
const rankingsTsPath = join(rootDir, "src", "data", "rankings.ts");
const shouldCheckLinks = process.argv.includes("--check-links");

const requiredFields = {
  rank: "number",
  slug: "string",
  name: "string",
  repo: "string",
  avatarUrl: "string",
  description: "string",
  category: "string",
  libraryCategory: "string",
  collectionStatus: "string",
  verificationStatus: "string",
  sourceType: "string",
  platforms: "array",
  installPathCount: "number",
  collectedAt: "string",
  reviewedAt: "string",
  tags: "array",
  weeklyGrowth: "string",
  totalStars: "string",
  score: "string",
  featured: "boolean",
  insight: "string",
  websiteUrl: "string",
  repoUrl: "string",
  highlights: "array",
  useCases: "array",
  limitations: "array",
  alternatives: "array"
};

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

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const validateUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const validateFieldShape = (item, index, errors) => {
  for (const [field, expectedType] of Object.entries(requiredFields)) {
    const value = item[field];

    if (expectedType === "array") {
      if (!Array.isArray(value)) {
        errors.push(`Item ${index + 1} (${item.name ?? "unknown"}) is missing array field "${field}".`);
      }
      continue;
    }

    if (typeof value !== expectedType) {
      errors.push(`Item ${index + 1} (${item.name ?? "unknown"}) has invalid field "${field}". Expected ${expectedType}.`);
    }
  }
};

const validateStringArray = (item, field, errors) => {
  const value = item[field];

  if (!Array.isArray(value)) {
    return;
  }

  if (value.length === 0) {
    errors.push(`${item.name} has empty array field "${field}".`);
    return;
  }

  value.forEach((entry, index) => {
    if (!isNonEmptyString(entry)) {
      errors.push(`${item.name}.${field}[${index}] must be a non-empty string.`);
    }
  });
};

const checkExternalUrl = async (url) => {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (response.ok) {
      return response.status;
    }

    const fallbackResponse = await fetch(url, { method: "GET", redirect: "follow" });
    return fallbackResponse.status;
  } catch (error) {
    return `request failed: ${error.message}`;
  }
};

const main = async () => {
  const rankings = await readJson(rankingsPath);
  const categories = await readExportedStringArray("categories");
  const libraryCategories = await readExportedStringArray("libraryCategories");
  const collectionStatuses = await readExportedStringArray("collectionStatuses");
  const verificationStatuses = await readExportedStringArray("verificationStatuses");
  const allowedCategories = new Set(categories.filter((category) => category !== "全部"));
  const allowedLibraryCategories = new Set(libraryCategories.filter((category) => category !== "全部"));
  const allowedCollectionStatuses = new Set(collectionStatuses.filter((status) => status !== "全部"));
  const allowedVerificationStatuses = new Set(verificationStatuses);
  const errors = [];
  const warnings = [];

  if (!Array.isArray(rankings)) {
    errors.push("src/data/rankings.json must contain a top-level array.");
  } else {
    const slugs = new Set();
    const names = new Set(rankings.map((item) => item.name));

    rankings.forEach((item, index) => {
      validateFieldShape(item, index, errors);

      if (!Number.isInteger(item.rank) || item.rank < 1) {
        errors.push(`${item.name ?? `Item ${index + 1}`} must have a positive integer rank.`);
      }

      if (!isNonEmptyString(item.slug)) {
        errors.push(`${item.name ?? `Item ${index + 1}`} must have a non-empty slug.`);
      } else if (slugs.has(item.slug)) {
        errors.push(`Duplicate slug found: "${item.slug}".`);
      } else {
        slugs.add(item.slug);
      }

      if (!allowedCategories.has(item.category)) {
        errors.push(`${item.name ?? `Item ${index + 1}`} has unknown category "${item.category}".`);
      }

      if (!allowedLibraryCategories.has(item.libraryCategory)) {
        errors.push(`${item.name ?? `Item ${index + 1}`} has unknown libraryCategory "${item.libraryCategory}".`);
      }

      if (!allowedCollectionStatuses.has(item.collectionStatus)) {
        errors.push(`${item.name ?? `Item ${index + 1}`} has unknown collectionStatus "${item.collectionStatus}".`);
      }

      if (!allowedVerificationStatuses.has(item.verificationStatus)) {
        errors.push(`${item.name ?? `Item ${index + 1}`} has unknown verificationStatus "${item.verificationStatus}".`);
      }

      if (!Number.isInteger(item.installPathCount) || item.installPathCount < 1) {
        errors.push(`${item.name ?? `Item ${index + 1}`} must have installPathCount >= 1.`);
      }

      for (const field of ["collectedAt", "reviewedAt"]) {
        if (isNonEmptyString(item[field]) && !isIsoDate(item[field])) {
          errors.push(`${item.name}.${field} must use YYYY-MM-DD format.`);
        }
      }

      for (const field of ["tags", "platforms", "highlights", "useCases", "limitations", "alternatives"]) {
        validateStringArray(item, field, errors);
      }

      if (Array.isArray(item.alternatives)) {
        item.alternatives.forEach((name) => {
          if (!names.has(name)) {
            errors.push(`${item.name} alternative "${name}" does not match any project name.`);
          }
        });
      }

      for (const field of ["avatarUrl", "websiteUrl", "repoUrl"]) {
        if (isNonEmptyString(item[field]) && !validateUrl(item[field])) {
          errors.push(`${item.name}.${field} is not a valid URL.`);
        }
      }
    });

    if (shouldCheckLinks) {
      for (const item of rankings) {
        for (const field of ["websiteUrl", "repoUrl"]) {
          const url = item[field];
          const status = await checkExternalUrl(url);

          if (typeof status === "number" && status >= 200 && status < 400) {
            continue;
          }

          warnings.push(`${item.name}.${field} returned ${status} (${url}).`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error("Ranking data validation failed:");
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn("Ranking data validation warnings:");
    warnings.forEach((warning) => console.warn(`- ${warning}`));
  }

  const linkNote = shouldCheckLinks ? " with external link checks" : "";
  console.log(`Ranking data validation passed${linkNote}.`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
