import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_app/timetable/generate")({
  beforeLoad: () => { throw redirect({ to: "/timetable", search: { tab: "generate" } }); },
});
