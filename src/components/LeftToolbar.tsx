import { Activity, CalendarPlus2, CarFront, Flame } from 'lucide-react'

type ActiveTool = 'vehicle' | 'events' | 'hotspots' | 'simulate'

type LeftToolbarProps = {
  activeTool: ActiveTool
  onSelectTool: (tool: ActiveTool) => void
}

const TOOL_ITEMS = [
  { id: 'vehicle', label: 'Vehicle', icon: CarFront },
  { id: 'events', label: 'Events', icon: CalendarPlus2 },
  { id: 'hotspots', label: 'Hotspots', icon: Flame },
  { id: 'simulate', label: 'Simulate', icon: Activity },
] as const satisfies Array<{ id: ActiveTool; label: string; icon: typeof CarFront }>

export function LeftToolbar({ activeTool, onSelectTool }: LeftToolbarProps) {
  return (
    <aside className="left-toolbar">
      <div className="toolbar-tools">
        {TOOL_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-label={item.label}
              className={activeTool === item.id ? 'toolbar-tool is-active' : 'toolbar-tool'}
              onClick={() => onSelectTool(item.id)}
            >
              <Icon className="toolbar-lucide" />
            </button>
          )
        })}
      </div>
    </aside>
  )
}
