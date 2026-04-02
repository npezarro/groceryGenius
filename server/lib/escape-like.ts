/** Escape LIKE/ILIKE wildcard characters so user input is treated literally */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}
