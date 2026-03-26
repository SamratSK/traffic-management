import { Activity, CalendarRange, RadioTower, RefreshCcw } from 'lucide-react'

import type { BnmitApiSnapshot } from '../lib/bnmitApi'

type BnmitIntelPanelProps = {
  pincode: string
  onPincodeChange: (value: string) => void
  onRefresh: () => void
  loading: boolean
  error: string
  snapshot: BnmitApiSnapshot | null
}

export function BnmitIntelPanel({
  pincode,
  onPincodeChange,
  onRefresh,
  loading,
  error,
  snapshot,
}: BnmitIntelPanelProps) {
  const strongestCrowdSector = snapshot?.crowd?.sector_data
    ?.slice()
    .sort((left, right) => right.estimated_people_count - left.estimated_people_count)[0]

  return (
    <section className="sidebar-section bnmit-panel">
      <div className="section-heading">
        <div className="section-title">
          <Activity className="section-lucide section-lucide-emerald" />
          <p className="eyebrow">BNMIT Intel</p>
        </div>
        <button type="button" className="icon-button" onClick={onRefresh} aria-label="Refresh BNMIT API data">
          <RefreshCcw className="mini-lucide" />
        </button>
      </div>

      <div className="bnmit-toolbar">
        <input
          value={pincode}
          onChange={(event) => onPincodeChange(event.target.value)}
          placeholder="560001"
          aria-label="BNMIT API pincode"
        />
        <button type="button" className="secondary-action" onClick={onRefresh} disabled={loading}>
          {loading ? 'Loading...' : 'Fetch'}
        </button>
      </div>

      {error ? <p className="runtime-message is-error">{error}</p> : null}

      <div className="stats-kpis bnmit-kpis">
        <div className="stats-kpi">
          <span>Live Incidents</span>
          <strong>{snapshot?.liveTraffic.length ?? 0}</strong>
        </div>
        <div className="stats-kpi">
          <span>Peak Incidents</span>
          <strong>{snapshot?.peakTraffic.length ?? 0}</strong>
        </div>
        <div className="stats-kpi">
          <span>Upcoming Events</span>
          <strong>{snapshot?.events?.events.length ?? 0}</strong>
        </div>
        <div className="stats-kpi">
          <span>Top-5 Cache</span>
          <strong>{snapshot?.topTraffic.length ?? 0}</strong>
        </div>
      </div>

      {strongestCrowdSector ? (
        <div className="bnmit-list">
          <div className="bnmit-list-item">
            <div className="section-title">
              <RadioTower className="mini-lucide" />
              <strong>Peak Crowd Sector</strong>
            </div>
            <p>{strongestCrowdSector.sub_location}</p>
            <p>{strongestCrowdSector.estimated_people_count} people | {strongestCrowdSector.density_status}</p>
          </div>
        </div>
      ) : null}

      {snapshot?.events?.events?.length ? (
        <div className="bnmit-list">
          {snapshot.events.events.slice(0, 3).map((eventItem) => (
            <div key={`${eventItem.event_name}-${eventItem.date}`} className="bnmit-list-item">
              <div className="section-title">
                <CalendarRange className="mini-lucide" />
                <strong>{eventItem.event_name}</strong>
              </div>
              <p>{eventItem.date}</p>
              <p>{eventItem.venue_type}</p>
            </div>
          ))}
        </div>
      ) : null}

      {snapshot?.topTraffic?.length ? (
        <div className="bnmit-list">
          {snapshot.topTraffic.slice(0, 3).map((item, index) => (
            <div key={`${item.location}-${index}`} className="bnmit-list-item">
              <strong>{item.traffic_severity}</strong>
              <p>{item.location}</p>
              <p>{item.details}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
