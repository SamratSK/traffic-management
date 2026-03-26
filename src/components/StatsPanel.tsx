import { Activity, BarChart3, GitBranch, X } from 'lucide-react'

import { Sparkline, StackedShareBar } from './StatsMiniCharts'
import type { SimulationLiveStats } from '../types/runtime'

type StatsHistoryPoint = {
  averageSpeedKph: number
  arrivedVehicles: number
  reroutedVehicles: number
  rerouteQueueSize: number
  optimizedSignals: number
  fps: number
}

type StatsPanelProps = {
  stats: SimulationLiveStats
  optimizedSignals: number
  onClose: () => void
  signalStates: {
    go: number
    hold: number
    stop: number
  }
  history: StatsHistoryPoint[]
  fps: number
}

function formatSpeed(value: number) {
  return `${value.toFixed(1)} km/h`
}

function formatDisplaySpeed(value: number) {
  return formatSpeed(value / 7)
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

export function StatsPanel({ stats, optimizedSignals, onClose, signalStates, history, fps }: StatsPanelProps) {
  const arrivalRate = stats.fleetSize > 0 ? (stats.arrivedVehicles / stats.fleetSize) * 100 : 0
  const adaptiveCoverage = stats.fleetSize > 0 ? (optimizedSignals / Math.max(signalStates.go + signalStates.hold + signalStates.stop, 1)) * 100 : 0

  return (
    <aside className="stats-card">
      <div className="stats-header">
        <div>
          <p className="eyebrow">Live Analytics</p>
          <strong>Traffic Command</strong>
        </div>
        <button type="button" className="stats-close" onClick={onClose} aria-label="Close stats panel">
          <X className="mini-lucide" />
        </button>
      </div>

      <div className="stats-kpis">
        <div className="stats-kpi">
          <span>Fleet</span>
          <strong>{stats.fleetSize}</strong>
        </div>
        <div className="stats-kpi">
          <span>Avg Speed</span>
          <strong>{formatDisplaySpeed(stats.averageSpeedKph)}</strong>
        </div>
        <div className="stats-kpi">
          <span>Arrivals</span>
          <strong>{formatPercent(arrivalRate)}</strong>
        </div>
        <div className="stats-kpi">
          <span>Adaptive</span>
          <strong>{formatPercent(adaptiveCoverage)}</strong>
        </div>
        <div className="stats-kpi">
          <span>FPS</span>
          <strong>{fps}</strong>
        </div>
      </div>

      <section className="stats-section">
        <div className="stats-section-title">
          <Activity className="mini-lucide" />
          <span>Flow Trend</span>
        </div>
        <Sparkline
          values={history.map((point) => point.averageSpeedKph)}
          color="#2f7f5f"
          fill="rgba(99, 178, 135, 0.14)"
        />
        <div className="stats-meta-row">
          <span>Speed / FPS</span>
          <strong>{formatDisplaySpeed(stats.averageSpeedKph)} / {fps}</strong>
        </div>
      </section>

      <section className="stats-section">
        <div className="stats-section-title">
          <Activity className="mini-lucide" />
          <span>Render Performance</span>
        </div>
        <Sparkline
          values={history.map((point) => point.fps)}
          color="#2563eb"
          fill="rgba(37, 99, 235, 0.14)"
        />
        <div className="stats-meta-row">
          <span>UI frame rate</span>
          <strong>{fps} fps</strong>
        </div>
      </section>

      <section className="stats-section">
        <div className="stats-section-title">
          <GitBranch className="mini-lucide" />
          <span>Reroute Pressure</span>
        </div>
        <Sparkline
          values={history.map((point) => point.rerouteQueueSize + point.reroutedVehicles)}
          color="#b45309"
          fill="rgba(245, 158, 11, 0.14)"
        />
        <div className="stats-meta-row">
          <span>Queued / rerouted</span>
          <strong>{stats.rerouteQueueSize} / {stats.reroutedVehicles}</strong>
        </div>
      </section>

      <section className="stats-section">
        <div className="stats-section-title">
          <BarChart3 className="mini-lucide" />
          <span>Signal State Mix</span>
        </div>
        <StackedShareBar
          values={[
            { label: 'Go', value: signalStates.go, color: '#22c55e' },
            { label: 'Hold', value: signalStates.hold, color: '#f59e0b' },
            { label: 'Stop', value: signalStates.stop, color: '#ef4444' },
          ]}
        />
        <div className="stats-legend">
          <span><i style={{ background: '#22c55e' }} />Go {signalStates.go}</span>
          <span><i style={{ background: '#f59e0b' }} />Hold {signalStates.hold}</span>
          <span><i style={{ background: '#ef4444' }} />Stop {signalStates.stop}</span>
        </div>
      </section>
    </aside>
  )
}
