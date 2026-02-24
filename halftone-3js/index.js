import * as THREE from 'three';

export default class Halftone3D {
    static defaults = {
        container: null,
        grid: 50, // Higher default for WebGL
        gap: 0,
        shape: 'circle', // circle, square
        color: '#E85002',
        bgColor: '#050510',
        source: null, // Image URL, Video URL, or 'webcam'
        interaction: 'repulse', // repulse, attract, none
        radius: 0.2, // Interaction radius (normalized 0-1)
        strength: 0.5, // Interaction strength
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
        this.mouse = new THREE.Vector2(-999, -999);
        this.time = 0;

        this.init();
    }

    init() {
        // 1. Scene & Camera
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.config.bgColor);

        const aspect = this.width / this.height;
        this.camera = new THREE.OrthographicCamera(-1, 1, 1/aspect, -1/aspect, 0.1, 1000);
        this.camera.position.z = 5;

        // 2. Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // 3. Defaults & Grid
        this.defaultTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
        this.defaultTexture.needsUpdate = true;
        
        this.createGrid();

        if (this.config.source) this.loadSource(this.config.source);

        window.addEventListener('resize', this.onResize.bind(this));
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        
        this.animate();
    }

    createGrid() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }

        const aspect = this.width / this.height;
        const cols = this.config.grid;
        const rows = Math.ceil(cols / aspect);
        const count = cols * rows;

        const geometry = this.config.shape === 'square' 
            ? new THREE.PlaneGeometry(1, 1) 
            : new THREE.CircleGeometry(0.5, 32);

        this.uniforms = {
            uTime: { value: 0 },
            uTexture: { value: this.defaultTexture },
            uMouse: { value: new THREE.Vector2(0, 0) },
            uColor: { value: new THREE.Color(this.config.color) },
            uGrid: { value: new THREE.Vector2(cols, rows) },
            uDotScale: { value: this.config.dotScale },
            uContrast: { value: this.config.contrast },
            uBrightness: { value: this.config.brightness },
            uRadius: { value: this.config.radius },
            uStrength: { value: this.config.strength },
            uInteraction: { value: this.getInteractionType() }
        };

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                uniform sampler2D uTexture;
                uniform float uBrightness;
                uniform float uContrast;
                uniform vec2 uMouse;
                uniform float uRadius;
                uniform float uStrength;
                uniform int uInteraction;
                uniform vec2 uGrid;
                uniform float uDotScale;

                attribute vec3 instancePos;
                attribute vec2 instanceUV;
                varying float vScale;

                void main() {
                    vec4 texColor = texture2D(uTexture, instanceUV);
                    float luma = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
                    
                    float intensity = clamp(luma * uBrightness, 0.0, 1.0);
                    float scale = pow(intensity, uContrast);
                    vScale = scale;

                    float d = distance(instancePos.xy, uMouse);
                    vec2 displacement = vec2(0.0);

                    if (d < uRadius) {
                        float force = (1.0 - d / uRadius) * uStrength;
                        vec2 dir = normalize(instancePos.xy - uMouse);
                        if (uInteraction == 1) displacement = dir * force * 0.1;
                        else if (uInteraction == 2) displacement = -dir * force * 0.1;
                    }

                    float cellSize = 2.0 / uGrid.x;
                    float finalSize = cellSize * uDotScale * (0.1 + scale * 0.9);

                    vec3 pos = position * finalSize + instancePos + vec3(displacement, 0.0);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                void main() {
                    gl_FragColor = vec4(uColor, 1.0);
                }
            `,
            transparent: true
        });

        this.mesh = new THREE.InstancedMesh(geometry, material, count);
        this.mesh.frustumCulled = false; // Important for custom shaders
        
        const instancePos = new Float32Array(count * 3);
        const instanceUV = new Float32Array(count * 2);
        
        let i = 0;
        const stepX = 2.0 / cols;
        const stepY = (2.0 / aspect) / rows;
        const startY = (1.0 / aspect) - stepY/2;
        const startX = -1.0 + stepX/2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                instancePos[i * 3] = startX + c * stepX;
                instancePos[i * 3 + 1] = startY - r * stepY;
                instancePos[i * 3 + 2] = 0;
                instanceUV[i * 2] = c / (cols - 1);
                instanceUV[i * 2 + 1] = 1.0 - (r / (rows - 1));
                i++;
            }
        }

        this.mesh.geometry.setAttribute('instancePos', new THREE.InstancedBufferAttribute(instancePos, 3));
        this.mesh.geometry.setAttribute('instanceUV', new THREE.InstancedBufferAttribute(instanceUV, 2));
        this.scene.add(this.mesh);
    }

    getInteractionType() {
        if (this.config.interaction === 'repulse') return 1;
        if (this.config.interaction === 'attract') return 2;
        return 0;
    }

    loadSource(src) {
        const loader = new THREE.TextureLoader();
        
        if (src === 'webcam') {
            this.setupWebcam();
        } else if (src.match(/\.(mp4|webm)$/i)) {
            // Video
            const video = document.createElement('video');
            video.src = src;
            video.crossOrigin = "anonymous";
            video.loop = true;
            video.muted = true;
            video.play();
            const tex = new THREE.VideoTexture(video);
            this.uniforms.uTexture.value = tex;
        } else {
            // Image
            loader.load(src, (tex) => {
                this.uniforms.uTexture.value = tex;
            });
        }
    }

    setupWebcam() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const constraints = { video: { width: 1280, height: 720, facingMode: 'user' } };
            navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
                const video = document.createElement('video');
                video.srcObject = stream;
                video.play();
                const tex = new THREE.VideoTexture(video);
                this.uniforms.uTexture.value = tex;
            }).catch((e) => console.error('Webcam error:', e));
        }
    }

    onResize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        
        const aspect = this.width / this.height;
        
        // Update Camera
        this.camera.left = -1;
        this.camera.right = 1;
        this.camera.top = 1 / aspect;
        this.camera.bottom = -1 / aspect;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(this.width, this.height);
        if (this.uniforms && this.uniforms.uResolution) {
            this.uniforms.uResolution.value.set(this.width, this.height);
        }
        
        // Re-create grid to match new aspect ratio
        this.createGrid();
    }

    onMouseMove(e) {
        // Normalize mouse to -1 to 1
        // We need coordinates relative to the container center
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Map to -1 to 1 range
        const nx = (x / rect.width) * 2 - 1;
        // Map y. Top is positive in 3D world (usually), but screen y is positive down.
        // Our camera top is > 0.
        const aspect = this.width / this.height;
        const ny = -((y / rect.height) * (2/aspect) - (1/aspect)); 

        this.mouse.set(nx, ny);
    }

    animate() {
        this.time += 0.05;
        this.uniforms.uTime.value = this.time;
        this.uniforms.uMouse.value.lerp(this.mouse, 0.1); // Smooth mouse
        
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this.animate.bind(this));
    }
}
