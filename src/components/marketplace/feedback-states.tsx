import type { ReactNode } from "react";
import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";

function StateFrame({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) { return <section className="mx-auto flex max-w-xl flex-col items-center px-6 py-24 text-center"><div className="mb-5 text-muted-foreground">{icon}</div><h1 className="text-display text-foreground">{title}</h1>{children && <p className="mt-3 text-body text-muted-foreground">{children}</p>}</section>; }
export function LoadingState({ label = "Loading" }: { label?: string }) { return <StateFrame icon={<LoaderCircle className="size-6 animate-spin motion-reduce:animate-none" />} title={label} />; }
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) { return <StateFrame icon={<Inbox className="size-7" />} title={title}>{children}</StateFrame>; }
export function ErrorState({ title = "Something went wrong", children }: { title?: string; children?: ReactNode }) { return <StateFrame icon={<AlertCircle className="size-7 text-destructive" />} title={title}>{children}</StateFrame>; }
