import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Camera, Gauge, Radar, TimerReset, X } from 'lucide-react'

import type { SignalRuntimeProperties } from '../types/runtime'
import type { SignalCameraSceneData } from '../lib/signalCameraScene'
import type { Coordinate } from '../types/offline'

type SignalCameraModalProps = {
  signal: {
    signalId: number
    kind: string
    signalState: SignalRuntimeProperties['signalState']
    optimized: boolean
    cycleSeconds: number
    greenRatio: number
    demandScore: number
  }
  scene: SignalCameraSceneData
  onClose: () => void
}

type RoadProjection = {
  allCoordinates: Coordinate[]
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
}

function signalColor(signalState: SignalRuntimeProperties['signalState']) {
  if (signalState === 'go') return '#22c55e'
  if (signalState === 'hold') return '#f59e0b'
  return '#ef4444'
}

function buildProjection(scene: SignalCameraSceneData): RoadProjection {
  const allCoordinates = [
    scene.center,
    ...scene.roads.flatMap((road) => road.coordinates),
    ...scene.vehicles.flatMap((vehicle) => vehicle.coordinates),
  ]

  const lngValues = allCoordinates.map((coordinate) => coordinate[0])
  const latValues = allCoordinates.map((coordinate) => coordinate[1])

  return {
    allCoordinates,
    minLng: Math.min(...lngValues),
    maxLng: Math.max(...lngValues),
    minLat: Math.min(...latValues),
    maxLat: Math.max(...latValues),
  }
}

function projectCoordinate(projection: RoadProjection, coordinate: Coordinate) {
  const centerLng = (projection.minLng + projection.maxLng) * 0.5
  const centerLat = (projection.minLat + projection.maxLat) * 0.5
  const lngScale = Math.cos((centerLat * Math.PI) / 180) * 111_320
  const latScale = 111_320

  return new THREE.Vector3(
    (coordinate[0] - centerLng) * lngScale * 0.06,
    0,
    -(coordinate[1] - centerLat) * latScale * 0.06,
  )
}

function buildCatmullPath(points: THREE.Vector3[]) {
  if (points.length < 2) {
    return null
  }

  return new THREE.CatmullRomCurve3(points)
}

