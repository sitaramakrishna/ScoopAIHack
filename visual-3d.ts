/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:organize-imports
// tslint:disable:ban-malformed-import-paths
// tslint:disable:no-new-decorators

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Analyser} from './analyser';

import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {fs as backdropFS, vs as backdropVS} from './backdrop-shader';

// New Particle Shaders
const PARTICLE_COUNT = 5000;

const particleVS = `
  uniform float uTime;
  uniform float uAudioIntensity;
  uniform float uRadius;
  attribute vec3 velocity;
  varying float vAlpha;

  // Psuedo-random noise function
  float snoise(vec3 uv) {
    return fract(sin(dot(uv, vec3(12.9898, 78.233, 151.7182))) * 43758.5453123) * 2.0 - 1.0;
  }

  void main() {
    // Calculate particle lifetime, cycling from 0.0 to 1.0
    float life = fract(uTime * 0.1 * velocity.z);

    // Position moves from the sphere outwards over its life
    float speed = 1.0 + uAudioIntensity * 5.0;
    vec3 pos = position + normalize(position) * life * uRadius * speed;

    // Add some swirling, turbulent motion using a noise field
    vec3 dir = normalize(position); // Direction from center is constant for a particle
    vec3 noisyDir = vec3(
        snoise(pos * 0.4 + uTime * 0.1),
        snoise(pos * 0.4 + uTime * 0.1 + 100.0),
        snoise(pos * 0.4 + uTime * 0.1 + 200.0)
    );
    
    // By removing the component of the noise that is parallel to the particle's
    // outward direction, we get a swirling motion on the surface of an imaginary sphere.
    vec3 turbulence = noisyDir - dot(noisyDir, dir) * dir;
    
    // The turbulence is stronger when audio is loud and fades as the particle ages.
    pos += turbulence * (1.0 - life) * 2.0 * uAudioIntensity;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    
    // Fade in at the start, fade out at the end of life to hide the pop
    vAlpha = sin(life * 3.14159);
    
    // Make particles bigger with audio intensity
    gl_PointSize = (1.5 + uAudioIntensity * 8.0) * ( 30.0 / -mvPosition.z );
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFS = `
  uniform float uAudioIntensity;
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    float strength = distance(gl_PointCoord, vec2(0.5));
    strength = 1.0 - (strength * 2.0); // Creates a soft-edged circle

    if (strength < 0.0) discard;

    // Use vAlpha for fade in/out, and strength for the soft edge.
    gl_FragColor = vec4(uColor, strength * vAlpha * (0.3 + uAudioIntensity * 0.7));
  }
