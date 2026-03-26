import type { Coordinate } from '../types/offline'
import type { ScenarioIncident } from '../types/runtime'
import type { VehiclePlan } from '../types/simulation'
import {
  Activity,
  AlertTriangle,
  CalendarPlus2,
  CarFront,
  Flame,
  Pencil,
  X,
} from 'lucide-react'
import { BnmitIntelPanel } from './BnmitIntelPanel'
import type { BnmitApiSnapshot } from '../lib/bnmitApi'

type ActiveTool = 'vehicle' | 'events' | 'hotspots' | 'simulate'

type DistributionRow = {
  key: string
  label: string
  value: number
}

type DestinationOption = {
  value: string
  label: string
}

type VehicleListItem = VehiclePlan & {
  arrived: boolean
  currentSpeedKph: number
}

type IncidentListItem = ScenarioIncident

type SidebarProps = {
  collapsed: boolean
  activeTool: ActiveTool
  error: string
  onCollapse: () => void
  destinationOptions: DestinationOption[]
  vehicleDestinationMode: string
  onVehicleDestinationModeChange: (value: string) => void
  speedRangeMinKph: number
  speedRangeMaxKph: number
  onSpeedRangeMinKphChange: (value: number) => void
  onSpeedRangeMaxKphChange: (value: number) => void
  pendingVehicleStart: Coordinate | null
  pendingVehicleEnd: Coordinate | null
  vehicles: VehicleListItem[]
  onVehicleFocus: (vehicleId: number) => void
  onVehicleRemove: (vehicleId: number) => void
  onClearAllVehicles: () => void
  randomVehicleCount: number
  onRandomVehicleCountChange: (value: number) => void
  onRandomizeVehicles: () => void
  distributionOpen: boolean
  onToggleDistributionOpen: () => void
  distributionRows: DistributionRow[]
  onDistributionValueChange: (key: string, value: number) => void
  onApplyDistributionToCurrentRoutes: () => void
  sameStartPoint: boolean
  sameEndPoint: boolean
  onSameStartPointChange: (value: boolean) => void
  onSameEndPointChange: (value: boolean) => void
  onPickSharedStart: () => void
  onPickSharedEnd: () => void
  sharedStartPoint: Coordinate | null
  sharedEndPoint: Coordinate | null
  simulationRunning: boolean
  onToggleSimulationRunning: () => void
  events: IncidentListItem[]
  hotspots: IncidentListItem[]
  eventRadiusMinKm: number
  eventRadiusMaxKm: number
  onEventRadiusMinKmChange: (value: number) => void
  onEventRadiusMaxKmChange: (value: number) => void
  hotspotRadiusMinKm: number
  hotspotRadiusMaxKm: number
  onHotspotRadiusMinKmChange: (value: number) => void
  onHotspotRadiusMaxKmChange: (value: number) => void
  pendingDraftName: string
  setPendingDraftName: (value: string) => void
  pendingDraftCategory: string
  setPendingDraftCategory: (value: string) => void
  pendingDraftDescription: string
  setPendingDraftDescription: (value: string) => void
  onIncidentFocus: (incidentId: string) => void
  onIncidentEdit: (incidentId: string) => void
  onIncidentRemove: (incidentId: string) => void
  onClearEvents: () => void
  onClearHotspots: () => void
  editingIncident: IncidentListItem | null
  onEditDraftChange: (field: 'name' | 'category' | 'description' | 'radiusKm', value: string | number) => void
  onSaveIncidentEdit: () => void
  onCancelIncidentEdit: () => void
  showHeatmap: boolean
  onToggleHeatmap: () => void
  simulationProgressPercent: number
  simulationConsole: Array<{ id: string; message: string }>
  onClearSimulationConsole: () => void
  debugBreakouts: boolean
  onToggleDebugBreakouts: () => void
  bnmitPincode: string
  onBnmitPincodeChange: (value: string) => void
  onRefreshBnmitData: () => void
  bnmitLoading: boolean
  bnmitError: string
  bnmitSnapshot: BnmitApiSnapshot | null
}

