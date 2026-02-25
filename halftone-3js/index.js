import * as THREE from 'three';

/**
 * Halftone3D - High performance, GPU-accelerated halftone interaction layer.
 */
export default class Halftone3D {
    static defaults = {
        grid: 60,
        gap: 0,
        fit: 'cover',
        shape: 'circle',
        color: '#E85002',
        bgColor: '#050510',
        source: null,
        interaction: 'repulse',
        radius: 0.3,
        strength: 0.5,
        dotScale: 1.0,
        contrast: 2.0,
        brightness: 1.0,
    };

    constructor(options = {}) {
        this.config = { ...Halftone3D.defaults, ...options };
        this.container = typeof this.config.container === 'string' 
            ? document.querySelector(this.config.container) 
            : this.config.container;

        if (!this.container) throw new Error('Halftone3D: Container not found');

        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        this.mouse = new THREE.Vector2(0, 0);
        this.velocity = new THREE.Vector2(0, 0);
        this.prevMouse = new THREE.Vector2(0, 0);
        this.mouseActive = 0;
        this.time = 0;
        this._init = false;

        this._setupScene();
        this._setupTrail();
        this._setupEvents();
        this._setupGrid();
        
        if (this.config.source) this.loadSource(this.config.source);
        
        this._init = true;
        this.animate();
    }

    updateConfig(key, value) {
        this.config[key] = value;
        if (!this._init) return;

        if (['grid', 'shape', 'gap'].includes(key)) {
            this._setupGrid();
            return;
        }

        const uniformMap = {
            'color': () => { if (value !== 'auto') this.uniforms.uColor.value.set(value); },
            'dotScale': () => this.uniforms.uDotScale.value = value,
            'contrast': () => this.uniforms.uContrast.value = value,
            'brightness': () => this.uniforms.uBrightness.value = value,
            'radius': () => this.uniforms.uRadius.value = value,
            'strength': () => this.uniforms.uStrength.value = value,
            'fit': () => this.uniforms.uFit.value = this._getFitId(value),
            'interaction': () => this.uniforms.uInteraction.value = this._getInteractionId(value)
        };

        if (uniformMap[key]) {
            uniformMap[key]();
            if (key === 'color') this.uniforms.uAutoColor.value = (value === 'auto' ? 1 : 0);
        }
    }

    async loadSource(src) {
        if (!src) return;
        if (src === 'webcam') return this._setupWebcam();
        const isVideo = src.match(/\.(mp4|webm|ogg)$/i) || (src.startsWith('blob:') && this._lastUploadedType?.startsWith('video'));
        if (isVideo) {
            try {
                const video = document.createElement('video');
                video.src = src; video.crossOrigin = "anonymous";
                video.loop = true; video.muted = true; video.playsInline = true;
                video.onloadedmetadata = () => {
                    this.sourceAspect = video.videoWidth / video.videoHeight;
                    if (this.uniforms) this.uniforms.uSourceAspect.value = this.sourceAspect;
                };
                await video.play();
                this.uniforms.uTexture.value = new THREE.VideoTexture(video);
            } catch (e) { this._loadImage(src); }
        } else { this._loadImage(src); }
    }

    _loadImage(src) {
        new THREE.TextureLoader().load(src, (tex) => {
            tex.minFilter = THREE.LinearFilter;
            this.sourceAspect = tex.image.width / tex.image.height;
            if (this.uniforms) this.uniforms.uSourceAspect.value = this.sourceAspect;
            this.uniforms.uTexture.value = tex;
        });
    }

