// Game State
const gameState = {
    isPlaying: false,
    isPaused: false,
    wave: 1,
    maxWaves: 5,
    kills: 0,
    playerHP: 100,
    playerMaxHP: 100,
    enemies: [],
    bullets: [],
    particles: [],
    colliders: [],
    currentWeapon: 0,
    isReloading: false,
    isZoomed: false,
    lastShotTime: 0,
    waveStartTime: 0,
    waveClearTime: 0
};

// Weapon Definitions
const weapons = [
    {
        name: "ASSAULT RIFLE",
        type: "auto",
        damage: 25,
        fireRate: 100,
        magazine: 30,
        ammo: 30,
        reserve: 90,
        maxReserve: 90,
        reloadTime: 2000,
        spread: 0.02,
        pellets: 1,
        zoomFOV: 60
    },
    {
        name: "SHOTGUN",
        type: "semi",
        damage: 18,
        fireRate: 800,
        magazine: 6,
        ammo: 6,
        reserve: 24,
        maxReserve: 24,
        reloadTime: 2500,
        spread: 0.15,
        pellets: 8,
        zoomFOV: 60
    },
    {
        name: "SNIPER RIFLE",
        type: "bolt",
        damage: 90,
        fireRate: 1200,
        magazine: 5,
        ammo: 5,
        reserve: 20,
        maxReserve: 20,
        reloadTime: 3000,
        spread: 0,
        pellets: 1,
        zoomFOV: 25
    }
];

// Three.js Setup
let scene, camera, renderer;
let controls;
let raycaster;
let clock;

// Player Movement
const player = {
    height: 1.8,
    crouchHeight: 1.0,
    sprintSpeed: 15,
    walkSpeed: 8,
    crouchSpeed: 4,
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    canJump: false,
    isCrouching: false,
    isSprinting: false
};

// Map bounds
const MAP_SIZE = 80;
const MAP_HALF = MAP_SIZE / 2;

// Input State
const keys = {
    w: false, a: false, s: false, d: false,
    shift: false, c: false, space: false
};

// Initialize
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111116);
    scene.fog = new THREE.Fog(0x111116, 10, 60);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = player.height;

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    const pointLights = [
        { pos: [-20, 10, -20], color: 0xffaa00 },
        { pos: [20, 10, 20], color: 0x00aaff },
        { pos: [0, 15, 0], color: 0xff3333 }
    ];

    pointLights.forEach(pl => {
        const light = new THREE.PointLight(pl.color, 1, 50);
        light.position.set(...pl.pos);
        light.castShadow = true;
        scene.add(light);
    });

    // Raycaster
    raycaster = new THREE.Raycaster();
    clock = new THREE.Clock();

    // Build Map
    buildMap();

    // Event Listeners
    setupControls();
    
    window.addEventListener('resize', onWindowResize);
    
    // Start Screen Click
    document.getElementById('startScreen').addEventListener('click', startGame);
}

