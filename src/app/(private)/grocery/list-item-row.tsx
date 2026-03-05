"use client";

import { Check, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ListItem } from "@/lib/grocery/types";
import { PURCHASE_UNITS } from "@/lib/grocery/constants";

const UNIT_LABEL = new Map<string, string>(
  PURCHASE_UNITS.map((u) => [u.value, u.label]),
);

function formatQty(quantity: number, unit: string) {
  if (unit === "piece") return String(quantity);
  return `${quantity} ${UNIT_LABEL.get(unit) ?? unit}`;
}

export function ListItemRow({
  item,
  onToggle,
  onQuantity,
  onRemove,
}: {
  item: ListItem;
  onToggle: () => void;
  onQuantity: (delta: number) => void;
  onRemove: () => void;
}) {
  const name = item.productName ?? item.customName ?? "???";

  return (
    <li className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent">
      <button
        type="button"
        onClick={onToggle}
        className="flex size-5 shrink-0 items-center justify-center rounded border border-border transition-colors hover:border-foreground"
        aria-label={item.checked ? "Décocher" : "Cocher"}
      >
        {item.checked && <Check className="size-3" />}
      </button>

      <span className={`flex-1 text-sm ${item.checked ? "line-through" : ""}`}>
        {name}
      </span>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onQuantity(-1)}
          disabled={item.quantity <= 1}
          className="sm:opacity-0 sm:group-hover:opacity-100"
          aria-label="Réduire la quantité"
        >
          <Minus className="size-3" />
        </Button>
        <span className="min-w-8 text-center text-xs tabular-nums">
          {formatQty(item.quantity, item.unit)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onQuantity(1)}
          className="sm:opacity-0 sm:group-hover:opacity-100"
          aria-label="Augmenter la quantité"
        >
          <Plus className="size-3" />
        </Button>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        className="sm:opacity-0 sm:group-hover:opacity-100"
        aria-label={`Supprimer ${name}`}
      >
        <X className="size-3" />
      </Button>
    </li>
  );
}
