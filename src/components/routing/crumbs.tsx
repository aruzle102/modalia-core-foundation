import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { parseBackTarget } from "./back-link";

export interface Crumb {
  label: string;
  /** Omit for the current page (rendered as plain text). */
  to?: string;
  search?: Record<string, string>;
  params?: Record<string, string>;
  /**
   * Raw `back` param ("pathname + query", captured when the user opened this
   * detail page). When present and parseable, the crumb links to the saved
   * list state (filters / page preserved); otherwise to `to`.
   */
  back?: string;
}

/** Breadcrumb trail for deep admin / seller pages. */
export function Crumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <Breadcrumb className="mb-3">
      <BreadcrumbList>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          const backTarget = !last && item.to && item.back ? parseBackTarget(item.back) : null;
          return (
            <Fragment key={`${item.label}-${i}`}>
              <BreadcrumbItem>
                {last || !item.to ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : backTarget ? (
                  <BreadcrumbLink asChild>
                    <Link to={backTarget.to} search={backTarget.search as never}>
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={item.to} search={item.search as never} params={item.params as never}>
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {last ? null : <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
