// Single source of truth for entity page URLs. As each entity migrates from the
// legacy /x?id=5 query form to the /x/5 path form, add it to `Entity` and route
// its links through hrefFor — so a future URL-shape change is one edit, not a
// codebase-wide find/replace. trailingSlash is on, so include the trailing slash.
export type Entity = 'match';

export function hrefFor(entity: Entity, id: string | number): string {
  return `/${entity}/${id}/`;
}
