declare const __BASE_PATH__: string;

/** Base path prefix for all API calls (e.g., "/grocerygenius" or "") */
export const BASE_PATH: string =
  typeof __BASE_PATH__ !== "undefined" ? __BASE_PATH__ : "";

/** Prefix a path with the base path */
export function apiUrl(path: string): string {
  return `${BASE_PATH}${path}`;
}
