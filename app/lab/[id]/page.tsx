import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LabGuide } from "@/components/guide/LabGuide";
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

/** Lab pages share the bench in the root layout; each lab only adds its guide. */
export default async function LabPage({ params }: Params) {
  const lab = getLab(Number((await params).id));
  if (!lab) notFound();
  return <LabGuide labId={lab.id} title={lab.title} />;
}