const CATEGORY_OPTIONS = [
  'religious',
  'institute',
  'cultural',
  'civic',
  'medical',
  'commercial',
  'crowd',
  'other',
]

function formatCoordinate(coordinate: Coordinate | null) {
  if (!coordinate) return 'Not set'
  return `${coordinate[1].toFixed(5)}, ${coordinate[0].toFixed(5)}`
}

function destinationHint(vehicleDestinationMode: string, pendingVehicleStart: Coordinate | null) {
  if (vehicleDestinationMode === 'custom') {
    return pendingVehicleStart ? 'Pick the end point on the map.' : 'Pick the start point on the map.'
  }
  return 'Pick one start point on the map. The selected event becomes the end point.'
}

function PencilButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="icon-button" onClick={onClick} aria-label="Edit item">
      <Pencil className="mini-lucide" />
    </button>
  )
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="icon-button icon-button-danger" onClick={onClick} aria-label={label}>
      <X className="mini-lucide" />
    </button>
  )
}

function IncidentEditorModal(props: Pick<
  SidebarProps,
  | 'editingIncident'
  | 'onEditDraftChange'
  | 'onSaveIncidentEdit'
  | 'onCancelIncidentEdit'
>) {
  if (!props.editingIncident) return null

  return (
    <div className="modal-backdrop">
      <div className="modal-panel">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Edit Item</p>
            <strong>{props.editingIncident.name}</strong>
          </div>
          <button type="button" className="icon-button" onClick={props.onCancelIncidentEdit} aria-label="Close edit dialog">
            <X className="mini-lucide" />
          </button>
        </div>

        <div className="modal-form">
          <div className="modal-field">
            <label className="field-label" htmlFor="edit-name">Name</label>
            <input id="edit-name" value={props.editingIncident.name} onChange={(event) => props.onEditDraftChange('name', event.target.value)} />
          </div>

          <div className="range-grid">
            <div className="modal-field">
              <label className="field-label" htmlFor="edit-category">Category</label>
              <select id="edit-category" value={props.editingIncident.category} onChange={(event) => props.onEditDraftChange('category', event.target.value)}>
                {CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div className="modal-field">
              <label className="field-label" htmlFor="edit-radius">Radius (km)</label>
              <input
                id="edit-radius"
                type="number"
                min="0.1"
                max="10"
                step="0.1"
                value={props.editingIncident.radiusKm}
                onChange={(event) => props.onEditDraftChange('radiusKm', Number(event.target.value) || 0.5)}
              />
            </div>
          </div>

          <div className="modal-field">
            <label className="field-label" htmlFor="edit-description">Description</label>
            <textarea
              id="edit-description"
              rows={4}
              value={props.editingIncident.description}
              onChange={(event) => props.onEditDraftChange('description', event.target.value)}
            />
          </div>
        </div>

        <div className="actions">
          <button type="button" onClick={props.onCancelIncidentEdit}>Cancel</button>
          <button type="button" onClick={props.onSaveIncidentEdit}>Save</button>
        </div>
      </div>
    </div>
  )
}

function VehiclePanel(props: Pick<
  SidebarProps,
  | 'destinationOptions'
  | 'vehicleDestinationMode'
  | 'onVehicleDestinationModeChange'
  | 'speedRangeMinKph'
  | 'speedRangeMaxKph'
  | 'onSpeedRangeMinKphChange'
  | 'onSpeedRangeMaxKphChange'
  | 'pendingVehicleStart'
  | 'pendingVehicleEnd'
  | 'vehicles'
  | 'onVehicleFocus'
  | 'onVehicleRemove'
  | 'onClearAllVehicles'
  | 'randomVehicleCount'
  | 'onRandomVehicleCountChange'
  | 'onRandomizeVehicles'
  | 'distributionOpen'
  | 'onToggleDistributionOpen'
  | 'distributionRows'
  | 'onDistributionValueChange'
  | 'onApplyDistributionToCurrentRoutes'
  | 'sameStartPoint'
  | 'sameEndPoint'
  | 'onSameStartPointChange'
  | 'onSameEndPointChange'
  | 'onPickSharedStart'
  | 'onPickSharedEnd'
  | 'sharedStartPoint'
  | 'sharedEndPoint'
  | 'simulationRunning'
  | 'onToggleSimulationRunning'
>) {
  return (
    <div className="tool-panel">
      <section className="sidebar-section compact">
        <label className="field-label" htmlFor="vehicle-destination-mode">Destination</label>
        <select
          id="vehicle-destination-mode"
          value={props.vehicleDestinationMode}
          onChange={(event) => props.onVehicleDestinationModeChange(event.target.value)}
        >
          {props.destinationOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        <div className="range-grid">
          <div>
            <label className="field-label" htmlFor="vehicle-speed-min">Speed Min</label>
            <input id="vehicle-speed-min" type="number" value={props.speedRangeMinKph} onChange={(event) => props.onSpeedRangeMinKphChange(Number(event.target.value) || 10)} />
          </div>
          <div>
            <label className="field-label" htmlFor="vehicle-speed-max">Speed Max</label>
            <input id="vehicle-speed-max" type="number" value={props.speedRangeMaxKph} onChange={(event) => props.onSpeedRangeMaxKphChange(Number(event.target.value) || 10)} />
          </div>
        </div>

        <p className="helper-text">{destinationHint(props.vehicleDestinationMode, props.pendingVehicleStart)}</p>
        <div className="coordinate-readout">
          <span>Start: {formatCoordinate(props.pendingVehicleStart)}</span>
          <span>End: {formatCoordinate(props.pendingVehicleEnd)}</span>
        </div>
      </section>

      <section className="sidebar-section entity-list-section">
        <div className="section-heading">
          <div className="section-title">
            <CarFront className="section-lucide section-lucide-emerald" />
            <p className="eyebrow">Vehicles</p>
          </div>
          <strong>{props.vehicles.length}</strong>
        </div>
        <div className="entity-list">
          {props.vehicles.length === 0 ? (
            <p className="empty-state">No vehicles added yet.</p>
          ) : (
            props.vehicles.map((vehicle) => (
              <article
                key={vehicle.id}
                className={vehicle.arrived ? 'entity-row is-muted' : 'entity-row'}
                onDoubleClick={() => props.onVehicleFocus(vehicle.id)}
                title="Double click to fit route"
              >
                <button type="button" className="entity-row-remove" onClick={() => props.onVehicleRemove(vehicle.id)} aria-label={`Remove ${vehicle.label}`}>
                  <X className="mini-lucide" />
                </button>
                <div className="entity-row-head">
                  <strong>{vehicle.label}</strong>
                  <span>{vehicle.speedKph} km/h</span>
                </div>
                <p>Live: {vehicle.currentSpeedKph.toFixed(1)} km/h</p>
                <p>Start: {formatCoordinate(vehicle.start)}</p>
                <p>End: {formatCoordinate(vehicle.end)}</p>
                <p>{vehicle.targetName}</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="sidebar-section docked-section">
        <div className="batch-actions">
          <button type="button" className="secondary-action" onClick={props.onToggleSimulationRunning}>
            {props.simulationRunning ? 'Pause Simulation' : 'Start Simulation'}
          </button>
          <button type="button" className="secondary-action" onClick={props.onClearAllVehicles}>
            Clear All
          </button>
        </div>

        <div className="inline-controls">
          <input type="number" min="1" max="600" value={props.randomVehicleCount} onChange={(event) => props.onRandomVehicleCountChange(Math.max(1, Math.min(600, Number(event.target.value) || 1)))} />
          <button type="button" className="secondary-action" onClick={props.onRandomizeVehicles}>Randomize</button>
          <button type="button" className="icon-action" onClick={props.onToggleDistributionOpen}>%</button>
        </div>

        {props.distributionOpen ? (
          <div className="distribution-popup">
            <div className="distribution-table">
              {props.distributionRows.map((row) => (
                <label key={row.key} className="distribution-row">
                  <span>{row.label}</span>
                  <input type="number" min="0" max="100" value={row.value} onChange={(event) => props.onDistributionValueChange(row.key, Math.max(0, Math.min(100, Number(event.target.value) || 0)))} />
                </label>
              ))}
            </div>
            <div className="distribution-actions">
              <button type="button" className="secondary-action" onClick={props.onApplyDistributionToCurrentRoutes}>
                Randomize Current Routes
              </button>
            </div>
          </div>
        ) : null}

        <div className="line-toggle">
          <button
            type="button"
            className={props.sameStartPoint ? 'chip-button is-active' : 'chip-button'}
            onClick={() => {
              if (props.sameStartPoint) {
                props.onSameStartPointChange(false)
                return
              }
              props.onSameStartPointChange(true)
              props.onPickSharedStart()
            }}
          >
            Same Start Point
          </button>
          <button type="button" className="text-action" onClick={props.onPickSharedStart}>{formatCoordinate(props.sharedStartPoint)}</button>
        </div>

        <div className="line-toggle">
          <button
            type="button"
            className={props.sameEndPoint ? 'chip-button is-active' : 'chip-button'}
            onClick={() => {
              if (props.sameEndPoint) {
                props.onSameEndPointChange(false)
                return
              }
              props.onSameEndPointChange(true)
              props.onPickSharedEnd()
            }}
          >
            Same End Point
          </button>
          <button type="button" className="text-action" onClick={props.onPickSharedEnd}>{formatCoordinate(props.sharedEndPoint)}</button>
        </div>
      </section>
    </div>
  )
}

function IncidentPanel({
  title,
  items,
  radiusMinKm,
  radiusMaxKm,
  onRadiusMinKmChange,
  onRadiusMaxKmChange,
  pendingDraftName,
  setPendingDraftName,
  pendingDraftCategory,
  setPendingDraftCategory,
  pendingDraftDescription,
  setPendingDraftDescription,
  onIncidentFocus,
  onIncidentEdit,
  onIncidentRemove,
  onClear,
  showHeatmap,
  onToggleHeatmap,
}: {
  title: string
  items: IncidentListItem[]
  radiusMinKm: number
  radiusMaxKm: number
  onRadiusMinKmChange: (value: number) => void
  onRadiusMaxKmChange: (value: number) => void
  pendingDraftName: string
  setPendingDraftName: (value: string) => void
  pendingDraftCategory: string
  setPendingDraftCategory: (value: string) => void
  pendingDraftDescription: string
  setPendingDraftDescription: (value: string) => void
  onIncidentFocus: (incidentId: string) => void
  onIncidentEdit: (incidentId: string) => void
  onIncidentRemove: (incidentId: string) => void
  onClear: () => void
  showHeatmap: boolean
  onToggleHeatmap: () => void
}) {
  return (
    <div className="tool-panel">
      <section className="sidebar-section compact">
        <div className="section-heading">
          <div className="section-title">
            {title === 'Events' ? (
              <CalendarPlus2 className="section-lucide section-lucide-emerald" />
            ) : (
              <Flame className="section-lucide section-lucide-amber" />
            )}
            <p className="eyebrow">{title}</p>
          </div>
          <strong>Click map to add</strong>
        </div>

        <div className="range-grid">
          <div>
            <label className="field-label" htmlFor={`${title}-radius-min`}>Radius Min</label>
            <input id={`${title}-radius-min`} type="number" min="0.1" max="10" step="0.1" value={radiusMinKm} onChange={(event) => onRadiusMinKmChange(Number(event.target.value) || 0.2)} />
          </div>
          <div>
            <label className="field-label" htmlFor={`${title}-radius-max`}>Radius Max</label>
            <input id={`${title}-radius-max`} type="number" min="0.1" max="10" step="0.1" value={radiusMaxKm} onChange={(event) => onRadiusMaxKmChange(Number(event.target.value) || 0.4)} />
          </div>
        </div>

        <label className="field-label" htmlFor={`${title}-name`}>Default Name</label>
        <input id={`${title}-name`} value={pendingDraftName} onChange={(event) => setPendingDraftName(event.target.value)} />

        <label className="field-label" htmlFor={`${title}-category`}>Category</label>
        <select id={`${title}-category`} value={pendingDraftCategory} onChange={(event) => setPendingDraftCategory(event.target.value)}>
          {CATEGORY_OPTIONS.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>

        <label className="field-label" htmlFor={`${title}-description`}>Description</label>
        <textarea id={`${title}-description`} rows={3} value={pendingDraftDescription} onChange={(event) => setPendingDraftDescription(event.target.value)} />
      </section>

      <section className="sidebar-section entity-list-section">
        <div className="section-heading">
          <p className="eyebrow">{title} List</p>
          <strong>{items.length}</strong>
        </div>
        <div className="entity-list">
          {items.length === 0 ? (
            <p className="empty-state">No items added yet.</p>
          ) : (
            items.map((item) => (
              <article key={item.id} className="entity-row" onDoubleClick={() => onIncidentFocus(item.id)} title="Double click to zoom">
                <div className="entity-row-head">
                  <strong>{item.name}</strong>
                  <div className="entity-row-actions">
                    <PencilButton onClick={() => onIncidentEdit(item.id)} />
                    <RemoveButton onClick={() => onIncidentRemove(item.id)} label={`Remove ${item.name}`} />
                  </div>
                </div>
                <p>{item.radiusKm.toFixed(2)} km radius</p>
                <p>{item.category}</p>
                <p>{item.description}</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="sidebar-section docked-section">
        <div className="batch-actions">
          <button type="button" className="secondary-action" onClick={onClear}>Clear All</button>
          <button type="button" className="secondary-action" onClick={onToggleHeatmap}>
            {showHeatmap ? 'Hide Heatmap' : 'Show Heatmap'}
          </button>
        </div>
      </section>
    </div>
  )
}

export function Sidebar(props: SidebarProps) {
  if (props.collapsed) return null

  return (
    <>
      <aside className="sidebar-shell">
        <div className="sidebar-header">
          <div className="header-block">
            <div className="header-icon">
              <AlertTriangle className="header-lucide" />
            </div>
            <div>
              <p className="eyebrow">Identified Management</p>
              <h1>
                {props.activeTool === 'vehicle'
                  ? 'Vehicle Operations'
                  : props.activeTool === 'events'
                    ? 'Event Operations'
                    : props.activeTool === 'hotspots'
                      ? 'Hotspot Operations'
                      : 'Simulation Control'}
              </h1>
            </div>
          </div>
          <button type="button" className="sidebar-collapse" onClick={props.onCollapse} aria-label="Collapse sidebar">
            →
          </button>
        </div>

        <div className="sidebar-divider" />

        {props.activeTool === 'vehicle' ? (
          <VehiclePanel {...props} />
        ) : props.activeTool === 'events' ? (
          <IncidentPanel
            title="Events"
            items={props.events}
            radiusMinKm={props.eventRadiusMinKm}
            radiusMaxKm={props.eventRadiusMaxKm}
            onRadiusMinKmChange={props.onEventRadiusMinKmChange}
            onRadiusMaxKmChange={props.onEventRadiusMaxKmChange}
            pendingDraftName={props.pendingDraftName}
            setPendingDraftName={props.setPendingDraftName}
            pendingDraftCategory={props.pendingDraftCategory}
            setPendingDraftCategory={props.setPendingDraftCategory}
            pendingDraftDescription={props.pendingDraftDescription}
            setPendingDraftDescription={props.setPendingDraftDescription}
            onIncidentFocus={props.onIncidentFocus}
            onIncidentEdit={props.onIncidentEdit}
            onIncidentRemove={props.onIncidentRemove}
            onClear={props.onClearEvents}
            showHeatmap={props.showHeatmap}
            onToggleHeatmap={props.onToggleHeatmap}
          />
        ) : props.activeTool === 'hotspots' ? (
          <IncidentPanel
            title="Hotspots"
            items={props.hotspots}
            radiusMinKm={props.hotspotRadiusMinKm}
            radiusMaxKm={props.hotspotRadiusMaxKm}
            onRadiusMinKmChange={props.onHotspotRadiusMinKmChange}
            onRadiusMaxKmChange={props.onHotspotRadiusMaxKmChange}
            pendingDraftName={props.pendingDraftName}
            setPendingDraftName={props.setPendingDraftName}
            pendingDraftCategory={props.pendingDraftCategory}
            setPendingDraftCategory={props.setPendingDraftCategory}
            pendingDraftDescription={props.pendingDraftDescription}
            setPendingDraftDescription={props.setPendingDraftDescription}
            onIncidentFocus={props.onIncidentFocus}
            onIncidentEdit={props.onIncidentEdit}
            onIncidentRemove={props.onIncidentRemove}
            onClear={props.onClearHotspots}
            showHeatmap={props.showHeatmap}
            onToggleHeatmap={props.onToggleHeatmap}
          />
        ) : (
          <section className="sidebar-section simulate-panel">
            <div className="section-heading">
              <div className="section-title">
                <Activity className="section-lucide section-lucide-amber" />
                <p className="eyebrow">Simulation</p>
              </div>
              <strong>{props.simulationRunning ? 'Running' : 'Stopped'}</strong>
            </div>

            <div className="batch-actions">
              <button type="button" className="secondary-action" onClick={props.onToggleSimulationRunning}>
                {props.simulationRunning ? 'Stop Simulation' : 'Start Simulation'}
              </button>
              <button type="button" className="text-action" onClick={props.onClearSimulationConsole}>
                Clear Console
              </button>
            </div>

            <div className="line-toggle">
              <button
                type="button"
                className={props.debugBreakouts ? 'chip-button is-active' : 'chip-button'}
                onClick={props.onToggleDebugBreakouts}
              >
                {props.debugBreakouts ? 'Hide Debug Paths' : 'Show Debug Paths'}
              </button>
            </div>

            <div className="progress-block">
              <div className="progress-meta">
                <span className="label">Progress</span>
                <strong>{props.simulationProgressPercent.toFixed(0)}%</strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${props.simulationProgressPercent}%` }} />
              </div>
            </div>

            <div className="console-panel">
              {props.simulationConsole.length === 0 ? (
                <p className="empty-state">No simulation messages yet.</p>
              ) : (
                props.simulationConsole.map((entry) => (
                  <div key={entry.id} className="console-line">{entry.message}</div>
                ))
              )}
            </div>

            <BnmitIntelPanel
              pincode={props.bnmitPincode}
              onPincodeChange={props.onBnmitPincodeChange}
              onRefresh={props.onRefreshBnmitData}
              loading={props.bnmitLoading}
              error={props.bnmitError}
              snapshot={props.bnmitSnapshot}
            />
          </section>
        )}

        <p className={`runtime-message${props.error ? ' is-error' : ''}`}>
          {props.error || ''}
        </p>
      </aside>

      <IncidentEditorModal
        editingIncident={props.editingIncident}
        onEditDraftChange={props.onEditDraftChange}
        onSaveIncidentEdit={props.onSaveIncidentEdit}
        onCancelIncidentEdit={props.onCancelIncidentEdit}
      />
    </>
  )
}
