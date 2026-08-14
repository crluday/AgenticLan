import type { ProviderSummary } from "@agenticlan/shared-types";
import type { LLMProvider } from "./base.js";

export class ProviderRegistry {
  private readonly providers = new Map<string, LLMProvider>();
  private defaultProviderId?: string;

  register(provider: LLMProvider, options: { setDefault?: boolean } = {}): void {
    this.providers.set(provider.id, provider);
    if (options.setDefault || !this.defaultProviderId) {
      this.defaultProviderId = provider.id;
    }
  }

  get(providerId?: string): LLMProvider {
    const id = providerId ?? this.defaultProviderId;
    if (!id) {
      throw new Error("No LLM provider has been configured.");
    }

    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Unknown LLM provider: ${id}`);
    }

    return provider;
  }

  list(): ProviderSummary[] {
    return [...this.providers.values()].map((provider) => ({
      id: provider.id,
      displayName: provider.displayName,
      kind: provider.kind,
      supportsTools: provider.supportsTools,
      supportsVision: provider.supportsVision,
      baseUrl: provider.baseUrl,
      defaultModel: provider.defaultModel,
      apiKeyConfigured: provider.apiKeyConfigured
    }));
  }
}
