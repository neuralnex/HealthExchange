import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/hie/client";
import type { MatchQueueItem } from "@/lib/hie/types";

export const Route = createFileRoute("/portal/queue")({ component: QueuePage });

function QueuePage() {
  const [items, setItems] = useState<MatchQueueItem[]>([]);
  const navigate = useNavigate();

  async function load() {
    const r = await api.queue();
    setItems(r.items);
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-xs tracking-[0.16em] text-fg-subtle uppercase">Client registry</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Match workbench</h1>
      <p className="mt-2 max-w-2xl text-sm text-fg-muted">
        Scores 0.60–0.89 wait here. Clerks confirm or reject. Twins and hyphenated married names
        are the marked cases. Never auto-merge on surname alone.
      </p>
      <ul className="mt-8 space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="rounded-lg p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={item.status === "pending" ? "warn" : item.status === "confirmed" ? "ok" : "neutral"}>
                  {item.status}
                </Badge>
                <span className="font-mono text-xs tabular-nums">{item.score.toFixed(2)}</span>
                <Badge>{item.band}</Badge>
              </div>
              <p className="mt-3 text-sm">
                <span className="font-medium">
                  {item.left.demographics.given} {item.left.demographics.family}
                </span>{" "}
                at {(item.left.facilityId ? item.left.facilityId.toUpperCase() : "REGISTRY")} ({item.left.mrn})
                <span className="text-fg-muted"> → </span>
                <span className="font-mono text-xs">{item.rightUhid}</span>
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {item.reasons.map((r) => (
                  <li key={r} className="rounded-full bg-sand px-2 py-0.5 text-[11px] text-fg-muted">
                    {r}
                  </li>
                ))}
              </ul>
              {item.status === "pending" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      await api.confirm({
                        uhid: item.rightUhid,
                        facilityId: item.left.facilityId,
                        mrn: item.left.mrn,
                        queueId: item.id,
                      });
                      await load();
                    }}
                  >
                    Confirm link
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await api.reject(item.id, "Possible different person");
                      await load();
                    }}
                  >
                    Not the same person
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void navigate({
                        to: "/portal/patient/$uhid",
                        params: { uhid: item.rightUhid },
                      })
                    }
                  >
                    Open UHID
                  </Button>
                </div>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
