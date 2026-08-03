"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Order } from "@/types";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MessageSquare, RotateCcw, Truck } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency, truncate } from "@/lib/utils";
import {
  ORDER_STATUS_VARIANT,
  REFUND_STATUS_VARIANT,
  type BadgeVariant,
} from "@/types";

export const getColumns = (
  onOpenChat: (order: Order) => void,
  onRequestRefund: (order: Order) => void,
  unreadIds: Set<string>
): ColumnDef<Order>[] => [
  {
    accessorKey: "productName",
    header: "Product",
    cell: ({ row }) => {
      const order = row.original;
      return (
        <div className="flex items-center gap-3">
          {order.productImageUrl ? (
            <Image
              src={order.productImageUrl}
              alt={order.productName}
              width={40}
              height={40}
              className="rounded-md object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-md bg-muted" />
          )}
          <div>
            <Link
              href={`/products/${order.productId}`}
              className="font-medium hover:underline"
            >
              {order.productName}
            </Link>
            <div className="text-sm text-muted-foreground">
              Qty: {order.quantity}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("amount"));
      return (
        <div className="font-medium">{formatCurrency(amount)}</div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Fulfillment",
    cell: ({ row }) => {
      const order = row.original;
      const status = order.status;
      const variant =
        (ORDER_STATUS_VARIANT[status] as BadgeVariant) ?? "default";

      return (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={variant} className="capitalize">
            {status}
          </Badge>
          {order.trackingNumber && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-[10px] font-mono text-primary cursor-help">
                    <Truck className="h-2.5 w-2.5" />
                    {truncate(order.trackingNumber, 8)}...
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    Carrier: {order.carrier || "Unknown"}
                  </p>
                  <p className="text-xs font-mono">
                    {order.trackingNumber}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "refundStatus",
    header: "Refund",
    cell: ({ row }) => {
      const status = row.original.refundStatus;
      if (!status || status === "none") return null;

      const variant =
        status in REFUND_STATUS_VARIANT
          ? (REFUND_STATUS_VARIANT[status as keyof typeof REFUND_STATUS_VARIANT] as BadgeVariant)
          : "default";

      return (
        <Badge variant={variant} className="capitalize">
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: "Date",
    cell: ({ row }) => {
      const dateValue = row.getValue("createdAt") as string;
      return dateValue ? format(new Date(dateValue), "PPP") : "N/A";
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const order = row.original;
      const isUnread = unreadIds.has(order.id);
      const canRequestRefund =
        !order.refundStatus || order.refundStatus === "none";

      return (
        <div className="flex items-center gap-2">
          <div className="relative inline-block">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChat(order)}
              className="gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Support</span>
            </Button>
            {isUnread && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
              </span>
            )}
          </div>

          {canRequestRefund && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRequestRefund(order)}
              className="text-muted-foreground hover:text-destructive"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              <span className="hidden lg:inline">Refund</span>
            </Button>
          )}
        </div>
      );
    },
  },
];
