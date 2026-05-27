import { useEffect, useMemo, useRef, useState } from 'react'

const MAP_SIZE = 15

const ROUTE_NODES = [
  { id: 'vila', label: 'Vila', x: 2, z: 11, kind: 'safe' },
  { id: 'bosque', label: 'Bosque', x: 5, z: 8, kind: 'wild' },
  { id: 'ponte', label: 'Ponte', x: 7, z: 6, kind: 'route' },
  { id: 'torre', label: 'Torre', x: 11, z: 4, kind: 'quest' },
  { id: 'cripta', label: 'Cripta', x: 12, z: 11, kind: 'danger' },
]

const ROUTES = [
  ['vila', 'bosque'],
  ['bosque', 'ponte'],
  ['ponte', 'torre'],
  ['ponte', 'cripta'],
]

const COLORS = {
  grass: '#3c8c42',
  road: '#8b643d',
  rock: '#676d78',
  water: '#1f72b8',
  forest: '#236e34',
  node: '#d5a13a',
  gold: '#ffd166',
  danger: '#a82d34',
  trunk: '#79502b',
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function shade(hex, amount) {
  const color = hex.replace('#', '')
  const number = Number.parseInt(color, 16)
  const r = clamp(((number >> 16) & 255) + amount, 0, 255)
  const g = clamp(((number >> 8) & 255) + amount, 0, 255)
  const b = clamp((number & 255) + amount, 0, 255)
  return `rgb(${r}, ${g}, ${b})`
}

function drawPolygon(ctx, points, fill, stroke = 'rgba(255,255,255,0.06)') {
  ctx.beginPath()
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1
  ctx.stroke()
}

function buildRoutePath(a, b) {
  const points = []
  let x = a.x
  let z = a.z
  points.push([x, z])

  while (x !== b.x) {
    x += Math.sign(b.x - x)
    points.push([x, z])
  }

  while (z !== b.z) {
    z += Math.sign(b.z - z)
    points.push([x, z])
  }

  return points
}

function createRouteCells() {
  const cells = new Set()

  ROUTES.forEach(([from, to]) => {
    const a = ROUTE_NODES.find((node) => node.id === from)
    const b = ROUTE_NODES.find((node) => node.id === to)
    buildRoutePath(a, b).forEach(([x, z]) => cells.add(`${x}:${z}`))
  })

  return cells
}

function tileType(x, z) {
  const node = ROUTE_NODES.find((item) => item.x === x && item.z === z)
  if (node) return 'node'

  if ((x > 9 && z > 8) || (x < 3 && z < 4)) return 'rock'
  if ((x === 4 && z > 3 && z < 12) || (z === 6 && x > 5 && x < 10)) return 'water'
  if ((x + z) % 7 === 0) return 'forest'
  return 'grass'
}

function heightForTile(type, x, z) {
  if (type === 'rock') return 0.55 + ((x * 11 + z * 7) % 3) * 0.16
  if (type === 'water') return 0.08
  if (type === 'node') return 0.3
  if (type === 'forest') return 0.26
  return 0.2 + Math.sin(x * 0.8 + z * 0.35) * 0.035
}

function colorForTile(type) {
  if (type === 'rock') return COLORS.rock
  if (type === 'water') return COLORS.water
  if (type === 'forest') return COLORS.forest
  if (type === 'node') return COLORS.node
  return COLORS.grass
}

function createProjector(width, height, time) {
  const tileWidth = clamp(Math.min(width / (MAP_SIZE * 1.15), height / (MAP_SIZE * 0.62)), 22, 54)
  const tileHeight = tileWidth * 0.52
  const heightScale = tileWidth * 0.72
  const center = MAP_SIZE / 2
  const yaw = Math.sin(time * 0.18) * 0.08
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const originX = width / 2
  const originY = height * 0.18

  return function project(x, z, y = 0) {
    const dx = x - center
    const dz = z - center
    const rx = dx * cos - dz * sin
    const rz = dx * sin + dz * cos

    return [
      originX + (rx - rz) * (tileWidth / 2),
      originY + (rx + rz) * (tileHeight / 2) - y * heightScale,
    ]
  }
}

function drawPrism(ctx, project, x, z, width, depth, base, height, color) {
  const x0 = x - width / 2
  const x1 = x + width / 2
  const z0 = z - depth / 2
  const z1 = z + depth / 2

  const top = [
    project(x0, z0, base + height),
    project(x1, z0, base + height),
    project(x1, z1, base + height),
    project(x0, z1, base + height),
  ]

  const bottom = [
    project(x0, z0, base),
    project(x1, z0, base),
    project(x1, z1, base),
    project(x0, z1, base),
  ]

  drawPolygon(ctx, [top[1], top[2], bottom[2], bottom[1]], shade(color, -46))
  drawPolygon(ctx, [top[2], top[3], bottom[3], bottom[2]], shade(color, -64))
  drawPolygon(ctx, top, color)
}

function drawTile(ctx, project, tile, time, routeCells) {
  const { x, z, type } = tile
  const isRoute = routeCells.has(`${x}:${z}`)
  const wave = type === 'water' ? Math.sin(time * 2 + x * 0.8 + z) * 0.035 : 0
  const height = heightForTile(type, x, z) + wave
  const color = isRoute ? COLORS.road : colorForTile(type)

  drawPrism(ctx, project, x + 0.5, z + 0.5, 0.96, 0.96, 0, height, color)

  if (isRoute) {
    drawPrism(ctx, project, x + 0.5, z + 0.5, 0.42, 0.42, height + 0.01, 0.08, COLORS.gold)
  }

  if (type === 'water') {
    const p = project(x + 0.5, z + 0.5, height + 0.04)
    ctx.beginPath()
    ctx.arc(p[0], p[1], 2.2 + Math.sin(time * 3 + x) * 0.9, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(187, 225, 255, 0.42)'
    ctx.fill()
  }
}

function drawPyramid(ctx, project, x, z, width, depth, base, height, color) {
  const x0 = x - width / 2
  const x1 = x + width / 2
  const z0 = z - depth / 2
  const z1 = z + depth / 2
  const a = project(x0, z0, base)
  const b = project(x1, z0, base)
  const c = project(x1, z1, base)
  const d = project(x0, z1, base)
  const top = project(x, z, base + height)

  drawPolygon(ctx, [a, top, b], shade(color, 18))
  drawPolygon(ctx, [b, top, c], color)
  drawPolygon(ctx, [c, top, d], shade(color, -38))
  drawPolygon(ctx, [d, top, a], shade(color, -18))
}

function drawForest(ctx, project, x, z) {
  const base = heightForTile('forest', x, z) + 0.02
  drawPrism(ctx, project, x + 0.5, z + 0.5, 0.18, 0.18, base, 0.52, COLORS.trunk)
  drawPyramid(ctx, project, x + 0.5, z + 0.5, 0.72, 0.72, base + 0.42, 0.88, '#176b2c')
}

function drawRock(ctx, project, x, z) {
  const base = heightForTile('rock', x, z) + 0.02
  drawPyramid(ctx, project, x + 0.5, z + 0.5, 0.72, 0.72, base, 0.74, '#7a7f8c')
}

function drawNode(ctx, project, node) {
  const base = heightForTile('node', node.x, node.z) + 0.04
  const x = node.x + 0.5
  const z = node.z + 0.5
  const roofColor = node.kind === 'danger' ? COLORS.danger : '#313746'

  drawPrism(ctx, project, x, z, 0.52, 0.52, base, 0.78, '#d49a39')
  drawPyramid(ctx, project, x, z, 0.86, 0.86, base + 0.72, 0.72, roofColor)

  const label = project(x, z, base + 1.65)
  ctx.save()
  ctx.font = '700 12px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(3, 5, 10, 0.9)'
  ctx.strokeText(node.label, label[0], label[1])
  ctx.fillStyle = '#f6e6b2'
  ctx.fillText(node.label, label[0], label[1])
  ctx.restore()
}

function drawRouteLines(ctx, project) {
  ctx.save()
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowBlur = 14
  ctx.shadowColor = 'rgba(255, 209, 102, 0.55)'
  ctx.strokeStyle = 'rgba(255, 209, 102, 0.78)'

  ROUTES.forEach(([from, to]) => {
    const a = ROUTE_NODES.find((node) => node.id === from)
    const b = ROUTE_NODES.find((node) => node.id === to)
    const path = buildRoutePath(a, b)

    ctx.beginPath()
    path.forEach(([x, z], index) => {
      const point = project(x + 0.5, z + 0.5, 0.54)
      if (index === 0) ctx.moveTo(point[0], point[1])
      else ctx.lineTo(point[0], point[1])
    })
    ctx.stroke()
  })

  ctx.restore()
}

function setupRenderer(canvas, setStatus) {
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    setStatus('Canvas 2D indisponível neste navegador.')
    return () => {}
  }

  const routeCells = createRouteCells()
  const tiles = []

  for (let z = 0; z < MAP_SIZE; z += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      tiles.push({ x, z, type: tileType(x, z), order: x + z })
    }
  }

  tiles.sort((a, b) => a.order - b.order || a.x - b.x)

  let animationFrame = 0
  let disposed = false

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio))
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio))

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    return { width: width / ratio, height: height / ratio }
  }

  function draw(timeStamp) {
    if (disposed) return

    const time = timeStamp * 0.001
    const { width, height } = resize()
    const project = createProjector(width, height, time)

    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, '#08111f')
    gradient.addColorStop(1, '#02050a')
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)

    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 12

    tiles.forEach((tile) => drawTile(ctx, project, tile, time, routeCells))
    drawRouteLines(ctx, project)

    tiles.forEach((tile) => {
      if (tile.type === 'forest') drawForest(ctx, project, tile.x, tile.z)
      if (tile.type === 'rock' && (tile.x + tile.z) % 3 === 0) drawRock(ctx, project, tile.x, tile.z)
    })

    ROUTE_NODES
      .slice()
      .sort((a, b) => a.x + a.z - (b.x + b.z))
      .forEach((node) => drawNode(ctx, project, node))

    ctx.restore()

    animationFrame = requestAnimationFrame(draw)
  }

  setStatus(`Canvas procedural ativo: ${tiles.length} tiles, ${ROUTE_NODES.length} nós`)
  animationFrame = requestAnimationFrame(draw)

  return () => {
    disposed = true
    cancelAnimationFrame(animationFrame)
  }
}