function buildMap() {
    // Floor with tiled material
    const floorGeometry = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 40, 40);
    
    // Create grid pattern
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
    }
    
    const floorTexture = new THREE.CanvasTexture(canvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(MAP_SIZE/10, MAP_SIZE/10);
    
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        map: floorTexture,
        roughness: 0.8,
        metalness: 0.2
    });
    
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Buildings (8)
    const buildingColors = [0x444444, 0x555555, 0x333333, 0x666666];
    for (let i = 0; i < 8; i++) {
        const w = 5 + Math.random() * 5;
        const d = 5 + Math.random() * 5;
        const h = 8 + Math.random() * 15;
        const x = (Math.random() - 0.5) * MAP_SIZE * 0.8;
        const z = (Math.random() - 0.5) * MAP_SIZE * 0.8;
        
        // Keep center clear
        if (Math.abs(x) < 10 && Math.abs(z) < 10) continue;
        
        const geometry = new THREE.BoxGeometry(w, h, d);
        const material = new THREE.MeshStandardMaterial({ 
            color: buildingColors[Math.floor(Math.random() * buildingColors.length)]
        });
        const building = new THREE.Mesh(geometry, material);
        building.position.set(x, h/2, z);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        
        // Add collider
        gameState.colliders.push({
            min: new THREE.Vector3(x - w/2, 0, z - d/2),
            max: new THREE.Vector3(x + w/2, h, z + d/2)
        });
    }

    // Cover Walls (12)
    for (let i = 0; i < 12; i++) {
        const w = 3 + Math.random() * 3;
        const h = 1.5;
        const d = 0.5;
        const x = (Math.random() - 0.5) * MAP_SIZE * 0.9;
        const z = (Math.random() - 0.5) * MAP_SIZE * 0.9;
        
        const geometry = new THREE.BoxGeometry(w, h, d);
        const material = new THREE.MeshStandardMaterial({ color: 0x666666 });
        const wall = new THREE.Mesh(geometry, material);
        wall.position.set(x, h/2, z);
        wall.rotation.y = Math.random() * Math.PI;
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
        
        const cos = Math.cos(wall.rotation.y);
        const sin = Math.sin(wall.rotation.y);
        const hw = w/2, hd = d/2;
        
        gameState.colliders.push({
            min: new THREE.Vector3(x - Math.abs(hw*cos) - Math.abs(hd*sin), 0, z - Math.abs(hw*sin) - Math.abs(hd*cos)),
            max: new THREE.Vector3(x + Math.abs(hw*cos) + Math.abs(hd*sin), h, z + Math.abs(hw*sin) + Math.abs(hd*cos))
        });
    }

    // Crates (10)
    for (let i = 0; i < 10; i++) {
        const s = 1 + Math.random() * 0.5;
        const x = (Math.random() - 0.5) * MAP_SIZE * 0.9;
        const z = (Math.random() - 0.5) * MAP_SIZE * 0.9;
        
        const geometry = new THREE.BoxGeometry(s, s, s);
        const material = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const crate = new THREE.Mesh(geometry, material);
        crate.position.set(x, s/2, z);
        crate.castShadow = true;
        scene.add(crate);
        
        gameState.colliders.push({
            min: new THREE.Vector3(x - s/2, 0, z - s/2),
            max: new THREE.Vector3(x + s/2, s, z + s/2)
        });
    }

    // Map boundaries
    gameState.colliders.push(
        { min: new THREE.Vector3(-MAP_HALF-1, 0, -MAP_HALF), max: new THREE.Vector3(-MAP_HALF, 10, MAP_HALF) },
        { min: new THREE.Vector3(MAP_HALF, 0, -MAP_HALF), max: new THREE.Vector3(MAP_HALF+1, 10, MAP_HALF) },
        { min: new THREE.Vector3(-MAP_HALF, 0, -MAP_HALF-1), max: new THREE.Vector3(MAP_HALF, 10, -MAP_HALF) },
        { min: new THREE.Vector3(-MAP_HALF, 0, MAP_HALF), max: new THREE.Vector3(MAP_HALF, 10, MAP_HALF+1) }
    );
}

