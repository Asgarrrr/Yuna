"use client";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CalendarIcon,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  CATEGORY_MAP,
  LOCATIONS,
  NUTRISCORE_COLORS,
  STATUS_MAP,
} from "@/lib/grocery/constants";
import type { StockItem } from "@/lib/grocery/queries";
import { cn } from "@/lib/utils";
import {
  addOutOfStockToList,
  cycleStockStatus,
  getProductDetails,
  removeStockItem,
  setStockExpiry,
  setStockLocation,
} from "../../actions";
import { PurchaseHistorySection } from "./purchase-history-section";
import { TagsSection } from "./tags-section";

type ProductDetails = Awaited<ReturnType<typeof getProductDetails>>;


function formatDate(date: Date | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DrawerBody({
  item,
  onClose,
}: {
  item: StockItem;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [details, setDetails] = useState<ProductDetails | null>(null);
  const [isLoadingDetails, startDetailsTransition] = useTransition();

  useEffect(() => {
    startDetailsTransition(async () => {
      try {
        const result = await getProductDetails(item.productId);
        setDetails(result);
      } catch (error) {
        console.error("[stock] unable to load product details", error);
      }
    });
  }, [item.productId]);

  const statusLabel = STATUS_MAP.get(item.status) ?? item.status;
  const categoryLabel =
    CATEGORY_MAP.get(item.productCategory) ?? item.productCategory;

  const expiryDate = item.expiresAt ? new Date(item.expiresAt) : undefined;

  function handleLocationChange(location: string) {
    startTransition(async () => {
      await setStockLocation(item.productId, location);
    });
  }

  function handleStatusCycle() {
    startTransition(async () => {
      await cycleStockStatus(item.productId, item.status);
    });
  }

  function handleExpiryChange(date: Date | undefined) {
    setCalendarOpen(false);
    startTransition(async () => {
      await setStockExpiry(item.productId, date?.toISOString() ?? null);
    });
  }

  function handleAddToList() {
    startTransition(async () => {
      await addOutOfStockToList(item.productId);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await removeStockItem(item.productId);
      onClose();
    });
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
        {/* Product image */}
        {item.productImageSmallUrl && (
          <div className="flex justify-center">
            <Image
              src={item.productImageSmallUrl}
              alt={item.productName}
              width={200}
              height={128}
              className="h-32 w-auto rounded-lg object-contain"
            />
          </div>
        )}

        {/* Nutriscore badge */}
        {item.productNutriscore && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Nutri-Score</span>
            <div className="flex gap-0.5">
              {(["a", "b", "c", "d", "e"] as const).map((grade) => (
                <span
                  key={grade}
                  className={cn(
                    "flex size-6 items-center justify-center rounded text-xs font-bold",
                    grade === item.productNutriscore
                      ? `${NUTRISCORE_COLORS[grade]} text-white scale-110`
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {grade.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Catégorie</p>
            <p>{categoryLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Contenu</p>
            <p>
              {item.productContentAmount && item.productContentUnit
                ? `${item.productContentAmount} ${item.productContentUnit}`
                : (item.productUnit ?? "—")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Dernier prix</p>
            <p>
              {item.productLastPrice
                ? `${Number(item.productLastPrice).toFixed(2)} €`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Dernier achat</p>
            <p>{formatDate(item.lastPurchasedAt)}</p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Statut</span>
          <Badge
            variant="outline"
            className="cursor-pointer select-none"
            onClick={handleStatusCycle}
          >
            {statusLabel}
          </Badge>
        </div>

        {/* Location */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Emplacement</span>
          <Select
            value={item.location ?? ""}
            onValueChange={handleLocationChange}
            disabled={isPending}
          >
            <SelectTrigger size="sm" className="w-40">
              <SelectValue placeholder="Non classé" />
            </SelectTrigger>
            <SelectContent>
              {LOCATIONS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Expiry date */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Expiration</span>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "w-40 justify-start text-left font-normal",
                  !expiryDate && "text-muted-foreground",
                )}
                disabled={isPending}
              >
                <CalendarIcon className="size-4" />
                {expiryDate
                  ? format(expiryDate, "d MMM yyyy", { locale: fr })
                  : "Aucune"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={expiryDate}
                onSelect={handleExpiryChange}
                locale={fr}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Tags & Purchase history */}
        {isLoadingDetails && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <div className="h-3 w-10 animate-pulse rounded bg-muted" />
              <div className="flex gap-1">
                <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
                <div className="h-5 w-18 animate-pulse rounded-full bg-muted" />
                <div className="h-5 w-12 animate-pulse rounded-full bg-muted" />
              </div>
            </div>
            <div className="h-20 animate-pulse rounded-lg bg-muted/50" />
          </div>
        )}

        {details?.tags && !isLoadingDetails && (
          <TagsSection
            tags={details.tags}
            productId={item.productId}
            isPending={isPending}
          />
        )}

        {details && !isLoadingDetails && (
          <PurchaseHistorySection details={details} />
        )}
      </div>

      <div className="flex flex-col gap-2 border-t p-4">
        {item.status === "out" && (
          <Button
            onClick={handleAddToList}
            disabled={isPending}
            className="w-full gap-2"
          >
            <ShoppingCart className="size-4" />
            Ajouter à la liste
          </Button>
        )}
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={isPending}
          size="sm"
          className="gap-2"
        >
          <Trash2 className="size-4" />
          Supprimer du stock
        </Button>
      </div>
    </>
  );
}

export function ProductDrawer({
  item,
  open,
  onOpenChange,
}: {
  item: StockItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (!item) return null;

  const subtitle = [item.productBrand, item.productGenericName]
    .filter(Boolean)
    .join(" · ");

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[85vh] max-w-md flex-col gap-0 overflow-hidden p-0"
        >
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>{item.productName}</DialogTitle>
            {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
          </DialogHeader>
          <DrawerBody item={item} onClose={() => onOpenChange(false)} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{item.productName}</DrawerTitle>
          {subtitle && <DrawerDescription>{subtitle}</DrawerDescription>}
        </DrawerHeader>
        <DrawerBody item={item} onClose={() => onOpenChange(false)} />
      </DrawerContent>
    </Drawer>
  );
}