`;

// New Ambient Particle Shaders
const AMBIENT_PARTICLE_COUNT = 1000;

const ambientParticleVS = `
  uniform float uTime;
  attribute vec3 velocity;
  varying float vAlpha;

  // Psuedo-random noise function
  float snoise(vec3 uv) {
    return fract(sin(dot(uv, vec3(12.9898, 78.233, 151.7182))) * 43758.5453123) * 2.0 - 1.0;
  }

  void main() {
    // Slower lifetime cycle for gentle drifting
    float life = fract(uTime * 0.05 * velocity.z);

    // Start further out and move slowly
    vec3 pos = position * (1.0 + life * 3.0);

    // Add gentle, slow turbulence
    vec3 turbulence = vec3(
        snoise(position * 0.1 + uTime * 0.02),
        snoise(position * 0.1 + uTime * 0.02 + 100.0),
        snoise(position * 0.1 + uTime * 0.02 + 200.0)
    );
    pos += turbulence * 0.5;


    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    
    // Fade in and out over the long lifetime
    vAlpha = sin(life * 3.14159);
    
    // Small, constant size
    gl_PointSize = 2.0 * ( 30.0 / -mvPosition.z );
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const ambientParticleFS = `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    float strength = distance(gl_PointCoord, vec2(0.5));
    strength = 1.0 - (strength * 2.0);

    if (strength < 0.0) discard;

    // Very subtle alpha
    gl_FragColor = vec4(uColor, strength * vAlpha * 0.2);
  }
`;

/**
 * 3D live audio visual.
 */
@customElement('gdm-live-audio-visuals-3d')
export class GdmLiveAudioVisuals3D extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private camera!: THREE.PerspectiveCamera;
  private backdrop!: THREE.Mesh;
  private composer!: EffectComposer;
  private sphere!: THREE.Mesh;
  private particles!: THREE.Points;
  private ambientParticles!: THREE.Points;
  private bloomPass!: UnrealBloomPass;
  private prevTime = 0;
  private rotation = new THREE.Vector3(0, 0, 0);
  private inputColor = new THREE.Color(0x20c2a8); // Soft Teal for user input
  private outputColor = new THREE.Color(0xb0a0e0); // Less glary purple for AI output
  private lastEmpathyTrigger = 0;
  private empathyEffectActive = false;
  private empathyEffectStartTime = 0;
  private readonly EMPATHY_EFFECT_DURATION = 2500; // 2.5 seconds

  private _outputNode!: AudioNode;

  @property()
  set outputNode(node: AudioNode) {
    this._outputNode = node;
    this.outputAnalyser = new Analyser(this._outputNode);
  }

  get outputNode() {
    return this._outputNode;
  }

  private _inputNode!: AudioNode;

  @property()
  set inputNode(node: AudioNode) {
    this._inputNode = node;
    this.inputAnalyser = new Analyser(this._inputNode);
  }

  get inputNode() {
    return this._inputNode;
  }

  @property({type: Number})
  empathyTrigger = 0;

  private canvas!: HTMLCanvasElement;

  static styles = css`
    canvas {
      width: 100% !important;
      height: 100% !important;
      position: absolute;
      inset: 0;
      image-rendering: pixelated;
    }
  `;

  protected updated(changedProperties: Map<string, unknown>) {
    if (
      changedProperties.has('empathyTrigger') &&
      this.empathyTrigger !== this.lastEmpathyTrigger
    ) {
      this.lastEmpathyTrigger = this.empathyTrigger;
      this.triggerEmpathyEffect();
    }
  }

  private triggerEmpathyEffect() {
    this.empathyEffectActive = true;
    this.empathyEffectStartTime = performance.now();
  }

  private init() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x100c14);

    const backdrop = new THREE.Mesh(
      new THREE.IcosahedronGeometry(10, 5),
      new THREE.RawShaderMaterial({
        uniforms: {
          resolution: {value: new THREE.Vector2(1, 1)},
          rand: {value: 0},
        },
        vertexShader: backdropVS,
        fragmentShader: backdropFS,
        glslVersion: THREE.GLSL3,
      }),
    );
    backdrop.material.side = THREE.BackSide;
    scene.add(backdrop);
    this.backdrop = backdrop;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 0, 4);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.initSphere(scene);
    this.initParticles(scene);
    this.initAmbientParticles(scene);

    const renderPass = new RenderPass(scene, camera);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.9,
      0.5,
      0.1,
    );
    this.bloomPass = bloomPass;

    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(this.bloomPass);
    this.composer = composer;

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      const dPR = renderer.getPixelRatio();
      const w = window.innerWidth;
      const h = window.innerHeight;
      (
        backdrop.material as THREE.RawShaderMaterial
      ).uniforms.resolution.value.set(w * dPR, h * dPR);
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };

    window.addEventListener('resize', onWindowResize);
    onWindowResize();

    this.animation();
  }

  private initSphere(scene: THREE.Scene) {
    const geometry = new THREE.IcosahedronGeometry(1, 64);
    const sphereMaterial = new THREE.MeshStandardMaterial({
      metalness: 0.1,
      roughness: 0.2,
    });

    sphereMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = {value: 0};
      shader.uniforms.bassIntensity = {value: 0};
      shader.uniforms.trebleIntensity = {value: 0};
      shader.uniforms.inputIntensity = {value: 0};
      shader.uniforms.empathyMix = {value: 0};

      sphereMaterial.userData.shader = shader;

      shader.vertexShader =
        `
        uniform float time;
        uniform float bassIntensity;
        uniform float trebleIntensity;
        uniform float inputIntensity;

        // Psuedo-random noise function
        float snoise(vec3 uv) {
          return fract(sin(dot(uv, vec3(12.9898, 78.233, 151.7182))) * 43758.5453123) * 2.0 - 1.0;
        }
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        // More pronounced, slower waves for bass
        float bassDisplacement = snoise(position * 3.0 + time * 0.3) * 0.12 * bassIntensity;

        // Faster, smaller ripples for treble
        float trebleDisplacement = snoise(position * 18.0 + time * 0.9) * 0.06 * trebleIntensity;

        // Add a subtle geometric grid pattern that reacts to user input
        float inputPattern = sin(position.y * 30.0) * sin(position.x * 30.0) * cos(position.z * 30.0);
        float inputDisplacement = inputPattern * 0.04 * inputIntensity;

        transformed += normal * (bassDisplacement + trebleDisplacement + inputDisplacement);
        `,
      );

      shader.fragmentShader =
        `
        uniform float bassIntensity;
        uniform float trebleIntensity;
        uniform float inputIntensity;
        uniform float empathyMix;

        vec3 bassColor = vec3(0.2, 0.1, 0.5);   // Deep Indigo
        vec3 trebleColor = vec3(0.7, 0.6, 1.0); // Lavender
        vec3 inputColor = vec3(0.125, 0.76, 0.66); // Soft Teal
        vec3 empathyColor = vec3(0.88, 1.0, 0.94); // Creamy Mint
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        // Calculate base color from audio intensity
        float totalIntensity = bassIntensity + trebleIntensity + 0.001;
        vec3 baseColor = mix(bassColor, trebleColor, trebleIntensity / totalIntensity);

        // Mix in user input color
        baseColor = mix(baseColor, inputColor, inputIntensity * 0.5);

        // Mix in empathy color glow
        vec3 finalColor = mix(baseColor, empathyColor, empathyMix);
        
        float fresnel = 1.0 - dot(normalize(vNormal), vec3(0,0,1));
        
        gl_FragColor = vec4(gl_FragColor.rgb + finalColor * (bassIntensity + trebleIntensity) * 2.0, gl_FragColor.a);
        gl_FragColor.rgb += fresnel * finalColor * 0.5;

        #include <dithering_fragment>
        `,
      );
    };

    this.sphere = new THREE.Mesh(geometry, sphereMaterial);
    scene.add(this.sphere);
  }

  private initParticles(scene: THREE.Scene) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const vertex = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      )
        .normalize()
        .multiplyScalar(1.2); // Start just outside the sphere

      positions[i3] = vertex.x;
      positions[i3 + 1] = vertex.y;
      positions[i3 + 2] = vertex.z;

      velocities[i3] = 0;
      velocities[i3 + 1] = 0;
      velocities[i3 + 2] = 0.5 + Math.random();
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    const material = new THREE.ShaderMaterial({
      vertexShader: particleVS,
      fragmentShader: particleFS,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: {value: 0},
        uAudioIntensity: {value: 0},
        uRadius: {value: 5.0},
        uColor: {value: this.outputColor.clone()},
      },
    });

    this.particles = new THREE.Points(geometry, material);
    scene.add(this.particles);
  }

  private initAmbientParticles(scene: THREE.Scene) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(AMBIENT_PARTICLE_COUNT * 3);
    const velocities = new Float32Array(AMBIENT_PARTICLE_COUNT * 3);

    for (let i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      // Start on a larger sphere
      const vertex = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      )
        .normalize()
        .multiplyScalar(4.0);

      positions[i3] = vertex.x;
      positions[i3 + 1] = vertex.y;
      positions[i3 + 2] = vertex.z;

      velocities[i3] = 0;
      velocities[i3 + 1] = 0;
      velocities[i3 + 2] = 0.2 + Math.random() * 0.5; // Slower, varied speeds
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    const material = new THREE.ShaderMaterial({
      vertexShader: ambientParticleVS,
      fragmentShader: ambientParticleFS,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: {value: 0},
        uColor: {value: new THREE.Color(0x402666)}, // A darker, richer purple
      },
    });

    this.ambientParticles = new THREE.Points(geometry, material);
    scene.add(this.ambientParticles);
  }

  private animation() {
    requestAnimationFrame(() => this.animation());

    if (!this.inputAnalyser || !this.outputAnalyser) return;

    this.inputAnalyser.update();
    this.outputAnalyser.update();

    const t = performance.now() / 1000;
    const dt = t - this.prevTime;
    this.prevTime = t;

    // --- Empathy Effect ---
    let empathyMix = 0;
    if (this.empathyEffectActive) {
      const elapsedTime = performance.now() - this.empathyEffectStartTime;
      if (elapsedTime < this.EMPATHY_EFFECT_DURATION) {
        const progress = elapsedTime / this.EMPATHY_EFFECT_DURATION;
        empathyMix = Math.sin(progress * Math.PI); // A sine wave from 0 to 1 and back to 0
      } else {
        this.empathyEffectActive = false;
      }
    }

    // --- Audio Data Processing ---
    const inputData = this.inputAnalyser.data;
    const outputData = this.outputAnalyser.data;
    const numBins = outputData.length;

    const inputIntensity =
      inputData.reduce((a, b) => a + b, 0) / (numBins * 255);
    const outputIntensity =
      outputData.reduce((a, b) => a + b, 0) / (numBins * 255);

    // Split into bass (first 25% of bins) and treble (last 50%)
    const bassBins = Math.floor(numBins * 0.25);
    const trebleBinsStart = Math.floor(numBins * 0.5);

    let outputBass = 0;
    for (let i = 0; i < bassBins; i++) {
      outputBass += outputData[i];
    }
    outputBass /= bassBins * 255;

    let outputTreble = 0;
    for (let i = trebleBinsStart; i < numBins; i++) {
      outputTreble += outputData[i];
    }
    outputTreble /= (numBins - trebleBinsStart) * 255;

    // --- Sphere Pulsation ---
    const totalIntensity = inputIntensity + outputIntensity;
    // Add a more pronounced "kick" for bass frequencies.
    const bassKick = outputBass * 0.25;
    const targetScale = 1 + totalIntensity * 0.1 + bassKick; // Pulsate with a base and a kick
    const currentScale = this.sphere.scale.x;
    // Make the interpolation slightly faster for more responsiveness
    const newScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.2);
    this.sphere.scale.set(newScale, newScale, newScale);

    // --- Update Shaders ---
    const sphereShader = (this.sphere.material as THREE.MeshStandardMaterial)
      .userData.shader;
    if (sphereShader) {
      // FIX: Corrected variable name from `shader` to `sphereShader`.
      sphereShader.uniforms.time.value = t;
      sphereShader.uniforms.bassIntensity.value = outputBass;
      sphereShader.uniforms.trebleIntensity.value = outputTreble;
      sphereShader.uniforms.inputIntensity.value = inputIntensity;
      sphereShader.uniforms.empathyMix.value = empathyMix;
    }

    const particleShader = this.particles.material as THREE.ShaderMaterial;
    particleShader.uniforms.uTime.value = t;

    const ambientParticleShader = this.ambientParticles
      .material as THREE.ShaderMaterial;
    ambientParticleShader.uniforms.uTime.value = t;

    // --- Dynamic Particles ---
    // Intensity affects particle speed, size, and brightness
    const particleIntensity = outputIntensity + inputIntensity * 0.75;
    particleShader.uniforms.uAudioIntensity.value = particleIntensity;

    // Color transitions to orange based on user input strength, with empathy glow
    const colorLerpFactor = THREE.MathUtils.clamp(
      inputIntensity / (outputIntensity + 0.01),
      0,
      1,
    );
    const baseParticleColor = new THREE.Color()
      .copy(this.outputColor)
      .lerp(this.inputColor, colorLerpFactor);
    const empathyParticleColor = new THREE.Color(0xe0fff0); // Creamy Mint
    baseParticleColor.lerp(empathyParticleColor, empathyMix * 0.8);
    (particleShader.uniforms.uColor.value as THREE.Color).copy(
      baseParticleColor,
    );

    // --- Update Effects ---
    const baseBloom = 0.6 + outputBass * 1.0 + outputTreble * 1.5;
    this.bloomPass.strength = baseBloom + empathyMix * 1.0; // Gentler bloom for empathy

    // --- Update Scene Objects ---
    (this.backdrop.material as THREE.RawShaderMaterial).uniforms.rand.value =
      Math.random() * 10000;

    const f = 0.05;
    this.rotation.y += dt * f * (0.5 + inputIntensity * 0.5);
    this.rotation.x += dt * f * outputBass * 0.2;

    this.sphere.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);
    this.particles.rotation.set(
      this.rotation.x,
      this.rotation.y,
      this.rotation.z,
    );
    this.ambientParticles.rotation.set(
      this.rotation.x * 0.5,
      this.rotation.y * 0.5,
      this.rotation.z * 0.5,
    );
    this.camera.lookAt(this.sphere.position);

    this.composer.render();
  }

  protected firstUpdated() {
    // FIX: Property 'renderRoot' does not exist on type 'GdmLiveAudioVisuals3D'. Replaced with 'shadowRoot'.
    this.canvas = this.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    this.init();
  }

  protected render() {
    return html`<canvas></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-3d': GdmLiveAudioVisuals3D;
  }
}