function createEnemy(isBoss = false, isFlanker = false) {
    const enemy = {
        mesh: new THREE.Group(),
        hp: isBoss ? 400 : 100,
        maxHP: isBoss ? 400 : 100,
        speed: isBoss ? 6 : (isFlanker ? 10 : 4),
        damage: isBoss ? 25 : 12,
        fireRate: isBoss ? 1000 : 1500,
        lastShot: 0,
        state: 'PATROL',
        target: null,
        patrolTarget: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        isBoss: isBoss,
        isFlanker: isFlanker,
        hasShotgun: false,
        coverTimer: 0,
        animTime: 0
    };

    const scale = isBoss ? 3 : 1;

    // Materials
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffccaa });
    const shirtMat = new THREE.MeshStandardMaterial({ color: isBoss ? 0xff0000 : (isFlanker ? 0x00ff00 : 0x333333) });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.5 * scale, 0.7 * scale, 0.3 * scale);
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.y = 1.1 * scale;
    torso.castShadow = true;
    enemy.mesh.add(torso);
    enemy.torso = torso;

    // Head
    const headGeo = new THREE.BoxGeometry(0.3 * scale, 0.35 * scale, 0.3 * scale);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.7 * scale;
    head.castShadow = true;
    enemy.mesh.add(head);
    enemy.head = head;

    // Arms
    const armGeo = new THREE.BoxGeometry(0.15 * scale, 0.6 * scale, 0.15 * scale);
    
    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.set(-0.4 * scale, 1.1 * scale, 0);
    leftArm.castShadow = true;
    enemy.mesh.add(leftArm);
    enemy.leftArm = leftArm;
    
    const rightArm = new THREE.Mesh(armGeo, skinMat);
    rightArm.position.set(0.4 * scale, 1.1 * scale, 0);
    rightArm.castShadow = true;
    enemy.mesh.add(rightArm);
    enemy.rightArm = rightArm;

    // Legs
    const legGeo = new THREE.BoxGeometry(0.2 * scale, 0.8 * scale, 0.2 * scale);
    
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.15 * scale, 0.4 * scale, 0);
    leftLeg.castShadow = true;
    enemy.mesh.add(leftLeg);
    enemy.leftLeg = leftLeg;
    
    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.15 * scale, 0.4 * scale, 0);
    rightLeg.castShadow = true;
    enemy.mesh.add(rightLeg);
    enemy.rightLeg = rightLeg;

    // HP Bar
    const hpGeo = new THREE.PlaneGeometry(1 * scale, 0.1 * scale);
    const hpMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const hpBar = new THREE.Mesh(hpGeo, hpMat);
    hpBar.position.y = 2.2 * scale;
    hpBar.rotation.x = -Math.PI / 2;
    enemy.mesh.add(hpBar);
    enemy.hpBar = hpBar;

    // Spawn position
    let x, z;
    do {
        x = (Math.random() - 0.5) * MAP_SIZE * 0.9;
        z = (Math.random() - 0.5) * MAP_SIZE * 0.9;
    } while (Math.abs(x) < 15 && Math.abs(z) < 15);
    
    enemy.mesh.position.set(x, 0, z);
    enemy.patrolTarget.set(x + (Math.random() - 0.5) * 10, 0, z + (Math.random() - 0.5) * 10);
    
    scene.add(enemy.mesh);
    
    // Collider
    enemy.collider = {
        min: new THREE.Vector3(-0.3 * scale, 0, -0.3 * scale),
        max: new THREE.Vector3(0.3 * scale, 2 * scale, 0.3 * scale)
    };

    // Wave 3+ shotgun behavior
    if (gameState.wave >= 3 && !isBoss && Math.random() < 0.3) {
        enemy.hasShotgun = true;
        enemy.damage = 8;
    }

    return enemy;
}

function spawnWave() {
    const waveConfigs = [
        { count: 5, slow: true },
        { count: 8, slow: false },
        { count: 12, slow: false, shotgun: true },
        { count: 15, slow: false, flankers: 2 },
        { count: 12, slow: false, boss: true }
    ];

    const config = waveConfigs[gameState.wave - 1];
    
    for (let i = 0; i < config.count; i++) {
        const isFlanker = config.flankers && i < config.flankers;
        const enemy = createEnemy(false, isFlanker);
        if (config.slow) enemy.speed *= 0.7;
        if (config.shotgun) enemy.hasShotgun = true;
        gameState.enemies.push(enemy);
    }

    if (config.boss) {
        const boss = createEnemy(true);
        gameState.enemies.push(boss);
    }

    gameState.waveStartTime = Date.now();
    updateHUD();
}