export default function App() {
  const canvasRef = useRef(null)
  const [status, setStatus] = useState('Inicializando mapa procedural...')

  const routeLabels = useMemo(() => ROUTES.map(([from, to]) => {
    const a = ROUTE_NODES.find((node) => node.id === from)
    const b = ROUTE_NODES.find((node) => node.id === to)
    return `${a.label} → ${b.label}`
  }), [])

  useEffect(() => {
    if (!canvasRef.current) return undefined

    try {
      return setupRenderer(canvasRef.current, setStatus)
    } catch (error) {
      setStatus(error.message || 'Erro ao iniciar o mapa procedural.')
      return undefined
    }
  }, [])

  return (
    <main className="app-shell">
      <section className="map-panel" aria-label="Mapa 3D procedural de RPG">
        <canvas ref={canvasRef} className="map-canvas" />
        <div className="scanline" />
      </section>

      <aside className="hud-panel">
        <p className="eyebrow">RPG procedural</p>
        <h1>Mapa 3D gerado por código</h1>
        <p className="description">
          Mundo procedural em HTML5 Canvas com tiles, rotas, nós de decisão, água animada e
          construções geométricas. Não usa GIF, SVG, imagens, texturas, GLB ou GLTF.
        </p>

        <div className="status-card">
          <span>Status</span>
          <strong>{status}</strong>
        </div>

        <div className="route-card">
          <h2>Rotas narrativas</h2>
          <ul>
            {routeLabels.map((label) => <li key={label}>{label}</li>)}
          </ul>
        </div>

        <div className="legend-grid">
          <span><i className="grass" />Campo</span>
          <span><i className="road" />Rota</span>
          <span><i className="water" />Rio</span>
          <span><i className="danger" />Perigo</span>
        </div>
      </aside>
    </main>
  )
}
