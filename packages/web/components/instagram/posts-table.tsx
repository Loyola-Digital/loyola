"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, ArrowUpDown } from "lucide-react";
import Image from "next/image";
import type { InstagramMedia } from "@/lib/hooks/use-instagram";
import { format, parseISO } from "date-fns";

type SortKey = "timestamp" | "like_count" | "comments_count";

interface PostsTableProps {
  data?: InstagramMedia[];
  isLoading: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function PostsTable({ data, isLoading, onRefresh, isRefreshing }: PostsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortAsc, setSortAsc] = useState(false);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const sorted = [...(data ?? [])].sort((a, b) => {
    let diff = 0;
    if (sortKey === "timestamp") {
      diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    } else {
      diff = (a[sortKey] ?? 0) - (b[sortKey] ?? 0);
    }
    return sortAsc ? diff : -diff;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Posts Recentes</CardTitle>
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum post encontrado</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Mídia</TableHead>
                  <TableHead>Legenda</TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1" onClick={() => toggleSort("like_count")}>
                      Curtidas <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1" onClick={() => toggleSort("comments_count")}>
                      Comentários <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="-ml-3 h-8 gap-1" onClick={() => toggleSort("timestamp")}>
                      Data <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((post) => {
                  const thumb = post.thumbnail_url ?? post.media_url;
                  return (
                    <TableRow key={post.id}>
                      <TableCell>
                        {thumb ? (
                          <div className="relative h-10 w-10 overflow-hidden rounded">
                            <Image src={thumb} alt="" fill className="object-cover" sizes="40px" />
                          </div>
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted" />
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="truncate text-sm">{post.caption ?? "—"}</p>
                      </TableCell>
                      <TableCell className="text-sm">{post.like_count?.toLocaleString("pt-BR") ?? "—"}</TableCell>
                      <TableCell className="text-sm">{post.comments_count?.toLocaleString("pt-BR") ?? "—"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(parseISO(post.timestamp), "dd/MM/yy")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
