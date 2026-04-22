/**
 * React Query key factory. Central source of truth for every cached entity in
 * the web app so invalidation stays consistent across pages and mutations.
 *
 * Keys follow a hierarchical shape so `invalidateQueries({ queryKey: keys.workspaces() })`
 * clears every workspace-scoped cache entry in one call.
 */
export const queryKeys = {
  me: () => ['me'] as const,
  workspaces: () => ['workspaces'] as const,
  projects: (wsId: string) => ['projects', wsId] as const,
  documents: (projectId: string) => ['documents', projectId] as const,
  document: (docId: string) => ['document', docId] as const,
  versions: (docId: string) => ['versions', docId] as const,
} as const;
