"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addProductTag, removeProductTag } from "../../actions";

export function TagsSection({
  tags,
  productId,
  isPending,
}: {
  tags: string[];
  productId: string;
  isPending: boolean;
}) {
  const [localTags, setLocalTags] = useState(tags);
  const [newTag, setNewTag] = useState("");
  const [isTagPending, startTagTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync from server
  useEffect(() => {
    setLocalTags(tags);
  }, [tags]);

  function handleAddTag(e: React.FormEvent) {
    e.preventDefault();
    const tag = newTag.trim().toLowerCase();
    if (!tag || localTags.includes(tag)) return;

    setLocalTags((prev) => [...prev, tag]);
    setNewTag("");
    startTagTransition(async () => {
      await addProductTag(productId, tag);
    });
  }

  function handleRemoveTag(tag: string) {
    setLocalTags((prev) => prev.filter((t) => t !== tag));
    startTagTransition(async () => {
      await removeProductTag(productId, tag);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">Tags</span>
      <div className="flex flex-wrap gap-1">
        {localTags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="gap-1 text-xs"
          >
            {tag}
            <button
              type="button"
              onClick={() => handleRemoveTag(tag)}
              disabled={isPending || isTagPending}
              className="ml-0.5 rounded-full hover:bg-muted"
              aria-label={`Supprimer le tag ${tag}`}
            >
              <X className="size-2.5" />
            </button>
          </Badge>
        ))}
        {localTags.length === 0 && (
          <span className="text-xs text-muted-foreground">Aucun tag</span>
        )}
      </div>
      <form onSubmit={handleAddTag} className="flex gap-1">
        <Input
          ref={inputRef}
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="Ajouter un tag..."
          className="h-7 text-xs"
          disabled={isPending || isTagPending}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="h-7 px-2"
          disabled={isPending || isTagPending || !newTag.trim()}
        >
          <Plus className="size-3" />
        </Button>
      </form>
    </div>
  );
}
