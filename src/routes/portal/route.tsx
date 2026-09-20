import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PortalShell } from "@/components/layout/portal-shell";

export const Route = createFileRoute("/portal")({
  component: PortalLayout,
});

function PortalLayout() {
  return (
    <PortalShell>
      <Outlet />
    </PortalShell>
  );
}
