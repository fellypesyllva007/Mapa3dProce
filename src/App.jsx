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
  roof: '#313746',
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '')
  const number = Number.parseInt(normalized, 16)
  return [
    ((number >> 16) & 255) / 255,
    ((number >> 8) & 255) / 255,
    (number & 255) / 255,
  ]
}

function shade(hex, amount) {
  const color = hex.replace('#', '')
  const number = Number.parseInt(color, 16)
  const r = clamp(((number >> 16) & 255) + amount, 0, 255)
  const g = clamp(((number >> 8) & 255) + amount, 0, 255)
  const b = clamp((number & 255) + amount, 0, 255)
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'Erro ao compilar shader WebGL')
  }

  return shader
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram()
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vertexSource))
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragmentSource))
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Erro ao criar programa WebGL')
  }

  return program
}

function addVertex(vertices, point, color) {
  const [r, g, b] = hexToRgb(color)
  vertices.push(point[0], point[1], r, g, b)
}

function addTriangle(vertices, a, b, c, color) {
  addVertex(vertices, a, color)
  addVertex(vertices, b, color)
  addVertex(vertices, c, color)
}

function addQuad(vertices, a, b, c, d, color) {
  addTriangle(vertices, a, b, c, color)
  addTriangle(vertices, a, c, d, color)
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
  const originY = height * 0.19

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

function addPrism(vertices, project, x, z, width, depth, base, height, color) {
  const x0 = x - width / 2
  const x1 = x + width / 2
  const z0 = z - depth / 2
  const z1 = z + depth / 2

  const topA = project(x0, z0, base + height)
  const topB = project(x1, z0, base + height)
  const topC = project(x1, z1, base + height)
  const topD = project(x0, z1, base + height)

  const bottomB = project(x1, z0, base)
  const bottomC = project(x1, z1, base)
  const bottomD = project(x0, z1, base)

  addQuad(vertices, topB, topC, bottomC, bottomB, shade(color, -46))
  addQuad(vertices, topC, topD, bottomD, bottomC, shade(color, -64))
  addQuad(vertices, topA, topB, topC, topD, color)
}

function addPyramid(vertices, project, x, z, width, depth, base, height, color) {
  const x0 = x - width / 2
  const x1 = x + width / 2
  const z0 = z - depth / 2
  const z1 = z + depth / 2

  const a = project(x0, z0, base)
  const b = project(x1, z0, base)
  const c = project(x1, z1, base)
  const d = project(x0, z1, base)
  const top = project(x, z, base + height)

  addTriangle(vertices, a, top, b, shade(color, 18))
  addTriangle(vertices, b, top, c, color)
  addTriangle(vertices, c, top, d, shade(color, -38))
  addTriangle(vertices, d, top, a, shade(color, -18))
}

function addTile(vertices, project, tile, time, routeCells) {
  const { x, z, type } = tile
  const isRoute = routeCells.has(`${x}:${z}`)
  const wave = type === 'water' ? Math.sin(time * 2 + x * 0.8 + z) * 0.035 : 0
  const height = heightForTile(type, x, z) + wave
  const color = isRoute ? COLORS.road : colorForTile(type)

  addPrism(vertices, project, x + 0.5, z + 0.5, 0.96, 0.96, 0, height, color)

  if (isRoute) {
    addPrism(vertices, project, x + 0.5, z + 0.5, 0.44, 0.44, height + 0.01, 0.08, COLORS.gold)
  }

  if (type === 'water') {
    addPrism(vertices, project, x + 0.5, z + 0.5, 0.24, 0.24, height + 0.06, 0.018, shade(COLORS.water, 55))
  }
}

function addForest(vertices, project, x, z) {
  const base = heightForTile('forest', x, z) + 0.02
  addPrism(vertices, project, x + 0.5, z + 0.5, 0.18, 0.18, base, 0.52, COLORS.trunk)
  addPyramid(vertices, project, x + 0.5, z + 0.5, 0.72, 0.72, base + 0.42, 0.88, '#176b2c')
}

function addRock(vertices, project, x, z) {
  const base = heightForTile('rock', x, z) + 0.02
  addPyramid(vertices, project, x + 0.5, z + 0.5, 0.72, 0.72, base, 0.74, '#7a7f8c')
}

function addNode(vertices, project, node) {
  const base = heightForTile('node', node.x, node.z) + 0.04
  const x = node.x + 0.5
  const z = node.z + 0.5
  const roofColor = node.kind === 'danger' ? COLORS.danger : COLORS.roof

  addPrism(vertices, project, x, z, 0.52, 0.52, base, 0.78, '#d49a39')
  addPyramid(vertices, project, x, z, 0.86, 0.86, base + 0.72, 0.72, roofColor)
  addPrism(vertices, project, x, z, 0.16, 0.16, base + 1.52, 0.22, COLORS.gold)
}

function createScene(width, height, time) {
  const project = createProjector(width, height, time)
  const routeCells = createRouteCells()
  const tiles = []
  const vertices = []

  for (let z = 0; z < MAP_SIZE; z += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      tiles.push({ x, z, type: tileType(x, z), order: x + z })
    }
  }

  tiles.sort((a, b) => a.order - b.order || a.x - b.x)
  tiles.forEach((tile) => addTile(vertices, project, tile, time, routeCells))

  tiles.forEach((tile) => {
    if (tile.type === 'forest') addForest(vertices, project, tile.x, tile.z)
    if (tile.type === 'rock' && (tile.x + tile.z) % 3 === 0) addRock(vertices, project, tile.x, tile.z)
  })

  ROUTE_NODES
    .slice()
    .sort((a, b) => a.x + a.z - (b.x + b.z))
    .forEach((node) => addNode(vertices, project, node))

  return new Float32Array(vertices)
}

