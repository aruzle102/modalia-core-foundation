import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/marketplace/feedback-states";
export const Route = createFileRoute("/category/$slug")({ head: ({ params }) => ({ meta: [{ title: `${params.slug} — Modalia` }, { name: "description", content: "Browse this Modalia category." }, { property: "og:title", content: `${params.slug} — Modalia` }, { property: "og:description", content: "Browse this Modalia category." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }], links: [{ rel: "canonical", href: `/category/${params.slug}` }] }), component: CategoryPage });
function CategoryPage() { const { slug } = Route.useParams(); return <EmptyState title={slug}>Category discovery is being prepared.<div className="mt-7"><Button asChild variant="outline"><Link to="/shop">Back to shop</Link></Button></div></EmptyState>; }
