import rankingsData from "./rankings.json";

export type RankingItem = {
  rank: number;
  slug: string;
  name: string;
  repo: string;
  avatarUrl: string;
  description: string;
  category: string;
  libraryCategory: string;
  collectionStatus: string;
  verificationStatus: string;
  sourceType: string;
  platforms: string[];
  installPathCount: number;
  collectedAt: string;
  reviewedAt: string;
  tags: string[];
  weeklyGrowth: string;
  totalStars: string;
  score: string;
  featured: boolean;
  insight: string;
  websiteUrl: string;
  repoUrl: string;
  highlights: string[];
  useCases: string[];
  limitations: string[];
  alternatives: string[];
};

export const categories = [
  "全部",
  "AI 技能",
  "AI 应用",
  "开发工具"
];

export const libraryCategories = [
  "全部",
  "ppt/html",
  "内容创作",
  "应用",
  "新手入门",
  "新闻资讯"
];

export const collectionStatuses = [
  "全部",
  "深度核验",
  "候选观察"
];

export const verificationStatuses = [
  "官方",
  "需校验",
  "社区验证"
];

export const libraryCategoryDescriptions = {
  "ppt/html": "",
  "内容创作": "内容创作者必看，含排版，写作风格，去AI化，设计工具",
  "应用": "必装底座，知识库",
  "新手入门": "",
  "新闻资讯": ""
};

export const rankings = rankingsData as RankingItem[];

export const methodology = [
  {
    label: "增长信号",
    value: "45%",
    detail: "按近 7 天新增关注、收藏、讨论热度和链接传播综合加权。"
  },
  {
    label: "产品成熟度",
    value: "35%",
    detail: "参考文档完整性、版本节奏、部署门槛和社区活跃度。"
  },
  {
    label: "编辑判断",
    value: "20%",
    detail: "用于挑出真正值得写成专题和精选推荐的项目。"
  }
];
