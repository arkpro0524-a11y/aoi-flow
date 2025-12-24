// app/flow/page.tsx
import { redirect } from "next/navigation";

export default function FlowIndexPage() {
  redirect("/flow/drafts");
}