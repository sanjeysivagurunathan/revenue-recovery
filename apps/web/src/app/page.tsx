/**
 * apps/web/src/app/page.tsx
 *
 * Root page — redirects to the dashboard home.
 * The dashboard lives at /(dashboard)/cases so the root URL
 * forwards there automatically.
 */

import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/cases");
}