    _setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.config.bgColor);
        const aspect = this.width / this.height;
        this.camera = new THREE.OrthographicCamera(-1, 1, 1/aspect, -1/aspect, 0.1, 1000);
        this.camera.position.z = 5;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.width, this.height);
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.pointerEvents = 'none';
        this.renderer.domElement.style.display = 'block';
        if (getComputedStyle(this.container).position === 'static') this.container.style.position = 'relative';
        this.container.style.overflow = 'hidden';
        this.container.appendChild(this.renderer.domElement);
        this.defaultTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
        this.defaultTexture.needsUpdate = true;
    }

    _setupTrail() {
        // Create a small canvas to draw the mouse trail into
        this.trailCanvas = document.createElement('canvas');
        this.trailCanvas.width = this.trailCanvas.height = 128; // Small but enough for smooth trails
        this.trailCtx = this.trailCanvas.getContext('2d');
        this.trailTexture = new THREE.CanvasTexture(this.trailCanvas);
    }

    _updateTrail() {
        if (!this.trailCtx) return;
        
        // 1. Fade existing trail
        this.trailCtx.fillStyle = 'rgba(0,0,0,0.05)'; // Adjust this for tail length
        this.trailCtx.fillRect(0, 0, 128, 128);

        if (this._isMouseOver) {
            // 2. Map normalized mouse (-1 to 1) to canvas (0 to 128)
            const x = (this.mouse.x + 1) * 64;
            const y = (1 - (this.mouse.y * (this.width / this.height))) * 64; // Approximate map
            
            // Actually, let's use a simpler mapping
            const rect = this.container.getBoundingClientRect();
            // We'll update this in onMouseMove for accuracy
        }
        this.trailTexture.needsUpdate = true;
    }

    _setupGrid() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        const aspect = this.width / this.height;
        const cols = this.config.grid;
        const rows = Math.ceil(cols / aspect);
        const count = cols * rows;
        const geometry = this._getGeometry();
        this.uniforms = this._getUniforms(cols, rows);
        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: this._getVertexShader(),
            fragmentShader: this._getFragmentShader(),
            transparent: true
        });
        this.mesh = new THREE.InstancedMesh(geometry, material, count);
        this.mesh.frustumCulled = false;
        const instancePos = new Float32Array(count * 3);
        const instanceUV = new Float32Array(count * 2);
        const stepX = 2.0 / cols;
        const stepY = (2.0 / aspect) / rows;
        const startY = (1.0 / aspect) - stepY/2;
        const startX = -1.0 + stepX/2;
        for (let i = 0; i < count; i++) {
            const r = Math.floor(i / cols);
            const c = i % cols;
            instancePos[i * 3] = startX + c * stepX;
            instancePos[i * 3 + 1] = startY - r * stepY;
            instanceUV[i * 2] = c / (cols - 1 || 1);
            instanceUV[i * 2 + 1] = 1.0 - (r / (rows - 1 || 1));
        }
        this.mesh.geometry.setAttribute('instancePos', new THREE.InstancedBufferAttribute(instancePos, 3));
        this.mesh.geometry.setAttribute('instanceUV', new THREE.InstancedBufferAttribute(instanceUV, 2));
        this.scene.add(this.mesh);
    }

    _getGeometry() {
        switch(this.config.shape) {
            case 'square': return new THREE.PlaneGeometry(1, 1);
            case 'diamond': return new THREE.PlaneGeometry(1, 1);
            case 'triangle': return new THREE.CircleGeometry(0.5, 3);
            default: return new THREE.CircleGeometry(0.5, 32);
        }
    }

    _getUniforms(cols, rows) {
        return {
            uTime: { value: 0 },
            uTexture: { value: this.uniforms?.uTexture?.value || this.defaultTexture },
            uTrail: { value: this.trailTexture },
            uSourceAspect: { value: this.sourceAspect || 1.0 },
            uContainerAspect: { value: this.width / this.height },
            uMouse: { value: new THREE.Vector2(0,0) },
            uMouseActive: { value: 0.0 },
            uVelocity: { value: new THREE.Vector2(0,0) },
            uColor: { value: new THREE.Color(this.config.color === 'auto' ? '#ffffff' : this.config.color) },
            uGrid: { value: new THREE.Vector2(cols, rows) },
            uDotScale: { value: this.config.dotScale },
            uContrast: { value: this.config.contrast },
            uBrightness: { value: this.config.brightness },
            uRadius: { value: this.config.radius },
            uStrength: { value: this.config.strength },
            uInteraction: { value: this._getInteractionId(this.config.interaction) },
            uAutoColor: { value: this.config.color === 'auto' ? 1 : 0 },
            uGap: { value: this.config.gap },
            uFit: { value: this._getFitId(this.config.fit) }
        };
    }

    _getInteractionId(type) {
        return { 'none': 0, 'repulse': 1, 'attract': 2, 'vortex': 3, 'ripple': 4, 'fireball': 5 }[type] || 0;
    }

    _getFitId(fit) {
        return { 'fill': 0, 'cover': 1, 'contain': 2 }[fit] || 1;
    }

    _getVertexShader() {
        return `
            uniform sampler2D uTexture, uTrail;
            uniform float uBrightness, uContrast, uRadius, uStrength, uDotScale, uTime, uGap, uSourceAspect, uContainerAspect, uMouseActive;
            uniform vec2 uMouse, uGrid, uVelocity;
            uniform int uInteraction, uFit;
            attribute vec3 instancePos;
            attribute vec2 instanceUV;
            varying float vScale;
            varying vec3 vColor;

            vec2 getFitUV(vec2 uv, float cA, float sA, int mode) {
                if (mode == 0) return uv;
                float ratio = cA / sA;
                vec2 newUv = uv;
                if (mode == 1) { // cover
                    if (ratio > 1.0) newUv.y = (uv.y - 0.5) / ratio + 0.5;
                    else newUv.x = (uv.x - 0.5) * ratio + 0.5;
                } else if (mode == 2) { // contain
                    if (ratio > 1.0) newUv.x = (uv.x - 0.5) * ratio + 0.5;
                    else newUv.y = (uv.y - 0.5) / ratio + 0.5;
                }
                return newUv;
            }

            float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123); }

            void main() {
                vec2 correctedUV = getFitUV(instanceUV, uContainerAspect, uSourceAspect, uFit);
                vec4 texColor = texture2D(uTexture, correctedUV);
                vColor = texColor.rgb;
                
                // Sample Trail Map
                float heat = texture2D(uTrail, instanceUV).r;

                bool oob = (uFit == 2) && (correctedUV.x < 0.0 || correctedUV.x > 1.0 || correctedUV.y < 0.0 || correctedUV.y > 1.0);
                float luma = oob ? 0.0 : dot(vColor, vec3(0.299, 0.587, 0.114));
                float baseScale = pow(clamp(luma * uBrightness, 0.0, 1.0), uContrast);
                
                float d = distance(instancePos.xy, uMouse);
                vec2 disp = vec2(0.0);
                float interactScale = 1.0;

                if (uInteraction == 5) { // Fireball / Comet Physics
                    float speed = length(uVelocity);
                    float f = heat * uStrength;
                    vec2 dir = normalize(instancePos.xy - uMouse + 0.001); 
                    disp = (uVelocity * f * 2.0) + (dir * f * 0.05);
                    interactScale = 1.0 + (f * 1.5 * (1.0 + speed * 8.0));
                    float jitter = hash(instancePos.xy + uTime) - 0.5;
                    disp += jitter * f * 0.005; 
                } else if (d < uRadius) {
                    float f = (1.0 - d / uRadius) * uStrength * uMouseActive;
                    vec2 dir = normalize(instancePos.xy - uMouse);
                    if (uInteraction == 1) disp = dir * f * 0.15;
                    else if (uInteraction == 2) disp = -dir * f * 0.15;
                    else if (uInteraction == 3) disp = vec2(-dir.y, dir.x) * f * 0.2;
                    else if (uInteraction == 4) disp = dir * (sin(d * 20.0 - uTime * 5.0) * 0.5 + 0.5) * f * 0.1;
                }

                float cellSize = (2.0 / uGrid.x) - (uGap * 0.01);
                float finalSize = cellSize * uDotScale * (0.05 + baseScale * 0.95) * interactScale;
                vec3 pos = position * finalSize;
                ${this.config.shape === 'diamond' ? 'float a = 0.785; pos.xy = mat2(cos(a),-sin(a),sin(a),cos(a)) * pos.xy;' : ''}
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos + instancePos + vec3(disp, 0.0), 1.0);
                vScale = baseScale * interactScale;
            }
        `;
    }

    _getFragmentShader() {
        return `
            uniform vec3 uColor;
            uniform int uAutoColor;
            varying float vScale;
            varying vec3 vColor;
            void main() {
                if (vScale < 0.01) discard;
                gl_FragColor = vec4(uAutoColor == 1 ? vColor : uColor, 1.0);
            }
        `;
    }

    _setupWebcam() {
        navigator.mediaDevices?.getUserMedia({ video: true }).then(stream => {
            const video = document.createElement('video');
            video.srcObject = stream; video.play();
            video.onloadedmetadata = () => {
                this.sourceAspect = video.videoWidth / video.videoHeight;
                if (this.uniforms) this.uniforms.uSourceAspect.value = this.sourceAspect;
            };
            this.uniforms.uTexture.value = new THREE.VideoTexture(video);
        });
    }

    _setupEvents() {
        this._resizeHandler = this.onResize.bind(this);
        this._mouseHandler = (e) => {
            const r = this.container.getBoundingClientRect();
            const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
            const ny = -(((e.clientY - r.top) / r.height) * (2/(this.width/this.height)) - (1/(this.width/this.height))); 
            
            // Draw into Trail Map
            if (this.trailCtx) {
                const tx = ((e.clientX - r.left) / r.width) * 128;
                const ty = ((e.clientY - r.top) / r.height) * 128;
                const speed = Math.min(length(this.velocity) * 100, 20);
                this.trailCtx.beginPath();
                this.trailCtx.arc(tx, ty, 8 + speed, 0, Math.PI*2);
                this.trailCtx.fillStyle = 'white';
                this.trailCtx.fill();
            }

            this.mouse.set(nx, ny);
            this._isMouseOver = true;
        };
        this._leaveHandler = () => this._isMouseOver = false;
        this._enterHandler = () => this._isMouseOver = true;

        window.addEventListener('resize', this._resizeHandler);
        window.addEventListener('mousemove', this._mouseHandler);
        this.container.addEventListener('mouseenter', this._enterHandler);
        this.container.addEventListener('mouseleave', this._leaveHandler);
    }

    onResize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        const aspect = this.width / this.height;
        this.camera.left = -1; this.camera.right = 1;
        this.camera.top = 1/aspect; this.camera.bottom = -1/aspect;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height, false);
        if (this.uniforms) this.uniforms.uContainerAspect.value = aspect;
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => { if (this._init) this._setupGrid(); }, 100); 
    }

    animate() {
        this._raf = requestAnimationFrame(this.animate.bind(this));
        this.time += 0.05;
        
        if (this.uniforms) {
            this.uniforms.uTime.value = this.time;
            this.uniforms.uMouse.value.lerp(this.mouse, 0.1);
            
            // Smooth velocity (The culprit for the shaking)
            this.velocity.subVectors(this.mouse, this.prevMouse);
            this.uniforms.uVelocity.value.lerp(this.velocity, 0.05); // Very smooth lerp
            this.prevMouse.copy(this.mouse);
            
            const targetActive = this._isMouseOver ? 1.0 : 0.0;
            this.mouseActive += (targetActive - this.mouseActive) * 0.1;
            this.uniforms.uMouseActive.value = this.mouseActive;
            
            this._updateTrail();
        }
        this.renderer.render(this.scene, this.camera);
    }

    destroy() {
        cancelAnimationFrame(this._raf);
        window.removeEventListener('resize', this._resizeHandler);
        window.removeEventListener('mousemove', this._mouseHandler);
        this.container.removeEventListener('mouseenter', this._enterHandler);
        this.container.removeEventListener('mouseleave', this._leaveHandler);
        this.renderer.dispose();
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.container.removeChild(this.renderer.domElement);
    }
}

function length(v) { return Math.sqrt(v.x*v.x + v.y*v.y); }

if (typeof window !== 'undefined') {
    window.Halftone3D = Halftone3D;
    const init = () => {
        document.querySelectorAll('[data-ht-element]').forEach(el => {
            if (el.dataset.htEngine === '3d') {
                const options = {};
                for (const key in el.dataset) {
                    if (key.startsWith('ht') && key !== 'htElement' && key !== 'htEngine') {
                        const prop = key.slice(2).charAt(0).toLowerCase() + key.slice(3);
                        const val = el.dataset[key];
                        options[prop] = isNaN(val) ? val : parseFloat(val);
                    }
                }
                el.__halftone = new Halftone3D({ container: el, ...options });
            }
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}
