import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { clamp, lerp, smoothstep } from '../util/math.js';

// custom fog: exponential with distance offset and cap (keeps far mountains as hazy silhouettes)
THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogF = 1.0 - exp( - fogDensity * max( vFogDepth - 14.0, 0.0 ) );
    fogF = min( fogF, 0.93 );
  #else
    float fogF = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogF );
#endif
`;

function makeSkyMaterial() {
  const sh = Sky.SkyShader;
  let frag = sh.fragmentShader;
  frag = frag.replace('uniform float time;', 'uniform float time;\nuniform float uNight;\nuniform vec3 uMoonDir;');
  frag = frag.replace('// Clouds', 'float cloudA = 0.0;\n// Clouds');
  frag = frag.replace('float alpha = ( 1.0 - exp( depth * cloudDensity * -12.0 ) ) * horizonFade;',
    'float alpha = ( 1.0 - exp( depth * cloudDensity * -12.0 ) ) * horizonFade;\ncloudA = alpha;');
  frag = frag.replace('gl_FragColor = vec4( texColor, 1.0 );', /* glsl */`
    float hz = clamp( direction.y, 0.0, 1.0 );
    vec3 nightC = mix( vec3( 0.016, 0.026, 0.062 ), vec3( 0.004, 0.008, 0.024 ), pow( hz, 0.45 ) );
    vec3 sp = direction * 230.0; vec3 cid = floor( sp ); vec3 fc = fract( sp ) - 0.5;
    float shs = fract( sin( dot( cid, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
    float star = 0.0;
    if ( shs > 0.984 ) { float sz = ( shs - 0.984 ) / 0.016; star = smoothstep( 0.2 * ( 0.45 + sz ), 0.0, length( fc ) ) * ( 0.4 + sz * 1.8 ); star *= 0.75 + 0.25 * sin( time * 2.3 + shs * 517.0 ); }
    star *= smoothstep( 0.03, 0.3, direction.y );
    vec3 md3 = normalize( uMoonDir );
    float md = dot( direction, md3 );
    float moon = smoothstep( 0.99925, 0.99948, md );
    float moonGlow = pow( max( md, 0.0 ), 400.0 ) * 0.35 + pow( max( md, 0.0 ), 24.0 ) * 0.05;
    vec3 nightAdd = nightC * ( 1.0 - cloudA * 0.5 ) + vec3( 0.85, 0.92, 1.0 ) * star * 0.5 * ( 1.0 - cloudA ) + vec3( 1.0, 0.96, 0.86 ) * moon * 3.0 * ( 1.0 - cloudA * 0.85 ) + vec3( 0.55, 0.65, 1.0 ) * moonGlow * ( 1.0 - cloudA * 0.6 );
    nightAdd += vec3( 0.03, 0.04, 0.07 ) * cloudA * 0.35;
    texColor += nightAdd * uNight;
    gl_FragColor = vec4( texColor, 1.0 );`);
  const uniforms = THREE.UniformsUtils.clone(sh.uniforms);
  uniforms.uNight = { value: 0 };
  uniforms.uMoonDir = { value: new THREE.Vector3(0, 1, 0) };
  return new THREE.ShaderMaterial({ name: 'SkyCustom', uniforms, vertexShader: sh.vertexShader, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false });
}

const EAST = new THREE.Vector3(1, 0, 0), SOUTH = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);

export class Environment {
  constructor(renderer, scene, U) {
    this.renderer = renderer; this.scene = scene; this.U = U;
    this.skyMat = makeSkyMaterial();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.scale.setScalar(3000); this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    scene.add(this.sky);
    this.skyScene = new THREE.Scene();
    const sky2 = new THREE.Mesh(geo, this.skyMat); sky2.scale.setScalar(3000); this.skyScene.add(sky2);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.shadowExt = 34;
    const sc = this.sun.shadow.camera;
    sc.left = -this.shadowExt; sc.right = this.shadowExt; sc.top = this.shadowExt; sc.bottom = -this.shadowExt;
    sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.035; this.sun.shadow.radius = 2.2;
    this.sun.layers.enableAll();
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x5a6b3a, 0.3);
    this.hemi.layers.enableAll();
    scene.add(this.hemi);

    this.cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cubeCam = new THREE.CubeCamera(1, 5000, this.cubeRT);
    scene.environment = this.cubeRT.texture;
    scene.environmentIntensity = 1.0;
    scene.fog = new THREE.FogExp2(0xbfd6e6, 0.0055);
    this.fogColor = new THREE.Color(0xbfd6e6);
    this.readBuf = new Uint16Array(128 * 4);

    this.sunDir = new THREE.Vector3(); this.moonDir = new THREE.Vector3(); this.lightDir = new THREE.Vector3();
    this.lightColor = new THREE.Color(); this.skyAmbient = new THREE.Color();
    this.envTimer = 999; this.lastEnvHour = -10;
    this.exposure = 0.65; this.nightK = 0; this.dayK = 1; this.sunsetK = 0;
    // weather mix (smoothed)
    this.wx = { cover: 0.3, dens: 0.5, rain: 0, dark: 0 };
    this.focus = new THREE.Vector3();
    this.forceEnv = true;
  }

  static weatherTarget(weather) {
    return weather === 'rain' ? { cover: 0.92, dens: 0.85, rain: 1, dark: 1 } : weather === 'cloudy' ? { cover: 0.62, dens: 0.6, rain: 0, dark: 0.45 } : { cover: 0.3, dens: 0.48, rain: 0, dark: 0 };
  }
  snapWeather(weather) { Object.assign(this.wx, Environment.weatherTarget(weather)); this.forceEnv = true; }

  setShadowQuality(q) {
    const size = q === 'high' ? 4096 : q === 'low' ? 1024 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }

  update(dt, hour, weather, focus, realTime) {
    // ---- sun & moon directions ----
    const dayT = (hour - 6) / 13; // 6:00 -> 19:00
    const th = dayT * Math.PI;
    const tilt = 0.62;
    this.sunDir.copy(EAST).multiplyScalar(Math.cos(th))
      .addScaledVector(UP, Math.sin(th) * Math.cos(tilt)).addScaledVector(SOUTH, Math.sin(th) * Math.sin(tilt)).normalize();
    let nh = hour < 6 ? hour + 24 : hour; // 19 -> 30
    const nightT = (nh - 18.5) / 12;
    const ph = nightT * Math.PI;
    this.moonDir.copy(EAST).multiplyScalar(Math.cos(ph))
      .addScaledVector(UP, Math.sin(ph) * Math.cos(0.5)).addScaledVector(SOUTH, Math.sin(ph) * Math.sin(0.5)).normalize();

    const e = this.sunDir.y;
    // ---- weather smoothing ----
    const target = Environment.weatherTarget(weather);
    const k = 1 - Math.exp(-dt * 0.6);
    for (const key in target) this.wx[key] = lerp(this.wx[key], target[key], k);
    const wx = this.wx;

    // ---- intensities ----
    const sunK = smoothstep(-0.03, 0.14, e);
    const night = smoothstep(0.06, -0.14, e);
    const moonK = smoothstep(-0.05, 0.18, this.moonDir.y) * night;
    this.nightK = night; this.dayK = sunK;
    this.sunsetK = smoothstep(0.42, 0.05, e) * smoothstep(-0.12, 0.02, e);
    const dim = 1 - wx.dark * 0.72;
    const sunI = 3.3 * sunK * dim;
    const moonI = 0.42 * moonK * (1 - wx.dark * 0.6);
    const sunCol = new THREE.Color('#fff3e0').lerp(new THREE.Color('#ffa765'), this.sunsetK);
    if (sunI >= moonI) {
      this.lightDir.copy(this.sunDir);
      this.lightColor.copy(sunCol).multiplyScalar(sunI);
    } else {
      this.lightDir.copy(this.moonDir);
      this.lightColor.set('#a9bfff').multiplyScalar(moonI);
    }
    this.sun.color.copy(this.lightColor); this.sun.intensity = 1;
    this.sun.castShadow = (sunI > 0.02 || moonI > 0.02);
    this.sun.shadow.intensity = lerp(1.0, 0.45, wx.dark);

    // shadow camera follows focus with texel snapping
    this.focus.copy(focus);
    const ldir = this.lightDir;
    const fwd = ldir.clone().negate();
    const up = Math.abs(fwd.y) > 0.98 ? SOUTH : UP;
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const up2 = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const texel = (2 * this.shadowExt) / this.sun.shadow.mapSize.x;
    const f = this.focus.clone();
    const u = f.dot(right), v = f.dot(up2);
    f.addScaledVector(right, Math.round(u / texel) * texel - u).addScaledVector(up2, Math.round(v / texel) * texel - v);
    this.sun.target.position.copy(f);
    this.sun.position.copy(f).addScaledVector(ldir, 100);
    this.sun.target.updateMatrixWorld();

    // ---- sky uniforms ----
    const su = this.skyMat.uniforms;
    su.sunPosition.value.copy(this.sunDir);
    su.uMoonDir.value.copy(this.moonDir);
    su.uNight.value = night;
    su.turbidity.value = lerp(lerp(2.6, 5.5, this.sunsetK), 9, wx.dark);
    su.rayleigh.value = lerp(lerp(1.15, 2.4, this.sunsetK), 0.7, wx.dark);
    su.mieCoefficient.value = lerp(0.004, 0.012, wx.dark);
    su.mieDirectionalG.value = 0.78;
    su.cloudCoverage.value = wx.cover;
    su.cloudDensity.value = wx.dens;
    su.cloudElevation.value = 0.55;
    su.time.value = realTime * 3.0;

    // hemisphere & exposure
    const dayHemi = new THREE.Color('#cfe0ff'), nightHemi = new THREE.Color('#4a5f9a');
    this.hemi.color.copy(dayHemi).lerp(nightHemi, night);
    this.hemi.groundColor.set('#6b7a45').lerp(new THREE.Color('#1c2433'), night);
    this.hemi.intensity = lerp(0.32, 0.55, night) * lerp(1, 0.85, wx.dark);
    // normalise image-based ambient so it stays a soft fill (≈40% of the sun) at every time of day
    const ambTarget = lerp(0.42, 0.05, night) * lerp(1, 1.12, wx.dark);
    this.scene.environmentIntensity = clamp(ambTarget / (this.envLum || 3), 0.0, 3.0);
    this.exposure = lerp(lerp(0.66, 0.78, this.sunsetK), 1.9, night) * lerp(1, 1.25, wx.dark);

    // fog density
    const mist = smoothstep(4.5, 6.2, hour) * smoothstep(9.5, 6.8, hour);
    this.scene.fog.density = 0.0042 * (1 + mist * 1.6 + wx.rain * 1.4 + night * 0.3);

    // ---- env cube refresh ----
    this.envTimer += dt;
    if (this.forceEnv || this.envTimer > 1.2 || Math.abs(hour - this.lastEnvHour) > 0.25) {
      this.envTimer = 0; this.lastEnvHour = hour; this.forceEnv = false;
      this.updateEnv();
    }
    this.scene.fog.color.copy(this.fogColor);

    // shared uniforms
    this.U.uSunDir.value.copy(this.lightDir);
    this.U.uSunColor.value.copy(this.lightColor);
    this.U.uSkyAmbient.value.copy(this.skyAmbient);
    this.U.uNight.value = night;
    this.U.uRain.value = wx.rain;
  }

  updateEnv() {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    this.cubeCam.position.set(0, 0, 0);
    this.cubeCam.update(r, this.skyScene);
    // read horizon colours for fog matching
    try {
      let rs = 0, gs = 0, bs = 0, n = 0;
      const buf = this.readBuf;
      for (const face of [0, 1, 4, 5]) {
        r.readRenderTargetPixels(this.cubeRT, 0, 66, 128, 1, buf, face);
        for (let i = 0; i < 128; i += 4) {
          rs += THREE.DataUtils.fromHalfFloat(buf[i * 4]);
          gs += THREE.DataUtils.fromHalfFloat(buf[i * 4 + 1]);
          bs += THREE.DataUtils.fromHalfFloat(buf[i * 4 + 2]);
          n++;
        }
      }
      if (n > 0 && isFinite(rs)) {
        this.fogColor.setRGB(rs / n, gs / n, bs / n, THREE.LinearSRGBColorSpace);
        this.horizonLum = 0.2126 * rs / n + 0.7152 * gs / n + 0.0722 * bs / n;
        // a touch of desaturation for haze
        const l = (this.fogColor.r + this.fogColor.g + this.fogColor.b) / 3;
        this.fogColor.lerp(new THREE.Color(l, l, l), 0.15);
      }
      // sky ambient (average upward-ish colour)
      r.readRenderTargetPixels(this.cubeRT, 0, 64, 128, 1, buf, 2);
      let ar = 0, ag = 0, ab = 0, an = 0;
      for (let i = 0; i < 128; i += 8) { ar += THREE.DataUtils.fromHalfFloat(buf[i * 4]); ag += THREE.DataUtils.fromHalfFloat(buf[i * 4 + 1]); ab += THREE.DataUtils.fromHalfFloat(buf[i * 4 + 2]); an++; }
      if (an) this.skyAmbient.setRGB(ar / an, ag / an, ab / an, THREE.LinearSRGBColorSpace);
      const zl = 0.2126 * this.skyAmbient.r + 0.7152 * this.skyAmbient.g + 0.0722 * this.skyAmbient.b;
      this.envLum = Math.max(1e-4, 0.6 * (this.horizonLum || zl) + 0.4 * zl);
      // the physical sky is far brighter than lit surfaces: keep the fog in the same range as the scene
      this.fogColor.multiplyScalar(lerp(0.3, 0.85, this.nightK));
    } catch (err) {
      this.fogColor.set(this.nightK > 0.5 ? '#0d1424' : '#bcd3e4');
    }
    r.setRenderTarget(prevTarget);
  }
}
