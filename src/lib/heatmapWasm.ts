type HeatmapWasmExports = {
  memory: WebAssembly.Memory
  alloc_f32: (len: number) => number
  alloc_u8: (len: number) => number
  free_f32: (ptr: number, len: number) => void
  free_u8: (ptr: number, len: number) => void
  generate_heatmap_rgba: (
    pointsPtr: number,
    pointCount: number,
    width: number,
    height: number,
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number,
    baseline: number,
    outputPtr: number,
  ) => void
}

type HeatmapPointKernel = {
  lng: number
  lat: number
  spreadKm: number
  coreAmplitude: number
  ringRadiusKm: number
  ringWidthKm: number
  ringAmplitude: number
}

let wasmModulePromise: Promise<HeatmapWasmExports | null> | null = null

async function loadHeatmapWasm() {
  if (wasmModulePromise) {
    return wasmModulePromise
  }

  wasmModulePromise = (async () => {
    try {
      const response = await fetch(new URL('../wasm/heatmap_kernel.wasm', import.meta.url))
      const bytes = await response.arrayBuffer()
      const result = await WebAssembly.instantiate(bytes, {})
      return result.instance.exports as unknown as HeatmapWasmExports
    } catch {
      return null
    }
  })()

  return wasmModulePromise
}

export async function renderHeatmapWithWasm(
  width: number,
  height: number,
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  baseline: number,
  points: HeatmapPointKernel[],
) {
  const wasm = await loadHeatmapWasm()
  if (!wasm) {
    return null
  }

  const pointBuffer = new Float32Array(points.length * 7)
  points.forEach((point, index) => {
    const offset = index * 7
    pointBuffer[offset] = point.lng
    pointBuffer[offset + 1] = point.lat
    pointBuffer[offset + 2] = point.spreadKm
    pointBuffer[offset + 3] = point.coreAmplitude
    pointBuffer[offset + 4] = point.ringRadiusKm
    pointBuffer[offset + 5] = point.ringWidthKm
    pointBuffer[offset + 6] = point.ringAmplitude
  })

  const pointsPtr = wasm.alloc_f32(pointBuffer.length)
  const outputLength = width * height * 4
  const outputPtr = wasm.alloc_u8(outputLength)

  try {
    new Float32Array(wasm.memory.buffer, pointsPtr, pointBuffer.length).set(pointBuffer)

    wasm.generate_heatmap_rgba(
      pointsPtr,
      points.length,
      width,
      height,
      bounds.minLng,
      bounds.minLat,
      bounds.maxLng,
      bounds.maxLat,
      baseline,
      outputPtr,
    )

    const rgba = new Uint8ClampedArray(outputLength)
    rgba.set(new Uint8Array(wasm.memory.buffer, outputPtr, outputLength))
    return rgba
  } finally {
    wasm.free_f32(pointsPtr, pointBuffer.length)
    wasm.free_u8(outputPtr, outputLength)
  }
}
