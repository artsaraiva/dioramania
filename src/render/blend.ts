// The blend (`.scratch/living-city/spec.md`, #283): what makes the low-poly scene one picture. Soft shade where things
// meet (ambient occlusion from depth), a restrained glow round only what is lit, and a miniature's lens: the top and
// the foot of the frame out of focus, a little more colour, the corners a little darker. The screen's own pieces in the
// scene (Jam marks and bubbles, the tools' marks, the hand and its captions) are drawn after it, sharp and unhaloed.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

// The prototype's values, which the user accepted (`prototype-faceted-look`): the glow already halved from the first.
// To hold the frame budget the shade is drawn at half the canvas's resolution, with half the prototype's samples.
const SHADE = { radius: 2.6, distanceExponent: 1.4, thickness: 1.4, scale: 1.25, samples: 8, blend: 0.9, resolution: 0.5 }
const DENOISE = { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 3, radiusExponent: 1.5, rings: 2, samples: 8 }
// Only what is brighter than white glows: almost nothing by day, restrained at night, as far as the lights are on (the
// dusk, `./day`'s, #284).
const GLOW = { day: 0.06, night: 0.26, radius: 0.42, threshold: 1 }
// The lens: the blur at the top and foot of the frame (CSS px), the half-height of the band in focus across the middle
// (a share of the frame), the colour's boost, and how much darker the corners are.
const LENS = { blur: 4.5, band: 0.3, saturation: 1.12, corners: 0.32 }
const SCREEN = 1 // the layer the screen's own pieces are drawn on

