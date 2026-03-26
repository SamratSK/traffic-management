declare module 'simpleheat' {
  type SimpleHeatPoint = [number, number, number]

  type SimpleHeatInstance = {
    data: (points: SimpleHeatPoint[]) => SimpleHeatInstance
    max: (value: number) => SimpleHeatInstance
    radius: (radius: number, blur?: number) => SimpleHeatInstance
    gradient: (stops: Record<number, string>) => SimpleHeatInstance
    draw: (minOpacity?: number) => SimpleHeatInstance
  }

  export default function simpleheat(canvas: HTMLCanvasElement | string): SimpleHeatInstance
}
