import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LABS, getLab } from "@/lib/labs";

type Params = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return LABS.map((lab) => ({ id: String(lab.id) }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const lab = getLab(Number((await params).id));
  return { title: lab ? `Lab ${lab.id} — ${lab.title}` : "Lab" };
}

/** Lab pages share the bench in the root layout; each lab only adds its own panel. */
export default async function LabPage({ params }: Params) {
  const lab = getLab(Number((await params).id));
  if (!lab) notFound();
  return (
    <aside className="lab-note" aria-label={`Lab ${lab.id}`}>
      <strong>
        Lab {lab.id} · {lab.title}
      </strong>
      Lab content will be added here.
    </aside>
  );
}
