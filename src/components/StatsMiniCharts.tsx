type SparklineProps = {
  values: number[]
  color: string
  fill: string
}

type StackedShareBarProps = {
  values: Array<{ label: string; value: number; color: string }>
}

function buildPoints(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return ''
  }

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = Math.max(1, maxValue - minValue)

  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width
      const y = height - (((value - minValue) / range) * height)
      return `${x},${y}`
    })
    .join(' ')
}

export function Sparkline({ values, color, fill }: SparklineProps) {
  const width = 220
  const height = 58
  const points = buildPoints(values, width, height)
  const areaPoints = points ? `0,${height} ${points} ${width},${height}` : ''

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {areaPoints ? <polygon points={areaPoints} fill={fill} /> : null}
      {points ? <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" /> : null}
    </svg>
  )
}

export function StackedShareBar({ values }: StackedShareBarProps) {
  const total = values.reduce((sum, item) => sum + item.value, 0) || 1

  return (
    <div className="stacked-share-bar" aria-hidden="true">
      {values.map((item) => (
        <span
          key={item.label}
          style={{
            width: `${(item.value / total) * 100}%`,
            background: item.color,
          }}
        />
      ))}
    </div>
  )
}
