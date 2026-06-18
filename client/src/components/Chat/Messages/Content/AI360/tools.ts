export const AI360_TOOLS = {
  search_companies: 'companies',
  search_talents: 'talents',
  search_candidates: 'talents',
  search_jobs: 'jobs',
  list_jobs: 'jobs',
  get_job: 'job',
  enrich_contact: 'contact',
  send_outreach: 'outreach',
} as const;

export type AI360ToolName = keyof typeof AI360_TOOLS;

export function is360Tool(name: string): name is AI360ToolName {
  return Object.prototype.hasOwnProperty.call(AI360_TOOLS, name);
}