function setupControls() {
    // Pointer Lock Controls (simplified version for r128)
    const element = document.body;
    
    document.addEventListener('click', () => {
        if (gameState.isPlaying && !gameState.isPaused) {
            element.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === element) {
            gameState.isPaused = false;
        } else {
            gameState.isPaused = true;
        }
    });

    // Mouse look
    let euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const PI_2 = Math.PI / 2;
    
    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === element && gameState.isPlaying) {
            const movementX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
            const movementY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;
            
            euler.setFromQuaternion(camera.quaternion);
            euler.y -= movementX * 0.002;
            euler.x -= movementY * 0.002;
            euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
            camera.quaternion.setFromEuler(euler);
        }
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (keys.hasOwnProperty(key)) keys[key] = true;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = true;
        if (e.code === 'Space') keys.space = true;
        
        // Weapon switch
        if (key >= '1' && key <= '3') {
            switchWeapon(parseInt(key) - 1);
        }
        
        // Reload
        if (key === 'r') reload();
        
        // Crouch toggle
        if (key === 'c') {
            player.isCrouching = !player.isCrouching;
            camera.position.y = player.isCrouching ? player.crouchHeight : player.height;
        }
    });

    document.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (keys.hasOwnProperty(key)) keys[key] = false;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = false;
        if (e.code === 'Space') keys.space = false;
    });

    // Mouse buttons
    document.addEventListener('mousedown', (e) => {
        if (!gameState.isPlaying) return;
        
        if (e.button === 0) { // Left click - fire
            fireWeapon();
        } else if (e.button === 2) { // Right click - zoom
            toggleZoom(true);
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (e.button === 2) {
            toggleZoom(false);
        }
    });

    document.addEventListener('contextmenu', e => e.preventDefault());
}

function switchWeapon(index) {
    if (gameState.isReloading) return;
    gameState.currentWeapon = index;
    updateHUD();
}

function toggleZoom(zoom) {
    const weapon = weapons[gameState.currentWeapon];
    if (weapon.zoomFOV === 60) return; // Only sniper can zoom
    
    gameState.isZoomed = zoom;
    camera.fov = zoom ? weapon.zoomFOV : 75;
    camera.updateProjectionMatrix();
    
    document.getElementById('zoomOverlay').style.display = zoom ? 'block' : 'none';
    document.getElementById('crosshair').style.display = zoom ? 'none' : 'block';
}

function fireWeapon() {
    const weapon = weapons[gameState.currentWeapon];
    const now = Date.now();
    
    if (gameState.isReloading || weapon.ammo <= 0 || now - gameState.lastShotTime < weapon.fireRate) {
        if (weapon.ammo <= 0) reload();
        return;
    }
    
    gameState.lastShotTime = now;
    weapon.ammo--;
    
    // Recoil
    camera.rotation.x -= 0.02;
    
    // Muzzle flash
    createMuzzleFlash();
    
    // Fire ray(s)
    const pellets = weapon.pellets;
    for (let i = 0; i < pellets; i++) {
        const spread = weapon.spread;
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        
        if (spread > 0) {
            direction.x += (Math.random() - 0.5) * spread;
            direction.y += (Math.random() - 0.5) * spread;
            direction.z += (Math.random() - 0.5) * spread;
            direction.normalize();
        }
        
        raycaster.set(camera.position, direction);
        
        // Check enemy hits
        let hit = false;
        for (let j = gameState.enemies.length - 1; j >= 0; j--) {
            const enemy = gameState.enemies[j];
            const enemyBox = new THREE.Box3().setFromObject(enemy.mesh);
            
            if (raycaster.ray.intersectsBox(enemyBox)) {
                hit = true;
                damageEnemy(enemy, weapon.damage, j);
                break;
            }
        }
        
        // Visual tracer
        createTracer(camera.position, direction, hit);
    }
    
    // Auto fire for assault rifle
    if (weapon.type === 'auto' && !gameState.autoFireInterval) {
        gameState.autoFireInterval = setInterval(() => {
            if (keys['mouse'] || gameState.mouseDown) {
                fireWeapon();
            } else {
                clearInterval(gameState.autoFireInterval);
                gameState.autoFireInterval = null;
            }
        }, weapon.fireRate);
    }
    
    updateHUD();
}

function createMuzzleFlash() {
    const flash = new THREE.PointLight(0xffff00, 2, 5);
    flash.position.copy(camera.position);
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    flash.position.add(direction.multiplyScalar(0.5));
    scene.add(flash);
    
    setTimeout(() => scene.remove(flash), 50);
}

