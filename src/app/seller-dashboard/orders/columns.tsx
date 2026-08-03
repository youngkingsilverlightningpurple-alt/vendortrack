"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Order } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, MessageSquare, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Image from "next/image";
import { formatCurrency } from "@/lib/utils";
import {
  ORDER_STATUS_VARIANT,
  REFUND_STATUS_VARIANT,
  type BadgeVariant,
} from "@/types";

const ActionCell = ({
  order,
  onEdit,
  onChat,
  isUnread,
}: {
  order: Order;
  onEdit: (order: Order) => void;
  onChat: (order: Order) => void;
  isUnread: boolean;
}) => {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onChat(order)}
          className="h-8 w-8"
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
        {isUnread && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => onChat(order)}
            className="gap-2 font-bold"
          >
            <MessageSquare className="h-4 w-4" />
            Contact Buyer {isUnread && "(New)"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => navigator.clipboard.writeText(order.id)}
          >
            Copy Order ID
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onEdit(order)}>
            Update Status
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export const getColumns = (
  onEdit: (order: Order) => void,
  onChat: (order: Order) => void,
  unreadIds: Set<string>
): ColumnDef<Order>[] => [
  {
    accessorKey: "id",
    header: "Order ID",
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        #{(row.getValue("id") as string).substring(0, 7)}
      </span>
    ),
  },
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
            <div className="font-medium">{order.productName}</div>
            <div className="text-sm text-muted-foreground">
              Qty: {order.quantity}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "buyerName",
    header: "Customer",
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("amount"));
      return <div className="font-medium">{formatCurrency(amount)}</div>;
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      const variant =
        (ORDER_STATUS_VARIANT[status as keyof typeof ORDER_STATUS_VARIANT] as BadgeVariant) ??
        "default";
      return (
        <Badge variant={variant} className="capitalize">
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "refundStatus",
    header: "Refunds",
    cell: ({ row }) => {
      const status = row.original.refundStatus;
      if (!status || status === "none") return null;

      const variant =
        status in REFUND_STATUS_VARIANT
          ? (REFUND_STATUS_VARIANT[status as keyof typeof REFUND_STATUS_VARIANT] as BadgeVariant)
          : "default";

      return (
        <Badge
          variant={variant}
          className="capitalize flex items-center gap-1"
        >
          {status === "requested" && <AlertTriangle className="h-3 w-3" />}
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
    cell: ({ row }) => {
      const order = row.original;
      return (
        <ActionCell
          order={order}
          onEdit={onEdit}
          onChat={onChat}
          isUnread={unreadIds.has(order.id)}
        />
      );
    },
  },
];
