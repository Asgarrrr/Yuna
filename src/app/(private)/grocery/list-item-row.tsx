"use client";

import { Check, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ListItem } from "@/lib/grocery/types";

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
        >
          <Minus className="size-3" />
        </Button>
        <span className="min-w-6 text-center text-xs tabular-nums">
          {item.quantity}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onQuantity(1)}
          className="sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Plus className="size-3" />
        </Button>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        className="sm:opacity-0 sm:group-hover:opacity-100"
      >
        <X className="size-3" />
      </Button>
    </li>
  );
}
