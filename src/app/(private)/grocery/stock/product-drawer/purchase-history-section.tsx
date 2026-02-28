"use client";

import { Clock } from "lucide-react";
import type { getProductDetails } from "../../actions";

type ProductDetails = Awaited<ReturnType<typeof getProductDetails>>;

export function PurchaseHistorySection({
  details,
}: {
  details: ProductDetails;
}) {
  if (!details.frequency || details.frequency.purchaseCount <= 0) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Clock className="size-3.5" />
        Habitude d'achat
      </div>
      {details.frequency.avgDays != null && (
        <p className="text-sm">
          Acheté tous les ~{details.frequency.avgDays} jours
          <span className="text-muted-foreground">
            {" "}
            ({details.frequency.purchaseCount} achat
            {details.frequency.purchaseCount > 1 ? "s" : ""})
          </span>
        </p>
      )}
      {details.frequency.isOverdue && details.frequency.predictedNext && (
        <p className="text-xs text-orange-600">
          Prochain achat prévu le{" "}
          {new Date(details.frequency.predictedNext).toLocaleDateString(
            "fr-FR",
            {
              day: "numeric",
              month: "short",
            },
          )}{" "}
          — en retard
        </p>
      )}
      {!details.frequency.isOverdue &&
        details.frequency.predictedNext && (
          <p className="text-xs text-muted-foreground">
            Prochain achat prévu le{" "}
            {new Date(details.frequency.predictedNext).toLocaleDateString(
              "fr-FR",
              {
                day: "numeric",
                month: "short",
              },
            )}
          </p>
        )}
    </div>
  );
}
