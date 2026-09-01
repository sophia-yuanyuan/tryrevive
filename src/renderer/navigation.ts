import type { RouteLocationNormalizedLoaded } from "vue-router";

const RETURN_PATHS = new Set([
  "/",
  "/start",
  "/projects",
  "/collection",
  "/about",
  "/privacy",
  "/help"
]);

export function returnPathFor(route: RouteLocationNormalizedLoaded): string {
  return RETURN_PATHS.has(route.path) ? route.path : "/start";
}

export function safeReturnPath(value: unknown, fallback = "/start"): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") return fallback;
  return RETURN_PATHS.has(candidate) ? candidate : fallback;
}
