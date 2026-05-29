// JS mirror of the CSS color tokens in index.css, used to theme third-party
// UI (e.g. Clerk) that can't read CSS variables. Keep in sync with :root.
export const famTokens = {
  bg: "#f7f8fa",
  surface: "#ffffff",
  surface2: "#f1f3f5",
  surface3: "#e6e9ee",
  line: "#e4e7eb",
  line2: "#d3d8df",
  ink: "#0f1419",
  ink2: "#232a33",
  ink3: "#5a6573",
  ink4: "#8a93a1",
  ink5: "#b4bcc7",
  gold: "#2563eb",
  goldSoft: "#dbe6fe",
  success: "#15803d",
  warn: "#b45309",
  danger: "#dc2626",
  info: "#2563eb",
} as const;