function setupRenderer(canvas, setStatus) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl')

  if (!gl) {
    setStatus('WebGL indisponível neste navegador.')
    return () => {}
  }

  const vertexSource = `
    attribute vec2 aPosition;
    attribute vec3 aColor;

    uniform vec2 uResolution;

    varying vec3 vColor;

    void main() {
      vec2 zeroToOne = aPosition / uResolution;
      vec2 zeroToTwo = zeroToOne * 2.0;
      vec2 clipSpace = zeroToTwo - 1.0;

      gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
      vColor = aColor;
    }
  `

  const fragmentSource = `
    precision mediump float;

    varying vec3 vColor;

    void main() {
      gl_FragColor = vec4(vColor, 1.0);
    }
  `

  let program
  try {
    program = createProgram(gl, vertexSource, fragmentSource)
  } catch (error) {
    setStatus(error.message)
    return () => {}
  }

  const buffer = gl.createBuffer()
  const positionLocation = gl.getAttribLocation(program, 'aPosition')
  const colorLocation = gl.getAttribLocation(program, 'aColor')
  const resolutionLocation = gl.getUniformLocation(program, 'uResolution')
  const stride = 5 * Float32Array.BYTES_PER_ELEMENT

  let animationFrame = 0
  let disposed = false
  let lastVertexCount = 0

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio))
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio))

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    return { width, height, ratio }
  }

  function render(timeStamp) {
    if (disposed) return

    const { width, height, ratio } = resize()
    const cssWidth = width / ratio
    const cssHeight = height / ratio
    const time = timeStamp * 0.001
    const scene = createScene(cssWidth, cssHeight, time)
    const vertexCount = scene.length / 5

    gl.viewport(0, 0, width, height)
    gl.clearColor(0.03, 0.055, 0.09, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.useProgram(program)

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, scene, gl.DYNAMIC_DRAW)

    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0)

    gl.enableVertexAttribArray(colorLocation)
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT)

    gl.uniform2f(resolutionLocation, cssWidth, cssHeight)
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount)

    if (lastVertexCount !== vertexCount) {
      lastVertexCount = vertexCount
      setStatus(`WebGL procedural ativo: ${MAP_SIZE * MAP_SIZE} tiles, ${ROUTE_NODES.length} nós, ${vertexCount} vértices`)
    }

    animationFrame = requestAnimationFrame(render)
  }

  animationFrame = requestAnimationFrame(render)

  return () => {
    disposed = true
    cancelAnimationFrame(animationFrame)
    gl.deleteBuffer(buffer)
    gl.deleteProgram(program)
  }
}

export default function App() {
  const canvasRef = useRef(null)
  const [status, setStatus] = useState('Inicializando mapa WebGL procedural...')

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
      setStatus(error.message || 'Erro ao iniciar o mapa WebGL.')
      return undefined
    }
  }, [])

  return (
    <main className="app-shell">
      <section className="map-panel" aria-label="Mapa 3D procedural de RPG em WebGL">
        <canvas ref={canvasRef} className="map-canvas" />
        <div className="scanline" />
      </section>

      <aside className="hud-panel">
        <p className="eyebrow">RPG procedural</p>
        <h1>Mapa 3D WebGL gerado por código</h1>
        <p className="description">
          Mundo procedural em HTML5 Canvas com WebGL, tiles, rotas, nós de decisão,
          água animada e construções geométricas. Não usa GIF, SVG, imagens,
          texturas, GLB ou GLTF.
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