export function SignalCameraModal({ signal, scene, onClose }: SignalCameraModalProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const signalRef = useRef(signal)
  const sceneRef = useRef(scene)
  const [fps, setFps] = useState(0)

  useEffect(() => {
    signalRef.current = signal
  }, [signal])

  useEffect(() => {
    sceneRef.current = scene
  }, [scene])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) {
      return
    }

    const scene3d = new THREE.Scene()
    scene3d.background = new THREE.Color('#f2f6fb')

    const camera = new THREE.PerspectiveCamera(46, mount.clientWidth / 360, 0.1, 160)
    camera.position.set(0, 15, 18)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, 360)
    mount.appendChild(renderer.domElement)

    scene3d.add(new THREE.AmbientLight('#ffffff', 1.2))
    const directionalLight = new THREE.DirectionalLight('#ffffff', 1.55)
    directionalLight.position.set(16, 24, 12)
    scene3d.add(directionalLight)

    const liveScene = sceneRef.current
    const projection = buildProjection(liveScene)
    const roadMaterialMain = new THREE.MeshStandardMaterial({ color: '#4f5c6f', roughness: 0.94 })
    const roadMaterialSub = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.95 })
    const laneMaterial = new THREE.LineBasicMaterial({ color: '#dfe7ef' })

    liveScene.roads.forEach((road) => {
      const points = road.coordinates.map((coordinate) => projectCoordinate(projection, coordinate))
      const path = buildCatmullPath(points)
      if (!path) {
        return
      }

      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(path, Math.max(points.length * 3, 18), road.roadClass === 'main' ? 0.85 : 0.52, 8, false),
        road.roadClass === 'main' ? roadMaterialMain : roadMaterialSub,
      )
      tube.position.y = 0.02
      scene3d.add(tube)

      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points.map((point) => point.clone().setY(0.12))),
        laneMaterial,
      )
      scene3d.add(line)
    })

    const signalMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 2.4, 18),
      new THREE.MeshStandardMaterial({ color: '#374151' }),
    )
    signalMarker.position.set(0, 1.2, 0)
    scene3d.add(signalMarker)

    const signalHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 1.08, 0.38),
      new THREE.MeshStandardMaterial({ color: '#111827' }),
    )
    signalHead.position.set(0, 2.28, 0)
    scene3d.add(signalHead)

    const bulbs = [
      { key: 'stop', mesh: new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 16), new THREE.MeshStandardMaterial({ color: '#1f2937' })) },
      { key: 'hold', mesh: new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 16), new THREE.MeshStandardMaterial({ color: '#1f2937' })) },
      { key: 'go', mesh: new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 16), new THREE.MeshStandardMaterial({ color: '#1f2937' })) },
    ] as const

    bulbs[0].mesh.position.set(0, 2.55, 0.2)
    bulbs[1].mesh.position.set(0, 2.28, 0.2)
    bulbs[2].mesh.position.set(0, 2.01, 0.2)
    bulbs.forEach(({ mesh }) => scene3d.add(mesh))

    const carPalette = ['#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#14b8a6']
    const vehicleMeshes = liveScene.vehicles.map((vehicle, index) => {
      const points = vehicle.coordinates.map((coordinate) => projectCoordinate(projection, coordinate))
      const path = buildCatmullPath(points)
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.34, 1.18),
        new THREE.MeshStandardMaterial({ color: carPalette[index % carPalette.length] }),
      )

      scene3d.add(mesh)

      return {
        vehicle,
        path,
        mesh,
        pathLength: Math.max(1, points.length - 1),
      }
    })

    let frameId = 0
    let lastTimestamp = performance.now()
    let fpsCounter = 0
    let fpsStartedAt = lastTimestamp

    const tick = (timestamp: number) => {
      lastTimestamp = timestamp
      const liveSignal = signalRef.current
      const liveSceneData = sceneRef.current

      bulbs.forEach(({ key, mesh }) => {
        const material = mesh.material as THREE.MeshStandardMaterial
        const active = liveSignal.signalState === key
        const color = key === 'go' ? '#22c55e' : key === 'hold' ? '#f59e0b' : '#ef4444'
        material.color.set(active ? color : '#1f2937')
        material.emissive.set(active ? color : '#000000')
        material.emissiveIntensity = active ? 1.12 : 0
      })

      vehicleMeshes.forEach((entry) => {
        const liveVehicle = liveSceneData.vehicles.find((item) => item.id === entry.vehicle.id) ?? entry.vehicle
        if (!entry.path) {
          entry.mesh.visible = false
          return
        }

        entry.mesh.visible = true
        const moveFactor = Math.max(0.04, liveVehicle.speedKph / 90)
        const timeFactor = (timestamp / 1000) * moveFactor * 0.07
        const progress = (timeFactor % 1 + 1) % 1
        const point = entry.path.getPointAt(progress)
        const nextPoint = entry.path.getPointAt(Math.min(0.999, progress + 0.01))
        entry.mesh.position.copy(point).setY(0.35)
        entry.mesh.lookAt(nextPoint.x, 0.35, nextPoint.z)
      })

      renderer.render(scene3d, camera)

      fpsCounter += 1
      if (timestamp - fpsStartedAt >= 500) {
        setFps(Math.round((fpsCounter * 1000) / (timestamp - fpsStartedAt)))
        fpsCounter = 0
        fpsStartedAt = timestamp
      }

      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)

    const handleResize = () => {
      if (!mountRef.current) {
        return
      }
      camera.aspect = mountRef.current.clientWidth / 360
      camera.updateProjectionMatrix()
      renderer.setSize(mountRef.current.clientWidth, 360)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      scene3d.traverse((object: THREE.Object3D) => {
        const mesh = object as THREE.Mesh
        if (mesh.geometry) {
          mesh.geometry.dispose()
        }
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material: THREE.Material) => material.dispose())
        } else if (mesh.material) {
          mesh.material.dispose()
        }
      })
    }
  }, [signal.signalId])

  return (
    <div className="modal-backdrop signal-camera-backdrop">
      <div className="signal-camera-modal">
        <div className="signal-camera-header">
          <div>
            <p className="eyebrow">CCTV Simulation</p>
            <h2>Traffic Light {signal.signalId}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close camera popup">
            <X className="mini-lucide" />
          </button>
        </div>

        <div className="signal-camera-status">
          <span className="signal-pill" style={{ background: signalColor(signal.signalState) }}>
            {signal.signalState.toUpperCase()}
          </span>
          <span>{signal.optimized ? 'Adaptive junction' : 'Static junction'}</span>
        </div>

        <div ref={mountRef} className="signal-camera-canvas" />

        <div className="signal-camera-grid">
          <div className="camera-stat">
            <Camera className="mini-lucide" />
            <span>Road vectors</span>
            <strong>{scene.roads.length}</strong>
          </div>
          <div className="camera-stat">
            <Gauge className="mini-lucide" />
            <span>Nearby vehicles</span>
            <strong>{scene.vehicles.length}</strong>
          </div>
          <div className="camera-stat">
            <Radar className="mini-lucide" />
            <span>Demand score</span>
            <strong>{signal.demandScore.toFixed(2)}</strong>
          </div>
          <div className="camera-stat">
            <TimerReset className="mini-lucide" />
            <span>Cycle / green</span>
            <strong>{signal.cycleSeconds.toFixed(0)}s / {(signal.greenRatio * 100).toFixed(0)}%</strong>
          </div>
          <div className="camera-stat">
            <Gauge className="mini-lucide" />
            <span>FPS</span>
            <strong>{fps}</strong>
          </div>
        </div>
      </div>
    </div>
  )
}
