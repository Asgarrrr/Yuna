"use client";

import { Plus } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { addSuggestionToList } from "../actions";

type Suggestion = {
  id: string;
  name: string;
  icon: string | null;
  category: string;
};

export function SuggestionChips({
  suggestions: initialSuggestions,
}: {
  suggestions: Suggestion[];
}) {
  const [, startTransition] = useTransition();
  const [suggestions, setOptimistic] = useOptimistic(initialSuggestions);

  if (suggestions.length === 0) return null;

  function handleAdd(s: Suggestion) {
    startTransition(async () => {
      setOptimistic((prev) => prev.filter((x) => x.id !== s.id));
      await addSuggestionToList(s.id);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        Suggestions
      </span>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <Button
            key={s.id}
            variant="outline"
            size="sm"
            onClick={() => handleAdd(s)}
            className="h-7 gap-1 text-xs"
          >
            <Plus className="size-3" />
            {s.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