function createTracer(start, direction, hit) {
    const end = start.clone().add(direction.multiplyScalar(hit ? 20 : 100));
    
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({ 
        color: hit ? 0xff0000 : 0xffff00,
        transparent: true,
        opacity: 0.8
    });
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    
    setTimeout(() => scene.remove(line), 50);
}

function damageEnemy(enemy, damage, index) {
    enemy.hp -= damage;
    
    // Update HP bar
    const hpPercent = enemy.hp / enemy.maxHP;
    enemy.hpBar.scale.x = Math.max(0, hpPercent);
    enemy.hpBar.material.color.setHSL(hpPercent * 0.3, 1, 0.5);
    
    // Cover chance on hit
    if (enemy.hp > 0 && Math.random() < 0.3) {
        enemy.state = 'COVER';
        enemy.coverTimer = 2000;
        // Find nearest cover
        let nearestDist = Infinity;
        let nearestCover = null;
        gameState.colliders.forEach(col => {
            const center = new THREE.Vector3().addVectors(col.min, col.max).multiplyScalar(0.5);
            const dist = enemy.mesh.position.distanceTo(center);
            if (dist < nearestDist && dist < 20) {
                nearestDist = dist;
                nearestCover = center;
            }
        });
        if (nearestCover) {
            enemy.coverTarget = nearestCover;
        }
    }
    
    if (enemy.hp <= 0) {
        killEnemy(enemy, index);
    }
}

function killEnemy(enemy, index) {
    // Death animation
    enemy.state = 'DEAD';
    enemy.mesh.rotation.x = -Math.PI / 2;
    enemy.mesh.position.y = 0;
    
    // Blood particles
    for (let i = 0; i < 20; i++) {
        createBloodParticle(enemy.mesh.position);
    }
    
    gameState.kills++;
    addKillFeed(enemy.isBoss ? "BOSS ELIMINATED" : "ENEMY ELIMINATED");
    
    setTimeout(() => {
        scene.remove(enemy.mesh);
        gameState.enemies.splice(index, 1);
        checkWaveComplete();
    }, 2000);
}

function createBloodParticle(pos) {
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8B0000 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.position.y += 1;
    mesh.position.x += (Math.random() - 0.5) * 2;
    mesh.position.z += (Math.random() - 0.5) * 2;
    
    const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 5,
        (Math.random() - 0.5) * 5
    );
    
    scene.add(mesh);
    gameState.particles.push({ mesh, velocity, life: 1.0 });
}

function reload() {
    const weapon = weapons[gameState.currentWeapon];
    if (gameState.isReloading || weapon.ammo === weapon.magazine || weapon.reserve === 0) return;
    
    gameState.isReloading = true;
    document.getElementById('reloadIndicator').style.display = 'block';
    
    setTimeout(() => {
        const needed = weapon.magazine - weapon.ammo;
        const available = Math.min(needed, weapon.reserve);
        weapon.ammo += available;
        weapon.reserve -= available;
        gameState.isReloading = false;
        document.getElementById('reloadIndicator').style.display = 'none';
        updateHUD();
    }, weapon.reloadTime);
}

function addKillFeed(message) {
    const feed = document.getElementById('killFeed');
    const msg = document.createElement('div');
    msg.className = 'killMessage';
    msg.textContent = message;
    feed.appendChild(msg);
    
    setTimeout(() => {
        msg.style.opacity = '0';
        setTimeout(() => msg.remove(), 2000);
    }, 2000);
}

function checkWaveComplete() {
    if (gameState.enemies.length === 0) {
        if (gameState.wave >= gameState.maxWaves) {
            missionComplete();
        } else {
            gameState.waveClearTime = Date.now();
            setTimeout(() => {
                gameState.wave++;
                spawnWave();
            }, 5000);
        }
    }
    updateHUD();
}

