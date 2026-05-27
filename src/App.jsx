import { useEffect, useRef, useState } from 'react'

const TILE_SIZE = 1
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

function createShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader))
  }

  return shader
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram()
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vertexSource))
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragmentSource))
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program))
  }

  return program
}

function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}

function multiply(a, b) {
  const out = new Array(16).fill(0)

  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      for (let i = 0; i < 4; i += 1) {
        out[row * 4 + col] += a[row * 4 + i] * b[i * 4 + col]
      }
    }
  }

  return out
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2)
  const range = 1 / (near - far)

  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * range, -1,
    0, 0, near * far * range * 2, 0,
  ]
}

function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function lookAt(eye, target, up) {
  const z = normalize(subtract(eye, target))
  const x = normalize(cross(up, z))
  const y = cross(z, x)

  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]
}

function addFace(vertices, color, a, b, c, d, normal) {
  const points = [a, b, c, a, c, d]

  points.forEach((point) => {
    vertices.push(...point, ...color, ...normal)
  })
}

function addBox(vertices, x, y, z, w, h, d, color) {
  const x0 = x - w / 2
  const x1 = x + w / 2
  const y0 = y
  const y1 = y + h
  const z0 = z - d / 2
  const z1 = z + d / 2

  addFace(vertices, color, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0])
  addFace(vertices, color, [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0])
  addFace(vertices, color, [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [0, 0, 1])
  addFace(vertices, color, [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [0, 0, -1])
  addFace(vertices, color, [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [1, 0, 0])
  addFace(vertices, color, [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0])
}

function addPyramid(vertices, x, y, z, w, h, d, color) {
  const x0 = x - w / 2
  const x1 = x + w / 2
  const z0 = z - d / 2
  const z1 = z + d / 2
  const top = [x, y + h, z]
  const baseA = [x0, y, z0]
  const baseB = [x1, y, z0]
  const baseC = [x1, y, z1]
  const baseD = [x0, y, z1]

  addFace(vertices, color, baseA, baseB, baseC, baseD, [0, -1, 0])
  addFace(vertices, color, baseA, top, baseB, baseB, [0, 0.65, -0.75])
  addFace(vertices, color, baseB, top, baseC, baseC, [0.75, 0.65, 0])
  addFace(vertices, color, baseC, top, baseD, baseD, [0, 0.65, 0.75])
  addFace(vertices, color, baseD, top, baseA, baseA, [-0.75, 0.65, 0])
}

function tileType(x, z) {
  const node = ROUTE_NODES.find((item) => item.x === x && item.z === z)
  if (node) return 'node'

  if ((x === 7 && z > 4 && z < 12) || (z === 8 && x > 2 && x < 8)) return 'road'
  if ((x > 9 && z > 8) || (x < 3 && z < 4)) return 'rock'
  if ((x === 4 && z > 3 && z < 12) || (z === 6 && x > 5 && x < 10)) return 'water'
  if ((x + z) % 7 === 0) return 'forest'
  return 'grass'
}

function heightForTile(type, x, z) {
  if (type === 'rock') return 0.35 + ((x * 11 + z * 7) % 3) * 0.18
  if (type === 'water') return 0.04
  if (type === 'node') return 0.16
  return 0.12 + Math.sin(x * 0.8 + z * 0.35) * 0.025
}

function colorForTile(type) {
  if (type === 'road') return [0.47, 0.34, 0.22]
  if (type === 'rock') return [0.36, 0.38, 0.43]
  if (type === 'water') return [0.1, 0.32, 0.55]
  if (type === 'forest') return [0.1, 0.34, 0.16]
  if (type === 'node') return [0.77, 0.55, 0.2]
  return [0.22, 0.48, 0.24]
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

function generateScene() {
  const vertices = []
  const center = (MAP_SIZE - 1) / 2

  for (let z = 0; z < MAP_SIZE; z += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      const type = tileType(x, z)
      const wx = (x - center) * TILE_SIZE
      const wz = (z - center) * TILE_SIZE
      const h = heightForTile(type, x, z)
      const color = colorForTile(type)
      addBox(vertices, wx, -0.08, wz, 0.94, h, 0.94, color)

      if (type === 'forest') {
        addBox(vertices, wx, h - 0.08, wz, 0.16, 0.42, 0.16, [0.32, 0.19, 0.09])
        addPyramid(vertices, wx, h + 0.22, wz, 0.56, 0.72, 0.56, [0.05, 0.27, 0.1])
      }

      if (type === 'rock' && (x + z) % 3 === 0) {
        addPyramid(vertices, wx, h - 0.08, wz, 0.72, 0.8, 0.72, [0.28, 0.29, 0.34])
      }
    }
  }

  ROUTES.forEach(([from, to]) => {
    const a = ROUTE_NODES.find((node) => node.id === from)
    const b = ROUTE_NODES.find((node) => node.id === to)

    buildRoutePath(a, b).forEach(([x, z]) => {
      const wx = (x - center) * TILE_SIZE
      const wz = (z - center) * TILE_SIZE
      addBox(vertices, wx, 0.09, wz, 0.38, 0.055, 0.38, [0.95, 0.76, 0.28])
    })
  })

  ROUTE_NODES.forEach((node) => {
    const wx = (node.x - center) * TILE_SIZE
    const wz = (node.z - center) * TILE_SIZE
    addBox(vertices, wx, 0.11, wz, 0.42, 0.55, 0.42, [0.82, 0.62, 0.26])
    addPyramid(vertices, wx, 0.66, wz, 0.78, 0.58, 0.78, node.kind === 'danger' ? [0.55, 0.1, 0.14] : [0.2, 0.2, 0.24])
  })

  return new Float32Array(vertices)
}

function setupRenderer(canvas, setStatus) {
  const gl = canvas.getContext('webgl', { antialias: true })

  if (!gl) {
    setStatus('WebGL indisponível neste navegador.')
    return () => {}
  }

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aColor;
    attribute vec3 aNormal;

    uniform mat4 uMatrix;
    uniform float uTime;

    varying vec3 vColor;
    varying float vLight;

    void main() {
      vec3 position = aPosition;
      if (aColor.b > aColor.r && aColor.b > aColor.g) {
        position.y += sin(uTime * 1.7 + aPosition.x * 2.2 + aPosition.z) * 0.025;
      }

      vec3 lightDirection = normalize(vec3(0.45, 0.9, 0.35));
      vLight = max(dot(normalize(aNormal), lightDirection), 0.0) * 0.68 + 0.32;
      vColor = aColor;
      gl_Position = uMatrix * vec4(position, 1.0);
    }
  `

  const fragmentSource = `
    precision mediump float;

    varying vec3 vColor;
    varying float vLight;

    void main() {
      gl_FragColor = vec4(vColor * vLight, 1.0);
    }
  `

  const program = createProgram(gl, vertexSource, fragmentSource)
  const stride = 9 * Float32Array.BYTES_PER_ELEMENT
  const scene = generateScene()
  const buffer = gl.createBuffer()

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, scene, gl.STATIC_DRAW)

  const positionLocation = gl.getAttribLocation(program, 'aPosition')
  const colorLocation = gl.getAttribLocation(program, 'aColor')
  const normalLocation = gl.getAttribLocation(program, 'aNormal')
  const matrixLocation = gl.getUniformLocation(program, 'uMatrix')
  const timeLocation = gl.getUniformLocation(program, 'uTime')

  let animationFrame = 0
  let cameraAngle = -0.75
  let cameraDistance = 18

  function resize() {
    const displayWidth = canvas.clientWidth * window.devicePixelRatio
    const displayHeight = canvas.clientHeight * window.devicePixelRatio

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth
      canvas.height = displayHeight
    }
  }

  function render(time) {
    resize()

    const seconds = time * 0.001
    cameraAngle += 0.00045

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0.03, 0.045, 0.07, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)

    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, stride, 0)

    gl.enableVertexAttribArray(colorLocation)
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT)

    gl.enableVertexAttribArray(normalLocation)
    gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT)

    const aspect = canvas.width / canvas.height
    const projection = perspective(Math.PI / 4, aspect, 0.1, 100)
    const eye = [Math.sin(cameraAngle) * cameraDistance, 12, Math.cos(cameraAngle) * cameraDistance]
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0])
    const matrix = multiply(projection, view)

    gl.uniformMatrix4fv(matrixLocation, false, new Float32Array(matrix))
    gl.uniform1f(timeLocation, seconds)
    gl.drawArrays(gl.TRIANGLES, 0, scene.length / 9)

    animationFrame = requestAnimationFrame(render)
  }

  function handleWheel(event) {
    event.preventDefault()
    cameraDistance = Math.min(26, Math.max(10, cameraDistance + event.deltaY * 0.01))
  }

  canvas.addEventListener('wheel', handleWheel, { passive: false })
  animationFrame = requestAnimationFrame(render)
  setStatus('Mapa procedural WebGL ativo')

  return () => {
    cancelAnimationFrame(animationFrame)
    canvas.removeEventListener('wheel', handleWheel)
    gl.deleteBuffer(buffer)
    gl.deleteProgram(program)
  }
}

export default function App() {
  const canvasRef = useRef(null)
  const [status, setStatus] = useState('Inicializando mapa procedural...')

  useEffect(() => {
    if (!canvasRef.current) return undefined
    return setupRenderer(canvasRef.current, setStatus)
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
          Mundo em Canvas/WebGL com tiles, rotas, nós de decisão, água animada e
          construções geométricas. Não usa GIF, SVG, imagens, texturas, GLB ou GLTF.
        </p>

        <div className="status-card">
          <span>Status</span>
          <strong>{status}</strong>
        </div>

        <div className="route-card">
          <h2>Rotas narrativas</h2>
          <ul>
            {ROUTES.map(([from, to]) => {
              const a = ROUTE_NODES.find((node) => node.id === from)
              const b = ROUTE_NODES.find((node) => node.id === to)
              return <li key={`${from}-${to}`}>{a.label} → {b.label}</li>
            })}
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
