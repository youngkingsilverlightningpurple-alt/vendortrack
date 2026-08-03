"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Order } from "@/types";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { ORDER_STATUS_VARIANT, type BadgeVariant } from "@/types";

export const getColumns = (): ColumnDef<Order>[] => [
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
      const formattedStatus =
        status.charAt(0).toUpperCase() + status.slice(1);
      return <Badge variant={variant}>{formattedStatus}</Badge>;
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
    accessorKey: "id",
    header: "Order ID",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        #{(row.getValue("id") as string).substring(0, 7)}
      </span>
    ),
  },
];
