import * as THREE from 'three';
import { MeshPhongMaterial } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import URDFLoader from './URDFLoader.js';

const viewer = document.querySelector('urdf-viewer');

const tempVec2 = new THREE.Vector2();
const emptyRaycast = () => {};
// urdf-viewer element
// Loads and displays a 3D view of a URDF-formatted robot

// Events
// urdf-change: Fires when the URDF has finished loading and getting processed
// urdf-processed: Fires when the URDF has finished loading and getting processed
// geometry-loaded: Fires when all the geometry has been fully loaded
// ignore-limits-change: Fires when the 'ignore-limits' attribute changes
// angle-change: Fires when an angle changes
export default
class URDFViewer extends HTMLElement {

    static get observedAttributes() {

        return ['package', 'urdf', 'up', 'display-shadow', 'ambient-color', 'ignore-limits', 'show-collision'];

    }

    get package() { return this.getAttribute('package') || ''; }
    set package(val) { this.setAttribute('package', val); }

    get urdf() { return this.getAttribute('urdf') || ''; }
    set urdf(val) { this.setAttribute('urdf', val); }

    get ignoreLimits() { return this.hasAttribute('ignore-limits') || false; }
    set ignoreLimits(val) { val ? this.setAttribute('ignore-limits', val) : this.removeAttribute('ignore-limits'); }

    get up() { return this.getAttribute('up') || '+Z'; }
    set up(val) { this.setAttribute('up', val); }

    get displayShadow() { return this.hasAttribute('display-shadow') || false; }
    set displayShadow(val) { val ? this.setAttribute('display-shadow', '') : this.removeAttribute('display-shadow'); }

    get ambientColor() { return this.getAttribute('ambient-color') || '#8ea0a8'; }
    set ambientColor(val) { val ? this.setAttribute('ambient-color', val) : this.removeAttribute('ambient-color'); }

    get autoRedraw() { return this.hasAttribute('auto-redraw') || false; }
    set autoRedraw(val) { val ? this.setAttribute('auto-redraw', true) : this.removeAttribute('auto-redraw'); }

    get noAutoRecenter() { return this.hasAttribute('no-auto-recenter') || false; }
    set noAutoRecenter(val) { val ? this.setAttribute('no-auto-recenter', true) : this.removeAttribute('no-auto-recenter'); }

    get showCollision() { return this.hasAttribute('show-collision') || false; }
    set showCollision(val) { val ? this.setAttribute('show-collision', true) : this.removeAttribute('show-collision'); }

    get jointValues() {

        const values = {};
        if (this.robot) {

            for (const name in this.robot.joints) {

                const joint = this.robot.joints[name];
                values[name] = joint.jointValue.length === 1 ? joint.angle : [...joint.jointValue];

            }

        }

        return values;

    }
    set jointValues(val) { this.setJointValues(val); }

    get angles() {

        return this.jointValues;

    }
    set angles(v) {

        this.jointValues = v;

    }

