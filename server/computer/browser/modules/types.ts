import type { Page } from "playwright-core";

export interface ProductSearchResult {
  productTitle: string;
  productUrl: string;
  asin?: string;
  id?: string;
  price?: string;
}

export interface ExtractedPriceResult {
  title: string;
  price: string;
  currency: string;
  url: string;
}

export interface WebsiteModule {
  readonly id: string;
  readonly displayName: string;
  readonly defaultHomeUrl: string;

  matchesUrl(url: string): boolean;
  isCaptchaPresent(page: Page): Promise<boolean>;
  dismissPopups?(page: Page): Promise<void>;

  fillAndSubmitSearch(
    page: Page,
    query: string
  ): Promise<{
    success: boolean;
    query: string;
    url: string;
    title: string;
    error?: string;
  }>;

  verifySearchResults(
    page: Page,
    query: string
  ): Promise<{
    success: boolean;
    url: string;
    title: string;
    error?: string;
  }>;

  getFirstProduct?(
    page: Page
  ): Promise<{
    success: boolean;
    result?: ProductSearchResult;
    error?: string;
  }>;

  extractProductPrice?(
    page: Page
  ): Promise<{
    success: boolean;
    result?: ExtractedPriceResult;
    error?: string;
  }>;
}
