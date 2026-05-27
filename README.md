# Mapa 3D Procedural RPG

Projeto React + Vite com um mapa 3D procedural renderizado em HTML5 Canvas/WebGL.

## Restrições atendidas

- Sem GIF
- Sem SVG
- Sem modelos 3D `.glb` ou `.gltf`
- Sem texturas `.png`, `.jpg` ou `.webp`
- Sem assets externos de mapa
- Geometria criada por código
- Tiles renderizados via Canvas/WebGL
- CSS usado apenas para interface, HUD e efeitos externos

## O que o mapa contém

- Terreno em grade procedural
- Tiles de campo, estrada, rio, rocha e floresta
- Construções e marcadores criados com cubos e pirâmides
- Rotas narrativas entre pontos do mapa
- Água animada por cálculo no shader
- Câmera orbital automática
- Zoom com scroll do mouse
- HUD em React/CSS com status, legenda e rotas

## Rodar localmente

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Arquitetura

```text
React        -> estado, HUD e estrutura da aplicação
Vite         -> ambiente de desenvolvimento e build
HTML5 Canvas -> superfície de renderização
WebGL        -> renderização 3D real
CSS          -> interface e efeitos visuais externos
JavaScript   -> geração procedural de tiles, rotas e geometria
```

## Observação

O mapa não usa bibliotecas 3D como Three.js ou Babylon.js. A renderização foi feita com WebGL puro para manter o projeto procedural e sem dependência de modelos ou texturas externas.
