"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Product } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Image from "next/image";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useToast } from "@/hooks/use-toast";

const ActionCell = ({ product, onEdit }: { product: Product; onEdit: (product: Product) => void }) => {
  const { supabase } = useSupabase();
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!product.id) return;
    if (confirm("Are you sure you want to soft-delete this product?")) {
        const { error } = await supabase
          .from('products')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', product.id);
        
        if (error) {
          toast({ variant: 'destructive', title: 'Delete failed', description: error.message });
        } else {
          toast({ title: 'Product removed' });
          window.location.reload();
        }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onEdit(product)}>Edit Product</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDelete} className="text-destructive">
          Delete Product
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const getColumns = (onEdit: (product: Product) => void): ColumnDef<Product>[] => [
  {
    accessorKey: "imageUrl",
    header: "Image",
    cell: ({ row }) => {
      const imageUrl = row.getValue("imageUrl") as string;
      const title = row.getValue("title") as string;
      return imageUrl ? <div className="relative h-10 w-10 overflow-hidden rounded-md border"><Image src={imageUrl} alt={title} fill className="object-cover" /></div> : null;
    }
  },
  {
    accessorKey: "title",
    header: "Title",
  },
  {
    accessorKey: "price",
    header: "Price",
     cell: ({ row }) => {
      const amount = parseFloat(row.getValue("price"));
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(amount);
      return <div className="font-medium">{formatted}</div>;
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return <Badge variant={status === "active" ? "default" : "secondary"}>{status}</Badge>;
    },
  },
   {
    accessorKey: "createdAt",
    header: "Created At",
    cell: ({ row }) => {
        const dateStr = row.getValue("createdAt") as string;
        return dateStr ? format(new Date(dateStr), "PPP") : "N/A";
    }
  },
  {
    id: "actions",
    cell: ({ row }) => <ActionCell product={row.original} onEdit={onEdit} />,
  },
];
