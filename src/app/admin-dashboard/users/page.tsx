'use client';

import { useState, useEffect } from 'react';
import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { useSupabase } from '@/components/providers/supabase-provider';
import type { UserProfile, ProfileRow } from '@/types';
import { profileRowToDomain, getErrorMessage } from '@/types';
import { createLogger } from '@/lib/logger';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { ShieldAlert, ShieldCheck, UserCheck, UserX, Clock, CheckCircle2, AlertCircle, Loader2, Zap, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { purgeAllUsers } from '@/lib/seed-service';

const log = createLogger('admin-users');

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const { supabase, user } = useSupabase();
  const { toast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => { if (data) setProfile(profileRowToDomain(data as ProfileRow)); });
    }
  }, [user, supabase]);

  const fetchUsers = async (pageToFetch: number = 0) => {
    const loadingSetter = pageToFetch > 0 ? setIsLoadingMore : setIsLoading;
    loadingSetter(true);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .range(pageToFetch * PAGE_SIZE, (pageToFetch + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      const userList = (data || []).map(u => profileRowToDomain(u as ProfileRow));
      
      setUsers(prev => pageToFetch > 0 ? [...prev, ...userList] : userList);
      setPage(pageToFetch);

      if (userList.length < PAGE_SIZE) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
    } catch (error: unknown) {
      log.error("Failed to fetch users:", undefined, error);
      toast({
        variant: "destructive",
        title: "Fetch failed",
        description: "Could not load user list."
      });
    } finally {
      loadingSetter(false);
    }
  };

  useEffect(() => {
    fetchUsers(0);
  }, []);

  const handlePurgeUsers = async () => {
    if (!user) return;
    if (!confirm("CRITICAL ACTION: Are you sure you want to delete ALL registered users? This will remove every account except yours. This cannot be undone.")) return;

    if (profile?.isDemo) {
        toast({ title: "Demo Simulation", description: "Purge simulated." });
        return;
    }

    setIsPurging(true);
    try {
      const deletedCount = await purgeAllUsers(user.id);
      toast({
        title: "Purge Complete",
        description: `Successfully deleted ${deletedCount} user accounts.`,
      });
      fetchUsers(0);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Purge Failed",
        description: getErrorMessage(error),
      });
    } finally {
      setIsPurging(false);
    }
  };

  const toggleAdmin = async (userId: string, currentStatus: boolean) => {
    if (profile?.isDemo) {
        toast({ title: "Demo Simulation", description: "Role toggle simulated." });
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isAdmin: !currentStatus } : u));
        return;
    }

    try {
      const { error } = await supabase.from('profiles').update({ is_admin: !currentStatus }).eq('id', userId);
      if (error) throw error;
      toast({ title: "Role Updated" });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isAdmin: !currentStatus } : u));
    } catch (error: unknown) {
      toast({ variant: "destructive", title: "Update failed", description: getErrorMessage(error) });
    }
  };

  const updateSellerStatus = async (userId: string, status: 'approved' | 'rejected' | 'pending') => {
    if (profile?.isDemo) {
        toast({ title: "Demo Simulation", description: "Vendor status update simulated." });
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, sellerStatus: status } : u));
        return;
    }

    try {
      const { error } = await supabase.from('profiles').update({ seller_status: status }).eq('id', userId);
      if (error) throw error;
      toast({ title: "Vendor Status Updated" });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, sellerStatus: status } : u));
    } catch (error: unknown) {
      toast({ variant: "destructive", title: "Update failed", description: getErrorMessage(error) });
    }
  };

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500 hover:bg-green-600">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      default:
        return null;
    }
  };

  const getStripeBadge = (connected: boolean | undefined) => {
    if (connected) {
      return (
        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Connected
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 flex items-center gap-1">
        <AlertCircle className="h-3 w-3" /> Missing
      </Badge>
    );
  };

  return (
    <AuthenticatedLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-primary">Account Management</h1>
          <div className="flex items-center gap-2">
            <Button 
                variant="destructive" 
                size="sm" 
                className="bg-red-600 hover:bg-red-700"
                onClick={handlePurgeUsers}
                disabled={isPurging || isLoading}
            >
                {isPurging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Purge All Users
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchUsers(0)} disabled={isLoading}>
                Refresh List
            </Button>
          </div>
        </div>
        
        <Card>
            <CardHeader>
                <CardTitle>Platform Accounts</CardTitle>
                <CardDescription>Review applications and manage platform permissions.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-md border overflow-hidden">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead>User Details</TableHead>
                                        <TableHead>Account Type</TableHead>
                                        <TableHead>Seller Status</TableHead>
                                        <TableHead>Stripe</TableHead>
                                        <TableHead>Joined</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                                No users found.
                                            </TableCell>
                                        </TableRow>
                                    ) : users.map((user) => (
                                        <TableRow key={user.id} className="hover:bg-muted/30">
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium flex items-center">
                                                        {user.fullName}
                                                        {user.isAdmin && <Badge className="ml-2 bg-blue-500">Admin</Badge>}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">{user.email}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={user.role === 'seller' ? 'default' : 'outline'} className="capitalize">
                                                    {user.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {user.role === 'seller' ? getStatusBadge(user.sellerStatus) : <span className="text-muted-foreground text-xs italic">Not a vendor</span>}
                                            </TableCell>
                                            <TableCell>
                                                {user.role === 'seller' ? getStripeBadge(user.stripeConnected) : <span className="text-muted-foreground text-xs">-</span>}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {user.createdAt ? format(new Date(user.createdAt), 'MMM d, yyyy') : 'N/A'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm">Manage</Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Account Settings</DropdownMenuLabel>
                                                        <DropdownMenuItem onClick={() => toggleAdmin(user.id, !!user.isAdmin)}>
                                                            {user.isAdmin ? <ShieldAlert className="h-4 w-4 mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                                                            {user.isAdmin ? 'Revoke Admin' : 'Make Admin'}
                                                        </DropdownMenuItem>
                                                        
                                                        {user.role === 'seller' && (
                                                            <>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuLabel>Vendor Review</DropdownMenuLabel>
                                                                <DropdownMenuItem onClick={() => updateSellerStatus(user.id, 'approved')} className="text-green-600 focus:text-green-600">
                                                                    <UserCheck className="h-4 w-4 mr-2" />
                                                                    Approve Vendor
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => updateSellerStatus(user.id, 'rejected')} className="text-destructive focus:text-destructive">
                                                                    <UserX className="h-4 w-4 mr-2" />
                                                                    Reject Vendor
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {hasMore && (
                            <div className="flex justify-center pt-4">
                                <Button onClick={() => fetchUsers(page + 1)} disabled={isLoadingMore} variant="outline">
                                    {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Load More Users
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
}
