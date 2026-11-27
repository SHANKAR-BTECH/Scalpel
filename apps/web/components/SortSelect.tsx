"use client";
import { useRouter } from "next/navigation";

export function SortSelect({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  return (
    <select id="sort" aria-label="Sort cases" value={value} data-testid="sort" className="input w-auto py-1.5" onChange={(e) => router.push(`/inbox?sort=${e.target.value}`)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
