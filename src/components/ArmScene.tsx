import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  forward,
  type Model,
  type Pose,
  type Step,
  type Vec3,
} from "../lib/robot";

type Props = {
  model: Model;
  pose: Pose;
  steps: Step[];
  showPath: boolean;
  showReach: boolean;
  cameraView: "perspective" | "top";
  resetCamera: number;
  selected: string;
  target: Vec3 | null;
};
export default function ArmScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  current.current = props;
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFallback(true);
      return;
    }
    setFallback(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor("#f6f6f2", 1);
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Vista tridimensional del brazo robótico. Arrastrá para girar y usá la rueda para acercar.",
    );
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#f6f6f2", 1250, 2400);
    const camera = new THREE.PerspectiveCamera(36, 1, 1, 3000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 250;
    controls.maxDistance = 1500;
    controls.maxPolarAngle = Math.PI / 2 - 0.035;
    controls.target.set(75, 125, 0);
    scene.add(new THREE.HemisphereLight("#ffffff", "#a5a8ad", 2.8));
    const sunlight = new THREE.DirectionalLight("#fff7ef", 4);
    sunlight.position.set(180, 550, 220);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(sunlight.shadow.camera, {
      left: -550,
      right: 550,
      top: 550,
      bottom: -550,
      far: 1200,
    });
    sunlight.shadow.normalBias = 1.5;
    sunlight.shadow.bias = -0.001;
    scene.add(sunlight);
    const fill = new THREE.DirectionalLight("#e5ebff", 2);
    fill.position.set(-400, 250, -250);
    scene.add(fill);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.ShadowMaterial({ opacity: 0.12 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.position.y = -0.5;
    scene.add(floor);
    const grid = new THREE.GridHelper(1600, 40, "#c9cdc8", "#e0e3dd");
    grid.position.y = 0.1;
    scene.add(grid);
    const model = current.current.model;
    const arm = new THREE.Group();
    scene.add(arm);
    const materials = {
      dark: new THREE.MeshStandardMaterial({
        color: "#343e4b",
        metalness: 0.65,
        roughness: 0.3,
      }),
      orange: new THREE.MeshStandardMaterial({
        color: "#f37b45",
        metalness: 0.22,
        roughness: 0.38,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: "#b3bdc4",
        metalness: 0.8,
        roughness: 0.3,
      }),
      rubber: new THREE.MeshStandardMaterial({
        color: "#18212b",
        metalness: 0,
        roughness: 0.7,
      }),
    };
    const mesh = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      parent: THREE.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      const object = new THREE.Mesh(geometry, material);
      object.position.set(x, y, z);
      object.castShadow = true;
      object.receiveShadow = true;
      parent.add(object);
      return object;
    };
    mesh(new THREE.CylinderGeometry(58, 63, 15, 64), materials.dark, arm, 0, 8);
    mesh(
      new THREE.CylinderGeometry(47, 52, 8, 64),
      materials.metal,
      arm,
      0,
      19,
    );
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 4 + (i * Math.PI) / 2;
      mesh(
        new THREE.CylinderGeometry(3.5, 3.5, 3, 12),
        materials.metal,
        arm,
        52 * Math.cos(angle),
        16,
        52 * Math.sin(angle),
      );
    }
    mesh(
      new THREE.CylinderGeometry(34, 40, model.pedestal - 27, 48),
      materials.orange,
      arm,
      0,
      27 + (model.pedestal - 27) / 2,
    );
    const yaw = new THREE.Group();
    yaw.position.y = model.pedestal;
    arm.add(yaw);
    mesh(new THREE.CylinderGeometry(38, 38, 14, 48), materials.dark, yaw);
    const shoulder = new THREE.Group();
    yaw.add(shoulder);
    function joint(parent: THREE.Group, radius: number) {
      const cylinder = mesh(
        new THREE.CylinderGeometry(radius, radius, 38, 48),
        materials.dark,
        parent,
      );
      cylinder.rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) {
        const face = mesh(
          new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, 5, 48),
          materials.metal,
          parent,
          0,
          0,
          side * 21,
        );
        face.rotation.x = Math.PI / 2;
        const cap = mesh(
          new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, 6, 32),
          materials.orange,
          parent,
          0,
          0,
          side * 24,
        );
        cap.rotation.x = Math.PI / 2;
      }
    }
    function link(parent: THREE.Group, length: number, thickness: number) {
      mesh(
        new THREE.BoxGeometry(length - 10, thickness, 27),
        materials.dark,
        parent,
        length / 2,
      );
      for (const side of [-1, 1]) {
        mesh(
          new THREE.BoxGeometry(length - 38, thickness - 5, 3),
          materials.orange,
          parent,
          length / 2,
          0,
          side * 16,
        );
        for (const end of [22, length - 22]) {
          const bolt = mesh(
            new THREE.CylinderGeometry(3, 3, 4, 12),
            materials.metal,
            parent,
            end,
            0,
            side * 19,
          );
          bolt.rotation.x = Math.PI / 2;
        }
      }
    }
    joint(shoulder, 27);
    link(shoulder, model.upper, 32);
    const elbow = new THREE.Group();
    elbow.position.x = model.upper;
    shoulder.add(elbow);
    joint(elbow, 23);
    link(elbow, model.forearm, 24);
    const wrist = new THREE.Group();
    wrist.position.x = model.forearm;
    elbow.add(wrist);
    joint(wrist, 15);
    const fingers: THREE.Object3D[] = [];
    if (model.hasGripper) {
      mesh(new THREE.BoxGeometry(16, 22, 46), materials.dark, wrist, 8);
      for (const side of [-1, 1]) {
        const finger = new THREE.Group();
        wrist.add(finger);
        mesh(new THREE.BoxGeometry(30, 12, 6), materials.metal, finger, 27);
        mesh(
          new THREE.BoxGeometry(7, 14, 9),
          materials.rubber,
          finger,
          39,
          0,
          -side * 2,
        );
        fingers.push(finger);
      }
    }
    const labels: THREE.Sprite[] = [];
    const labelObjects: THREE.Texture[] = [];
    [yaw, yaw, elbow].forEach((parent, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 96;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(48, 48, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e06b3e";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "#26332f";
      ctx.font = "600 40px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), 48, 50);
      const texture = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          depthTest: false,
          transparent: true,
        }),
      );
      sprite.scale.set(30, 30, 1);
      sprite.position.set(0, index === 0 ? -29 : 33, 25);
      parent.add(sprite);
      labels.push(sprite);
      labelObjects.push(texture);
    });
    const reach = new THREE.Group();
    const radius = model.upper + model.forearm + (model.hasGripper ? 38 : 0);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 1, radius + 1, 128),
      new THREE.MeshBasicMaterial({
        color: "#d6ae87",
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.5;
    reach.add(ring);
    scene.add(reach);
    const pathGeometry = new THREE.BufferGeometry();
    const path = new THREE.Line(
      pathGeometry,
      new THREE.LineDashedMaterial({
        color: "#478672",
        dashSize: 5,
        gapSize: 4,
        transparent: true,
        opacity: 0.75,
      }),
    );
    scene.add(path);
    const target = new THREE.Mesh(
      new THREE.SphereGeometry(6, 16, 16),
      new THREE.MeshBasicMaterial({
        color: "#ed6f40",
        transparent: true,
        opacity: 0.8,
      }),
    );
    scene.add(target);
    let lastSteps: Step[] | null = null;
    let lastView = "",
      lastReset = -1;
    let frame: number;
    const size = new ResizeObserver(() => {
      const width = element.clientWidth,
        height = element.clientHeight;
      if (width && height) {
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    });
    size.observe(element);
    function draw() {
      const p = current.current;
      yaw.rotation.y = (-p.pose.base * Math.PI) / 180;
      shoulder.rotation.z = (p.pose.shoulder * Math.PI) / 180;
      elbow.rotation.z = (p.pose.elbow * Math.PI) / 180;
      fingers.forEach((finger, i) => {
        finger.position.z = (i === 0 ? -1 : 1) * (5 + p.pose.gripper * 0.22);
      });
      labels.forEach((label, i) => {
        label.material.opacity =
          p.selected === ["base", "shoulder", "elbow"][i] ? 1 : 0.8;
      });
      reach.visible = p.showReach;
      target.visible = !!p.target;
      if (p.target) target.position.set(p.target.x, p.target.y, p.target.z);
      path.visible = p.showPath;
      if (p.steps !== lastSteps) {
        const points: THREE.Vector3[] = [];
        p.steps.forEach((step, i) => {
          const previous = i ? p.steps[i - 1].pose : step.pose;
          for (let k = 0; k <= 30; k++) {
            const mixed = Object.fromEntries(
              Object.keys(previous).map((key) => [
                key,
                previous[key as keyof Pose] +
                  ((step.pose[key as keyof Pose] -
                    previous[key as keyof Pose]) *
                    k) /
                    30,
              ]),
            ) as Pose;
            const tip = forward(model, mixed).tip;
            points.push(new THREE.Vector3(tip.x, tip.y, tip.z));
          }
        });
        path.geometry.dispose();
        path.geometry = new THREE.BufferGeometry().setFromPoints(points);
        path.computeLineDistances();
        lastSteps = p.steps;
      }
      if (p.cameraView !== lastView || p.resetCamera !== lastReset) {
        controls.target.set(75, 125, 0);
        if (p.cameraView === "top") camera.position.set(0, 950, 0.01);
        else camera.position.set(500, 330, 470);
        controls.update();
        lastView = p.cameraView;
        lastReset = p.resetCamera;
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    }
    draw();
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setFallback(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    return () => {
      cancelAnimationFrame(frame);
      size.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        onContextLost,
      );
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const mats = Array.isArray(object.material)
            ? object.material
            : [object.material];
          mats.forEach((mat) => mat.dispose());
        } else if (object instanceof THREE.Sprite) object.material.dispose();
      });
      labelObjects.forEach((texture) => texture.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [props.model]);

  const points = forward(props.model, props.pose);
  const project = (p: Vec3) =>
    `${320 + p.x * 0.75 - p.z * 0.4},${420 - p.y * 0.9 + p.z * 0.2}`;
  return (
    <div ref={host} className="arm-scene" data-testid="arm-scene">
      {fallback && (
        <div className="scene-fallback">
          <svg
            viewBox="0 0 800 550"
            role="img"
            aria-label="Vista esquemática del brazo"
          >
            <path d="M70 420H730" stroke="#d5d9d1" />
            <polyline
              points={[
                { x: 0, y: 0, z: 0 },
                points.root,
                points.elbow,
                points.wrist,
                points.tip,
              ]
                .map(project)
                .join(" ")}
              fill="none"
              stroke="#ec7646"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {[points.root, points.elbow, points.wrist].map((p, i) => (
              <circle
                key={i}
                cx={320 + p.x * 0.75 - p.z * 0.4}
                cy={420 - p.y * 0.9 + p.z * 0.2}
                r="14"
                fill="#35404b"
              />
            ))}
          </svg>
          <span>Vista esquemática · 3D no disponible en este navegador</span>
        </div>
      )}
    </div>
  );
}