function updateEnemyAI(delta) {
    const playerPos = camera.position.clone();
    
    gameState.enemies.forEach(enemy => {
        if (enemy.state === 'DEAD') return;
        
        enemy.animTime += delta;
        const dist = enemy.mesh.position.distanceTo(playerPos);
        
        // State machine
        let canSeePlayer = false;
        if (dist < 35) {
            const direction = new THREE.Vector3().subVectors(playerPos, enemy.mesh.position).normalize();
            raycaster.set(enemy.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), direction);
            
            // Check if ray hits player before walls
            let hitDist = dist;
            for (const col of gameState.colliders) {
                const box = new THREE.Box3(col.min, col.max);
                const intersection = raycaster.ray.intersectBox(box, new THREE.Vector3());
                if (intersection) {
                    hitDist = Math.min(hitDist, enemy.mesh.position.distanceTo(intersection));
                }
            }
            canSeePlayer = hitDist >= dist - 1;
        }
        
        // State transitions
        if (enemy.state === 'PATROL') {
            if (canSeePlayer) enemy.state = 'CHASE';
        } else if (enemy.state === 'CHASE') {
            if (!canSeePlayer && dist > 40) enemy.state = 'PATROL';
            else if (dist < 12) enemy.state = 'ATTACK';
        } else if (enemy.state === 'ATTACK') {
            if (dist > 15) enemy.state = 'CHASE';
        } else if (enemy.state === 'COVER') {
            enemy.coverTimer -= delta * 1000;
            if (enemy.coverTimer <= 0) enemy.state = 'CHASE';
        }
        
        // Behavior
        const speed = enemy.speed * delta;
        let moveDir = new THREE.Vector3();
        
        switch(enemy.state) {
            case 'PATROL':
                // Move to patrol target
                moveDir.subVectors(enemy.patrolTarget, enemy.mesh.position);
                moveDir.y = 0;
                if (moveDir.length() < 0.5) {
                    enemy.patrolTarget.set(
                        enemy.mesh.position.x + (Math.random() - 0.5) * 10,
                        0,
                        enemy.mesh.position.z + (Math.random() - 0.5) * 10
                    );
                }
                moveDir.normalize();
                
                // Idle animation
                enemy.mesh.position.y = Math.sin(enemy.animTime * 2) * 0.05;
                break;
                
            case 'CHASE':
                moveDir.subVectors(playerPos, enemy.mesh.position);
                moveDir.y = 0;
                moveDir.normalize();
                
                // Walk animation
                enemy.leftLeg.rotation.x = Math.sin(enemy.animTime * 5) * 0.5;
                enemy.rightLeg.rotation.x = Math.sin(enemy.animTime * 5 + Math.PI) * 0.5;
                break;
                
            case 'ATTACK':
                // Face player
                enemy.mesh.lookAt(playerPos.x, enemy.mesh.position.y, playerPos.z);
                
                // Attack animation
                enemy.rightArm.rotation.x = -Math.PI / 2 + Math.sin(enemy.animTime * 10) * 0.2;
                
                // Fire
                if (Date.now() - enemy.lastShot > enemy.fireRate) {
                    enemy.lastShot = Date.now();
                    
                    // Red tracer
                    const tracerGeo = new THREE.BufferGeometry().setFromPoints([
                        enemy.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
                        playerPos
                    ]);
                    const tracerMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
                    const tracer = new THREE.Line(tracerGeo, tracerMat);
                    scene.add(tracer);
                    setTimeout(() => scene.remove(tracer), 100);
                    
                    // Damage player
                    damagePlayer(enemy.damage);
                }
                return; // Don't move while attacking
                
            case 'COVER':
                if (enemy.coverTarget) {
                    moveDir.subVectors(enemy.coverTarget, enemy.mesh.position);
                    moveDir.y = 0;
                    moveDir.normalize();
                }
                break;
        }
        
        // Move with collision
        if (moveDir.length() > 0) {
            const newPos = enemy.mesh.position.clone().add(moveDir.multiplyScalar(speed));
            
            // Check collisions
            let canMove = true;
            const enemyBox = {
                min: new THREE.Vector3(newPos.x - 0.3, 0, newPos.z - 0.3),
                max: new THREE.Vector3(newPos.x + 0.3, 2, newPos.z + 0.3)
            };
            
            for (const col of gameState.colliders) {
                if (checkAABB(enemyBox, col)) {
                    canMove = false;
                    break;
                }
            }
            
            // Check other enemies
            for (const other of gameState.enemies) {
                if (other === enemy) continue;
                const otherBox = {
                    min: new THREE.Vector3(other.mesh.position.x - 0.3, 0, other.mesh.position.z - 0.3),
                    max: new THREE.Vector3(other.mesh.position.x + 0.3, 2, other.mesh.position.z + 0.3)
                };
                if (checkAABB(enemyBox, otherBox)) {
                    canMove = false;
                    break;
                }
            }
            
            if (canMove) {
                enemy.mesh.position.copy(newPos);
                enemy.mesh.lookAt(newPos.x + moveDir.x, enemy.mesh.position.y, newPos.z + moveDir.z);
            }
        }
        
        // HP bar always face camera
        enemy.hpBar.lookAt(camera.position);
    });
}

