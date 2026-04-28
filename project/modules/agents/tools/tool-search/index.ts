import { getToolCatalog } from '../registry';

export function searchTools(query: string, maxResults = 5): string {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return 'No query provided';
  }

  const matches = getToolCatalog()
    .filter((tool) => {
      const haystack = `${tool.name} ${tool.description} ${tool.intent}`.toLowerCase();
      return haystack.includes(normalized);
    })
    .slice(0, maxResults)
    .map((tool) => `${tool.name} - ${tool.description}`);

  return matches.length > 0 ? matches.join('\n') : 'No matching tools';
}
