import * as THREE from 'three';

const FS_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Pipeline {
  constructor(renderer, scene, camera) {
    this.r = renderer; this.scene = scene; this.camera = camera;
    this.samples = 4;
    this.makeTargets(4);
    this.rt2 = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
    this.copyMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tDepth: { value: null } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`uniform sampler2D tColor; uniform sampler2D tDepth; varying vec2 vUv;
        void main(){ gl_FragColor = texture2D(tColor, vUv); gl_FragDepth = texture2D(tDepth, vUv).r; }`,
      depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, fog: false, toneMapped: false,
    });
    this.copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMat);
    this.copyQuad.frustumCulled = false; this.copyQuad.renderOrder = -1000; this.copyQuad.layers.set(1);
    scene.add(this.copyQuad);

    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);

    this.levels = 5;
    this.down = []; this.up = [];
    for (let i = 0; i < this.levels; i++) {
      this.down.push(new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }));
      if (i < this.levels - 1) this.up.push(new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }));
    }
    this.preMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uExposure: { value: 1 }, uThreshold: { value: 1.0 }, uKnee: { value: 0.6 } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uExposure; uniform float uThreshold; uniform float uKnee; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tSrc, vUv + vec2(-1.0,-1.0)*uTexel).rgb + texture2D(tSrc, vUv + vec2(1.0,-1.0)*uTexel).rgb
               + texture2D(tSrc, vUv + vec2(-1.0,1.0)*uTexel).rgb + texture2D(tSrc, vUv + vec2(1.0,1.0)*uTexel).rgb;
        c = min(c * 0.25, vec3(60.0)) * uExposure;
        float br = max(c.r, max(c.g, c.b));
        float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4);
        float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
        gl_FragColor = vec4(c * contrib, 1.0);
      }`, depthTest: false, depthWrite: false,
    });
    this.downMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main(){
        vec2 o = uTexel;
        vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
        c += texture2D(tSrc, vUv - o).rgb + texture2D(tSrc, vUv + o).rgb
           + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv - vec2(o.x, -o.y)).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0);
      }`, depthTest: false, depthWrite: false,
    });
    this.upMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel; uniform float uMix; varying vec2 vUv;
      void main(){
        vec2 h = uTexel;
        vec3 c = texture2D(tSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb + texture2D(tSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb
          + texture2D(tSrc, vUv + vec2(0.0, h.y * 2.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb;
        c += (texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb + texture2D(tSrc, vUv + vec2(h.x, h.y)).rgb
          + texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb + texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb) * 2.0;
        c /= 12.0;
        gl_FragColor = vec4(c * uMix + texture2D(tAdd, vUv).rgb, 1.0);
      }`, depthTest: false, depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tBloom: { value: null }, uExposure: { value: 0.7 }, uBloom: { value: 0.14 },
        uSat: { value: 1.08 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uVignette: { value: 0.55 }, uFade: { value: 0 }, uTime: { value: 0 },
        uLift: { value: new THREE.Vector3(0.012, 0.010, 0.016) },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uExposure; uniform float uBloom;
      uniform float uSat; uniform vec3 uTint; uniform float uVignette; uniform float uFade; uniform float uTime; uniform vec3 uLift; varying vec2 vUv;
      vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 c){
        const mat3 IM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
        const mat3 OM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
        c = IM * (c / 0.6); c = RRTAndODTFit(c); c = OM * c; return clamp(c, 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c)); }
      float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      void main(){
        vec3 c = texture2D(tScene, vUv).rgb * uExposure + texture2D(tBloom, vUv).rgb * uBloom;
        c = aces(c);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSat) * uTint;
        c = c + uLift * (1.0 - c);
        vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * uVignette;
        c = toSRGB(clamp(c, 0.0, 1.0));
        c += (hash(gl_FragCoord.xy + fract(uTime * 7.31) * 100.0) - 0.5) / 255.0;
        c *= (1.0 - uFade);
        gl_FragColor = vec4(c, 1.0);
      }`, depthTest: false, depthWrite: false,
    });
    this.width = 4; this.height = 4;
  }
  makeTargets(samples) {
    if (this.rt1) { this.rt1.depthTexture.dispose(); this.rt1.dispose(); }
    const dt = new THREE.DepthTexture(4, 4);
    dt.type = THREE.UnsignedIntType;
    this.rt1 = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples, depthBuffer: true, depthTexture: dt });
    this.samples = samples;
    if (this.width) this.rt1.setSize(this.width, this.height);
  }
  setMSAA(samples) { if (samples !== this.samples) { this.makeTargets(samples); this.onTargets && this.onTargets(); } }
  setSize(w, h) {
    this.width = w; this.height = h;
    this.rt1.setSize(w, h); this.rt2.setSize(w, h);
    let bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
    for (let i = 0; i < this.levels; i++) {
      this.down[i].setSize(bw, bh);
      if (i < this.levels - 1) this.up[i].setSize(bw, bh);
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    }
    this.copyMat.uniforms.tColor.value = this.rt1.texture;
    this.copyMat.uniforms.tDepth.value = this.rt1.depthTexture;
  }
  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.postScene, this.postCam);
  }
  render(exposure, time) {
    const r = this.r, cam = this.camera;
    this.copyMat.uniforms.tColor.value = this.rt1.texture;
    this.copyMat.uniforms.tDepth.value = this.rt1.depthTexture;
    r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = true;
    cam.layers.set(0);
    r.setRenderTarget(this.rt1); r.clear(true, true, true);
    r.render(this.scene, cam);
    cam.layers.set(1);
    r.setRenderTarget(this.rt2); r.clear(true, true, true);
    r.render(this.scene, cam);
    cam.layers.set(0);
    // bloom
    const pre = this.preMat.uniforms;
    pre.tSrc.value = this.rt2.texture; pre.uTexel.value.set(1 / this.width, 1 / this.height); pre.uExposure.value = exposure;
    this.pass(this.preMat, this.down[0]);
    for (let i = 1; i < this.levels; i++) {
      const s = this.down[i - 1];
      this.downMat.uniforms.tSrc.value = s.texture;
      this.downMat.uniforms.uTexel.value.set(1 / s.width, 1 / s.height);
      this.pass(this.downMat, this.down[i]);
    }
    let src = this.down[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      const u = this.upMat.uniforms;
      u.tSrc.value = src.texture; u.tAdd.value = this.down[i].texture; u.uTexel.value.set(0.5 / src.width, 0.5 / src.height);
      this.pass(this.upMat, this.up[i]);
      src = this.up[i];
    }
    const cu = this.compMat.uniforms;
    cu.tScene.value = this.rt2.texture; cu.tBloom.value = this.up[0].texture; cu.uExposure.value = exposure; cu.uTime.value = time;
    this.pass(this.compMat, null);
  }
}