function checkAABB(a, b) {
    return (a.min.x <= b.max.x && a.max.x >= b.min.x) &&
           (a.min.y <= b.max.y && a.max.y >= b.min.y) &&
           (a.min.z <= b.max.z && a.max.z >= b.min.z);
}

function damagePlayer(amount) {
    gameState.playerHP -= amount;
    if (gameState.playerHP < 0) gameState.playerHP = 0;
    
    // Vignette flash
    const vignette = document.getElementById('damageVignette');
    vignette.style.opacity = '1';
    setTimeout(() => vignette.style.opacity = '0', 200);
    
    updateHUD();
    
    if (gameState.playerHP <= 0) {
        missionFailed();
    }
}

function updatePlayerMovement(delta) {
    if (!gameState.isPlaying || gameState.isPaused) return;
    
    player.velocity.x -= player.velocity.x * 10.0 * delta;
    player.velocity.z -= player.velocity.z * 10.0 * delta;
    player.velocity.y -= 30.0 * delta; // Gravity
    
    player.direction.z = Number(keys.w) - Number(keys.s);
    player.direction.x = Number(keys.d) - Number(keys.a);
    player.direction.normalize();
    
    player.isSprinting = keys.shift && !player.isCrouching;
    const speed = player.isCrouching ? player.crouchSpeed : (player.isSprinting ? player.sprintSpeed : player.walkSpeed);
    
    if (keys.w || keys.s) player.velocity.z -= player.direction.z * speed * 10.0 * delta;
    if (keys.a || keys.d) player.velocity.x -= player.direction.x * speed * 10.0 * delta;
    
    // Apply movement with collision
    const controls_obj = camera;
    const newPos = controls_obj.position.clone();
    
    // X movement
    newPos.x -= player.velocity.x * delta;
    if (!checkPlayerCollision(newPos)) {
        controls_obj.position.x = newPos.x;
    } else {
        player.velocity.x = 0;
    }
    
    // Z movement
    newPos.copy(controls_obj.position);
    newPos.z -= player.velocity.z * delta;
    if (!checkPlayerCollision(newPos)) {
        controls_obj.position.z = newPos.z;
    } else {
        player.velocity.z = 0;
    }
    
    // Y movement (gravity/jump)
    newPos.copy(controls_obj.position);
    newPos.y += player.velocity.y * delta;
    
    if (newPos.y <= (player.isCrouching ? player.crouchHeight : player.height)) {
        player.velocity.y = 0;
        newPos.y = player.isCrouching ? player.crouchHeight : player.height;
        player.canJump = true;
    }
    
    if (keys.space && player.canJump) {
        player.velocity.y += 10;
        player.canJump = false;
    }
    
    controls_obj.position.y = newPos.y;
    
    // Map bounds
    controls_obj.position.x = Math.max(-MAP_HALF + 1, Math.min(MAP_HALF - 1, controls_obj.position.x));
    controls_obj.position.z = Math.max(-MAP_HALF + 1, Math.min(MAP_HALF - 1, controls_obj.position.z));
}