    /* Lifecycle Functions */
    constructor() {

        super();

        this._requestId = 0;
        this._dirty = false;
        this._loadScheduled = false;
        this.robot = null;
        this.loadMeshFunc = null;
        this.urlModifierFunc = null;

        // Scene setup
        const scene = new THREE.Scene();

        const ambientLight = new THREE.HemisphereLight(this.ambientColor, '#000');
        ambientLight.groundColor.lerp(ambientLight.color, 0.5 * Math.PI);
        ambientLight.intensity = 0.5;
        ambientLight.position.set(0, 1, 0);
        scene.add(ambientLight);

        // Light setup
        const dirLight = new THREE.DirectionalLight(0xffffff, Math.PI);
        dirLight.position.set(4, 10, 1);
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.normalBias = 0.001;
        dirLight.castShadow = true;
        scene.add(dirLight);
        scene.add(dirLight.target);

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setClearColor(0xffffff);
        renderer.setClearAlpha(0);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        // Camera setup
        const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        camera.position.z = -10;

        // World setup
        const world = new THREE.Object3D();
        scene.add(world);

        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(40, 40),
            new THREE.ShadowMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.25 }),
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -0.5;
        plane.receiveShadow = true;
        plane.scale.set(10, 10, 10);
        scene.add(plane);

        // Controls setup
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.rotateSpeed = 2.0;
        controls.zoomSpeed = 5;
        controls.panSpeed = 2;
        controls.enableZoom = true;
        controls.enableDamping = false;
        controls.maxDistance = 50;
        controls.minDistance = 0.25;
        controls.addEventListener('change', () => this.recenter());

        this.scene = scene;
        this.world = world;
        this.renderer = renderer;
        this.camera = camera;
        this.controls = controls;
        this.plane = plane;
        this.directionalLight = dirLight;
        this.ambientLight = ambientLight;
        this.recordingData = [];
        this.replayPos = 0;
        this.replaying = false
        this.replayData = []
        this.outputDataBtn = document.querySelector('#output-data')
        this.paused = false
        this.recording = false
        this.notyf = new Notyf({ position: { x: 'center', y: 'top' } });
        this.outputDataBtn.addEventListener('click', () => {
            const keys = Object.keys(this.robot.joints);
            const data = {}
            const jointsPos = this.getJointWorldPositions()
            keys.forEach(name => data[name] = {
                angle: this.robot.joints[name].angle || 0,
                position: this.robot.joints[name].position,
                origPosition: this.robot.joints[name].origPosition,
                worldPosition: jointsPos[name]
            })
            const linkKeys = Object.keys(this.robot.links);
            const linksPos = this.getLinkWorldPositions()
            linkKeys.forEach(name => {
                data[name] = {
                    position: this.robot.links[name].position,
                    worldPosition: linksPos[name]
                }
            })
            data.robotPos = {
                x: +this.robot.position.x,
                y: +this.robot.position.y,
                z: +this.robot.position.z
            }
            // keys.forEach(name => data[name] = this.robot.joints[name].angle || 0 )
            // 复制到剪贴板
            navigator.clipboard.writeText(JSON.stringify(data))
            this.notyf.success('数据已复制到剪贴板')
        })

        this.replayBtn = document.querySelector('#replay-data')
        this.stopReplayBtn = document.querySelector('#replay-stop')
        this.uploadInput = document.querySelector('#file-input')
        this.pauseBtn = document.querySelector('#replay-pause')
        this.recordBtn = document.querySelector('#record-data')

        this.pauseBtn.addEventListener('click', () => {
            this.paused = !this.paused
            this.pauseBtn.innerText = this.paused ? '继续' : '暂停'
        })

        this.replayingShowBtns = document.querySelectorAll('.replaying-show')
        this.replayingHideBtns = document.querySelectorAll('.replaying-hide')
        this.recordShowBtns = document.querySelectorAll('.record-show')
        this.recordHideBtns = document.querySelectorAll('.record-hide')

        this.replayBtn.addEventListener('click', () => {
            this.uploadInput.click()
            // 获取文件
            this.uploadInput.addEventListener('change', (e) => {
                // json文件读取
                const file = e.target.files[0]
                const reader = new FileReader()
                reader.onload = (e) => {
                    try {
                        this.replayData = JSON.parse(e.target.result)
                        this.replaying = true
                        this.replayingHideBtns.forEach(btn => btn.style.display = 'none')
                        this.replayingShowBtns.forEach(btn => btn.style.display = 'block')
                    } catch (err) {
                        console.error('文件读取失败')
                        this.notyf.error('文件读取失败')
                    }
                }
                reader.readAsText(file)
            })
        })

        this.recordBtn.addEventListener('click', () => {
            this.recording = !this.recording
            this.recordBtn.innerText = this.recording ? '停止录制' : '开始录制'
            if (!this.recording) {
                // 保存数据写到JSON中并下载
                const dataStr = JSON.stringify(this.recordingData)
                const blob = new Blob([dataStr], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                // 文件名为时间戳
                a.download = `${new Date().getTime()}.json`
                a.click()
                URL.revokeObjectURL(url)
                this.recordingData = []
            }
        })

        
        this.stopReplayBtn.addEventListener('click', () => {
            // 清除上传的文件
            this.uploadInput.value = ''
            this.replayData = []
            this.replaying = false
            this.replayPos = 0
            this.paused = false
            this.pauseBtn.innerText = '暂停'
            this.replayingHideBtns.forEach(btn => btn.style.display = 'block')
            this.replayingShowBtns.forEach(btn => btn.style.display = 'none')
        })



        this._setUp(this.up);

        this._collisionMaterial = new MeshPhongMaterial({
            transparent: true,
            opacity: 0.35,
            shininess: 2.5,
            premultipliedAlpha: true,
            color: 0xffbe38,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        });

        window.sb = () => {
            console.log(this.robot)
        }

        const _renderLoop = () => {
            if (this.replaying && this.paused) {
                this._renderLoopId = requestAnimationFrame(_renderLoop);
                return
            }
            
            if (this.parentNode) {

                this.updateSize();

                if (this._dirty || this.autoRedraw) {

                    if (!this.noAutoRecenter) {

                        this._updateEnvironment();
                    }
                    this.renderer.render(scene, camera);
                    this._dirty = false;

                }

                // update controls after the environment in
                // case the controls are retargeted
                this.controls.update();

            }
            this._renderLoopId = requestAnimationFrame(_renderLoop);

            if (this.recording && this.robot) {
                const keys = Object.keys(this.robot.joints);
                const data = {}
                const jointsPos = this.getJointWorldPositions()
                keys.forEach(name => data[name] = {
                    angle: this.robot.joints[name].angle || 0,
                    position: this.robot.joints[name].position,
                    origPosition: this.robot.joints[name].origPosition,
                    worldPosition: jointsPos[name]
                })
                const linkKeys = Object.keys(this.robot.links);
                const linksPos = this.getLinkWorldPositions()
                linkKeys.forEach(name => {
                    data[name] = {
                        position: this.robot.links[name].position,
                        worldPosition: linksPos[name]
                    }
                })
                data.robotPos = {
                    x: +this.robot.position.x,
                    y: +this.robot.position.y,
                    z: +this.robot.position.z
                }
                // keys.forEach(name => data[name] = this.robot.joints[name].angle || 0 )
                this.recordingData.push(data);
            } else if (this.replaying && this.robot) {
                if (this.replayPos >= this.replayData.length) {
                    this.replayPos = 0;
                }
                
                this.updateRobotPos(this.replayData[this.replayPos].robotPos)
                this.setJointValues(this.replayData[this.replayPos++]);
            }


        };
        _renderLoop();

        
        if (!window.setJointValue) {
            window.setJointValue = this.setJointValue.bind(this);
        }

    }

    updateRobotPos({ x, y, z }) {
        this.robot.position.set(x,y,z)
        // 更新滑块的值
        document.querySelector('#pos-x input[type="range"]').value = x;
        document.querySelector('#pos-y input[type="range"]').value = y;
        document.querySelector('#pos-z input[type="range"]').value = z;
        // 更新输入框的值
        document.querySelector('#pos-x input[type="number"]').value = x;
        document.querySelector('#pos-y input[type="number"]').value = y;
        document.querySelector('#pos-z input[type="number"]').value = z;
        viewer._updateEnvironment();
        viewer.renderer.render(viewer.scene, viewer.camera);
        viewer.controls.update();
    }

    getJointWorldPositions() {
        const jointPositions = {};
        for (const jointName in this.robot.joints) {
            const joint = this.robot.joints[jointName];
            const worldPosition = new THREE.Vector3();
            joint.getWorldPosition(worldPosition);
            jointPositions[jointName] = worldPosition;
        }
        return jointPositions;
    }

    getLinkWorldPositions() {
        const linkPositions = {};
        for (const linkName in this.robot.links) {
            const link = this.robot.links[linkName];
            const worldPosition = new THREE.Vector3();
            link.getWorldPosition(worldPosition);
            linkPositions[linkName] = worldPosition;
        }
        return linkPositions;
    }

    autoMove() {
    }

    showGrid() {
        if (!this.axesHelper) {
            // 创建坐标轴辅助对象
            this.axesHelper = new THREE.AxesHelper(5); // 参数表示轴的长度
            this.axesHelper.raycast = () => {}; // 禁用交互
            this.scene.add(this.axesHelper);
        }

        if (!this.gridHelper) {
            // 创建网格辅助对象
            this.gridHelper = new THREE.GridHelper(10, 10); // 参数表示网格的大小和分段数
            this.gridHelper.raycast = () => {}; // 禁用交互
            this.scene.add(this.gridHelper);
        }
        // 刷新 scene
        this.renderer.render(this.scene, this.camera);
        
    }

    hideGrid() {
        if (this.axesHelper) {
            this.scene.remove(this.axesHelper);
            this.axesHelper = null;
        }
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
            this.gridHelper = null;
        }
        // 刷新 scene
        this.renderer.render(this.scene, this.camera);
    }

    connectedCallback() {

        // Add our initialize styles for the element if they haven't
        // been added yet
        if (!this.constructor._styletag) {

            const styletag = document.createElement('style');
            styletag.innerHTML =
            `
                ${ this.tagName } { display: block; }
                ${ this.tagName } canvas {
                    width: 100%;
                    height: 100%;
                }
            `;
            document.head.appendChild(styletag);
            this.constructor._styletag = styletag;

        }

        // add the renderer
        if (this.childElementCount === 0) {

            this.appendChild(this.renderer.domElement);

        }

        this.updateSize();
        requestAnimationFrame(() => this.updateSize());

    }

    disconnectedCallback() {

        cancelAnimationFrame(this._renderLoopId);

    }

    attributeChangedCallback(attr, oldval, newval) {

        this._updateCollisionVisibility();
        if (!this.noAutoRecenter) {
            this.recenter();
        }

        switch (attr) {

            case 'package':
            case 'urdf': {

                this._scheduleLoad();
                break;

            }

            case 'up': {

                this._setUp(this.up);
                break;

            }

            case 'ambient-color': {

                this.ambientLight.color.set(this.ambientColor);
                this.ambientLight.groundColor.set('#000').lerp(this.ambientLight.color, 0.5);
                break;

            }

            case 'ignore-limits': {

                this._setIgnoreLimits(this.ignoreLimits, true);
                break;

            }

        }

    }

    /* Public API */
    updateSize() {

        const r = this.renderer;
        const w = this.clientWidth;
        const h = this.clientHeight;
        const currSize = r.getSize(tempVec2);

        if (currSize.width !== w || currSize.height !== h) {

            this.recenter();

        }

        r.setPixelRatio(window.devicePixelRatio);
        r.setSize(w, h, false);

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();

    }

    redraw() {

        this._dirty = true;
    }

    recenter() {

        this._updateEnvironment();
        this.redraw();

    }

    // Set the joint with jointName to
    // angle in degrees
    setJointValue(jointName, ...values) {
        if (!this.robot) return;
        if (!this.robot.joints[jointName]) return;
        if (this.robot.joints[jointName].setJointValue(...values)) {

            this.redraw();
            this.dispatchEvent(new CustomEvent('angle-change', { bubbles: true, cancelable: true, detail: jointName }));

        }

    }

    setJointValues(values) {

        for (const name in values) {
            if (values[name].angle || values[name].angle === 0) {
                this.setJointValue(name, values[name].angle)
            }  else {
                this.setJointValue(name, values[name])
            }
        };

    }

    /* Private Functions */
    // Updates the position of the plane to be at the
    // lowest point below the robot and focuses the
    // camera on the center of the scene
    _updateEnvironment() {

        const robot = this.robot;
        if (!robot) return;
        this.world.updateMatrixWorld();

        const bbox = new THREE.Box3();
        bbox.makeEmpty();
        robot.traverse(c => {
            if (c.isURDFVisual) {
                bbox.expandByObject(c);
            }
        });

        const center = bbox.getCenter(new THREE.Vector3());
        this.controls.target.y = center.y;
        this.plane.position.y = bbox.min.y - 1e-3;

        const dirLight = this.directionalLight;
        dirLight.castShadow = this.displayShadow;

        if (this.displayShadow) {

            // Update the shadow camera rendering bounds to encapsulate the
            // model. We use the bounding sphere of the bounding box for
            // simplicity -- this could be a tighter fit.
            const sphere = bbox.getBoundingSphere(new THREE.Sphere());
            const minmax = sphere.radius;
            const cam = dirLight.shadow.camera;
            cam.left = cam.bottom = -minmax;
            cam.right = cam.top = minmax;

            // Update the camera to focus on the center of the model so the
            // shadow can encapsulate it
            const offset = dirLight.position.clone().sub(dirLight.target.position);
            dirLight.target.position.copy(center);
            dirLight.position.copy(center).add(offset);

            cam.updateProjectionMatrix();

        }

    }

    _scheduleLoad() {

        // if our current model is already what's being requested
        // or has been loaded then early out
        if (this._prevload === `${ this.package }|${ this.urdf }`) return;
        this._prevload = `${ this.package }|${ this.urdf }`;

        // if we're already waiting on a load then early out
        if (this._loadScheduled) return;
        this._loadScheduled = true;

        if (this.robot) {

            this.robot.traverse(c => c.dispose && c.dispose());
            this.robot.parent.remove(this.robot);
            this.robot = null;

        }

        requestAnimationFrame(() => {

            this._loadUrdf(this.package, this.urdf);
            this._loadScheduled = false;

        });

    }

    // Watch the package and urdf field and load the robot model.
    // This should _only_ be called from _scheduleLoad because that
    // ensures the that current robot has been removed
    _loadUrdf(pkg, urdf) {

        this.dispatchEvent(new CustomEvent('urdf-change', { bubbles: true, cancelable: true, composed: true }));

        if (urdf) {

            // Keep track of this request and make
            // sure it doesn't get overwritten by
            // a subsequent one
            this._requestId++;
            const requestId = this._requestId;

            const updateMaterials = mesh => {

                mesh.traverse(c => {

                    if (c.isMesh) {

                        c.castShadow = true;
                        c.receiveShadow = true;

                        if (c.material) {

                            const mats =
                                (Array.isArray(c.material) ? c.material : [c.material])
                                    .map(m => {

                                        if (m instanceof THREE.MeshBasicMaterial) {

                                            m = new THREE.MeshPhongMaterial();

                                        }

                                        if (m.map) {

                                            m.map.colorSpace = THREE.SRGBColorSpace;

                                        }

                                        return m;

                                    });
                            c.material = mats.length === 1 ? mats[0] : mats;

                        }

                    }

                });

            };

            if (pkg.includes(':') && (pkg.split(':')[1].substring(0, 2)) !== '//') {
                // E.g. pkg = "pkg_name: path/to/pkg_name, pk2: path2/to/pk2"}

                // Convert pkg(s) into a map. E.g.
                // { "pkg_name": "path/to/pkg_name",
                //   "pk2":      "path2/to/pk2"      }

                pkg = pkg.split(',').reduce((map, value) => {

                    const split = value.split(/:/).filter(x => !!x);
                    const pkgName = split.shift().trim();
                    const pkgPath = split.join(':').trim();
                    map[pkgName] = pkgPath;

                    return map;

                }, {});
            }

            let robot = null;
            const manager = new THREE.LoadingManager();
            manager.onLoad = () => {

                // If another request has come in to load a new
                // robot, then ignore this one
                if (this._requestId !== requestId) {

                    robot.traverse(c => c.dispose && c.dispose());
                    return;

                }

                this.robot = robot;
                this.world.add(robot);
                updateMaterials(robot);

                this._setIgnoreLimits(this.ignoreLimits);
                this._updateCollisionVisibility();

                this.dispatchEvent(new CustomEvent('urdf-processed', { bubbles: true, cancelable: true, composed: true }));
                this.dispatchEvent(new CustomEvent('geometry-loaded', { bubbles: true, cancelable: true, composed: true }));

                this.recenter();

            };

            if (this.urlModifierFunc) {

                manager.setURLModifier(this.urlModifierFunc);

            }

            const loader = new URDFLoader(manager);
            loader.packages = pkg;
            loader.loadMeshCb = this.loadMeshFunc;
            loader.fetchOptions = { mode: 'cors', credentials: 'same-origin' };
            loader.parseCollision = true;
            loader.load(urdf, model => robot = model);

        }

    }

    _updateCollisionVisibility() {

        const showCollision = this.showCollision;
        const collisionMaterial = this._collisionMaterial;
        const robot = this.robot;

        if (robot === null) return;

        const colliders = [];
        robot.traverse(c => {

            if (c.isURDFCollider) {

                c.visible = showCollision;
                colliders.push(c);

            }

        });

        colliders.forEach(coll => {

            coll.traverse(c => {

                if (c.isMesh) {

                    c.raycast = emptyRaycast;
                    c.material = collisionMaterial;
                    c.castShadow = false;

                }

            });

        });

    }

    // Watch the coordinate frame and update the
    // rotation of the scene to match
    _setUp(up) {

        if (!up) up = '+Z';
        up = up.toUpperCase();
        const sign = up.replace(/[^-+]/g, '')[0] || '+';
        const axis = up.replace(/[^XYZ]/gi, '')[0] || 'Z';

        const PI = Math.PI;
        const HALFPI = PI / 2;
        if (axis === 'X') this.world.rotation.set(0, 0, sign === '+' ? HALFPI : -HALFPI);
        if (axis === 'Z') this.world.rotation.set(sign === '+' ? -HALFPI : HALFPI, 0, 0);
        if (axis === 'Y') this.world.rotation.set(sign === '+' ? 0 : PI, 0, 0);

    }

    // Updates the current robot's angles to ignore
    // joint limits or not
    _setIgnoreLimits(ignore, dispatch = false) {

        if (this.robot) {

            Object
                .values(this.robot.joints)
                .forEach(joint => {

                    joint.ignoreLimits = ignore;
                    joint.setJointValue(...joint.jointValue);

                });

        }

        if (dispatch) {

            this.dispatchEvent(new CustomEvent('ignore-limits-change', { bubbles: true, cancelable: true, composed: true }));

        }

    }

};
