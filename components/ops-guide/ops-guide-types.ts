import type { OpsArticle, OpsArticleStub } from "@/lib/types";

export interface ArticlesListResponse {
  articles: OpsArticleStub[];
}

export interface ArticleDetailResponse {
  article: OpsArticle;
}

export interface SearchResultItem extends OpsArticleStub {
  excerpt: string;
}

export interface SearchResponse {
  articles: SearchResultItem[];
}

export interface ArticleFormValues {
  title: string;
  category: string;
  content: string;
  tags: string;
  published: boolean;
}