const lensShader = {
  uniforms: {
    tDiffuse: { value: null },
    texel: { value: new THREE.Vector2() },
    blur: { value: LENS.blur },
    band: { value: LENS.band },
    saturation: { value: LENS.saturation },
    corners: { value: LENS.corners },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 texel; uniform float blur; uniform float band; uniform float saturation;
    uniform float corners; varying vec2 vUv;
    void main() {
      float r = smoothstep(band, 0.5, abs(vUv.y - 0.5)) * blur;
      vec4 sum = texture2D(tDiffuse, vUv) * 0.2;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982;
        sum += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * texel * r) * 0.065;
        sum += texture2D(tDiffuse, vUv + vec2(cos(a + 0.39), sin(a + 0.39)) * texel * r * 0.5) * 0.035;
      }
      float grey = dot(sum.rgb, vec3(0.299, 0.587, 0.114));
      sum.rgb = mix(vec3(grey), sum.rgb, saturation);
      sum.rgb *= 1.0 - corners * smoothstep(0.35, 0.95, length(vUv - 0.5) * 1.25);
      gl_FragColor = sum;
    }`,
}

// The pass's own visibility hooks, round the draw of normals and depth it takes the shade from.
// ponytail: they are untyped and private to three's GTAOPass, so an upgrade may rename them; then hide the sprites and
// see-through meshes by a layer of their own instead.
interface Hooks {
  _overrideVisibility(): void
  _restoreVisibility(): void
}
const Hooked = GTAOPass as unknown as new (...args: ConstructorParameters<typeof GTAOPass>) => GTAOPass & Hooks

/**
 * Ambient occlusion that takes only solid meshes: a sprite or a see-through surface (a puff of dust, a pool of light)
 * would shade what is behind it as if it stood there. Its draw of normals and depth keeps the shadow map the frame's
 * own draw made.
 */
class SolidShade extends Hooked {
  private hidden: THREE.Object3D[] = []
  override setSize(width: number, height: number) {
    super.setSize(Math.ceil(width * SHADE.resolution), Math.ceil(height * SHADE.resolution))
  }
  override render(...args: Parameters<GTAOPass['render']>) {
    const [renderer] = args
    const autoShadow = renderer.shadowMap.autoUpdate
    renderer.shadowMap.autoUpdate = false
    super.render(...args)
    renderer.shadowMap.autoUpdate = autoShadow
  }
  override _overrideVisibility() {
    super._overrideVisibility()
    this.scene.traverseVisible((o) => {
      const material = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      const seeThrough = Array.isArray(material) ? material.some((m) => m.transparent) : material?.transparent
      if ((o as THREE.Sprite).isSprite || seeThrough) this.hidden.push(o)
    })
    for (const o of this.hidden) o.visible = false
  }
  override _restoreVisibility() {
    for (const o of this.hidden) o.visible = true
    this.hidden.length = 0
    super._restoreVisibility()
  }
}

/**
 * Draw `scene` through the blend in place of the renderer's own draw. `screen` holds the screen's own pieces, drawn
 * over the blended picture with its depth, so the City still hides them where it stands in front. `lights` light them,
 * and the shadow map takes them as it did before: the Tile in the hand still casts its shadow.
 */
export function createBlend(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.OrthographicCamera,
  { screen, lights }: { screen: THREE.Object3D[]; lights: THREE.Light[] },
) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, target)
  const draw = new RenderPass(scene, camera)
  composer.addPass(draw)
  const shade = new SolidShade(scene, camera, 1, 1)
  const { blend, resolution, ...gtao } = SHADE
  shade.updateGtaoMaterial({ ...gtao, screenSpaceRadius: false })
  shade.updatePdMaterial(DENOISE)
  shade.blendIntensity = blend
  composer.addPass(shade)
  const glow = new UnrealBloomPass(new THREE.Vector2(1, 1), GLOW.day, GLOW.radius, GLOW.threshold)
  composer.addPass(glow)
  const lens = new ShaderPass(lensShader)
  composer.addPass(lens)
  const output = new OutputPass()
  composer.addPass(output)

  // The sky, as the gradient behind the canvas has it, drawn as the scene's background: the passes carry nothing
  // see-through.
  const paper = document.createElement('canvas')
  ;[paper.width, paper.height] = [1, 256]
  const sky = new THREE.CanvasTexture(paper)
  sky.colorSpace = THREE.SRGBColorSpace
  let painted = ''

  // The blended picture's depth, written to the screen before the screen's own pieces are drawn.
  const depth = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: shade.depthTexture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tDepth; varying vec2 vUv; void main() { gl_FragDepth = texture2D(tDepth, vUv).x; }',
      colorWrite: false,
      depthFunc: THREE.AlwaysDepth,
    }),
  )
  for (const light of lights) light.layers.enable(SCREEN)
  // A shadow camera with a layer beyond the first casts from its own layers, not the camera's.
  for (const light of lights) if (light instanceof THREE.DirectionalLight) light.shadow.camera.layers.enable(SCREEN)

  return {
    /** Size the blend to the canvas, `width` × `height` CSS px. */
    setSize(width: number, height: number) {
      const ratio = renderer.getPixelRatio()
      composer.setPixelRatio(ratio)
      composer.setSize(width, height)
      lens.uniforms.texel.value.set(1 / (width * ratio), 1 / (height * ratio))
      lens.uniforms.blur.value = LENS.blur * ratio
    },

    /** Draw the scene under the sky `stops` (top, middle, bottom), glowing as far as the lights are on (`dusk`, 0–1). */
    render(stops: readonly THREE.Color[], dusk: number) {
      const css = stops.map((c) => c.getHexString()).join()
      if (css !== painted) {
        painted = css
        const g = paper.getContext('2d')!
        const fade = g.createLinearGradient(0, 0, 0, paper.height)
        stops.forEach((c, i) => fade.addColorStop(i / (stops.length - 1), `#${c.getHexString()}`))
        g.fillStyle = fade
        g.fillRect(0, 0, paper.width, paper.height)
        sky.needsUpdate = true
      }
      glow.strength = GLOW.day + (GLOW.night - GLOW.day) * dusk

      // Every frame, since the screen's pieces come and go.
      for (const root of screen) root.traverse((o) => o.layers.set(SCREEN))
      scene.background = sky
      composer.render()

      const [autoClear, autoShadow, layers] = [renderer.autoClear, renderer.shadowMap.autoUpdate, camera.layers.mask]
      renderer.autoClear = false
      renderer.shadowMap.autoUpdate = false
      scene.background = null
      renderer.setRenderTarget(null)
      renderer.clearDepth()
      depth.render(renderer)
      camera.layers.set(SCREEN)
      renderer.render(scene, camera)
      camera.layers.mask = layers
      renderer.autoClear = autoClear
      renderer.shadowMap.autoUpdate = autoShadow
    },

    dispose() {
      composer.dispose()
      target.dispose()
      for (const pass of [draw, shade, glow, lens, output]) pass.dispose()
      depth.dispose()
      sky.dispose()
    },
  }
}
