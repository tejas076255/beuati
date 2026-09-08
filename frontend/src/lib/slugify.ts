// Matches the slug CHECK constraint used across the schema: ^[a-z0-9]+(-[a-z0-9]+)*$
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
