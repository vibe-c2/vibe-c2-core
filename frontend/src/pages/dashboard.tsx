export function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-2 p-2">
      <div className="grid auto-rows-min gap-2 md:grid-cols-3">
        <div className="aspect-video rounded-xl bg-muted/50" />
        <div className="aspect-video rounded-xl bg-muted/50" />
        <div className="aspect-video rounded-xl bg-muted/50" />
      </div>
      <div className="min-h-[50vh] flex-1 rounded-xl bg-muted/50" />
    </div>
  )
}