function checkPlayerCollision(pos) {
    const playerBox = {
        min: new THREE.Vector3(pos.x - 0.3, pos.y - (player.isCrouching ? player.crouchHeight : player.height), pos.z - 0.3),
        max: new THREE.Vector3(pos.x + 0.3, pos.y, pos.z + 0.3)
    };
    
    for (const col of gameState.colliders) {
        if (checkAABB(playerBox, col)) return true;
    }
    return false;
}

function updateParticles(delta) {
    for (let i = gameState.particles.length - 1; i >= 0; i--) {
        const p = gameState.particles[i];
        p.life -= delta * 2;
        p.velocity.y -= 9.8 * delta;
        p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
        p.mesh.rotation.x += delta;
        p.mesh.rotation.y += delta;
        
        if (p.life <= 0 || p.mesh.position.y < 0) {
            scene.remove(p.mesh);
            gameState.particles.splice(i, 1);
        }
    }
}

function updateMinimap() {
    const canvas = document.getElementById('minimap');
    const ctx = canvas.getContext('2d');
    canvas.width = 120;
    canvas.height = 120;
    
    // Clear
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, 120, 120);
    
    const scale = 120 / MAP_SIZE;
    const offsetX = 60;
    const offsetZ = 60;
    
    // Buildings (gray)
    ctx.fillStyle = '#666';
    gameState.colliders.forEach(col => {
        if (col.max.y > 2) { // Only buildings, not crates
            const x = col.min.x * scale + offsetX;
            const y = col.min.z * scale + offsetZ;
            const w = (col.max.x - col.min.x) * scale;
            const h = (col.max.z - col.min.z) * scale;
            ctx.fillRect(x, y, w, h);
        }
    });
    
    // Player (white dot)
    const px = camera.position.x * scale + offsetX;
    const pz = camera.position.z * scale + offsetZ;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, pz, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Player direction
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.lineTo(px + dir.x * 10, pz + dir.z * 10);
    ctx.stroke();
    
    // Enemies (red dots)
    ctx.fillStyle = '#f00';
    gameState.enemies.forEach(enemy => {
        if (enemy.state !== 'DEAD') {
            const ex = enemy.mesh.position.x * scale + offsetX;
            const ez = enemy.mesh.position.z * scale + offsetZ;
            ctx.beginPath();
            ctx.arc(ex, ez, enemy.isBoss ? 5 : 2, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function updateHUD() {
    // Health
    const hpPercent = (gameState.playerHP / gameState.playerMaxHP) * 100;
    document.getElementById('healthBar').style.width = hpPercent + '%';
    document.getElementById('healthText').textContent = `${gameState.playerHP}/${gameState.playerMaxHP}`;
    
    // Wave info
    document.getElementById('waveNumber').textContent = `WAVE ${gameState.wave}`;
    document.getElementById('enemiesRemaining').textContent = `Enemies: ${gameState.enemies.filter(e => e.state !== 'DEAD').length}`;
    
    // Ammo
    const weapon = weapons[gameState.currentWeapon];
    document.getElementById('weaponName').textContent = weapon.name;
    document.getElementById('currentAmmo').textContent = weapon.ammo;
    document.getElementById('reserveAmmo').textContent = weapon.reserve;
}

function startGame() {
    document.getElementById('startScreen').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    
    gameState.isPlaying = true;
    spawnWave();
    
    animate();
}

function missionFailed() {
    gameState.isPlaying = false;
    document.exitPointerLock();
    document.getElementById('hud').style.display = 'none';
    document.getElementById('missionFailed').style.display = 'flex';
    document.getElementById('finalStatsFail').textContent = `Kills: ${gameState.kills} | Wave: ${gameState.wave}`;
}

function missionComplete() {
    gameState.isPlaying = false;
    document.exitPointerLock();
    document.getElementById('hud').style.display = 'none';
    document.getElementById('missionComplete').style.display = 'flex';
    document.getElementById('finalStatsWin').textContent = `Total Kills: ${gameState.kills}`;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    if (!gameState.isPlaying) return;
    
    const delta = Math.min(clock.getDelta(), 0.1);
    
    updatePlayerMovement(delta);
    updateEnemyAI(delta);
    updateParticles(delta);
    updateMinimap();
    
    renderer.render(scene, camera);
}

// Start
init();