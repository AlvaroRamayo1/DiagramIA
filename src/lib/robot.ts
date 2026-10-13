export type Joint = "base" | "shoulder" | "elbow" | "gripper";
export type Pose = Record<Joint, number>;
export type Vec3 = { x: number; y: number; z: number };
export type Model = {
  upper: number;
  forearm: number;
  pedestal: number;
  hasGripper: boolean;
  limits: Record<"base" | "shoulder" | "elbow", [number, number]>;
};
export type Wire = { from: string; to: string };
export type Step = { id: string; name: string; pose: Pose; duration: number };
export type Project = {
  version: 1;
  name: string;
  model: Model;
  pose: Pose;
  wires: Wire[];
  steps: Step[];
  nodePositions: Record<string, { x: number; y: number }>;
};
export const JOINT_NAMES: Record<Joint, string> = {
  base: "Base",
  shoulder: "Hombro",
  elbow: "Codo",
  gripper: "Pinza",
};
export const DEFAULT_MODEL: Model = {
  upper: 180,
  forearm: 150,
  pedestal: 65,
  hasGripper: true,
  limits: { base: [-150, 150], shoulder: [-15, 140], elbow: [-150, 0] },
};
export const DEFAULT_POSE: Pose = {
  base: 25,
  shoulder: 68,
  elbow: -88,
  gripper: 65,
};
export const SERVO_IDS: Joint[] = ["base", "shoulder", "elbow", "gripper"];
export const SIGNAL_PINS: Record<Joint, string> = {
  base: "D3",
  shoulder: "D5",
  elbow: "D6",
  gripper: "D9",
};
const rad = (degrees: number) => (degrees * Math.PI) / 180;
const deg = (radians: number) => (radians * 180) / Math.PI;

export function activeJoints(model: Model): Joint[] {
  return model.hasGripper ? SERVO_IDS : SERVO_IDS.slice(0, 3);
}
export function clampPose(pose: Pose, model: Model): Pose {
  const next = { ...pose, gripper: Math.max(0, Math.min(100, pose.gripper)) };
  for (const joint of ["base", "shoulder", "elbow"] as const) {
    const [min, max] = model.limits[joint];
    next[joint] = Math.max(min, Math.min(max, pose[joint]));
  }
  return next;
}
export function poseFits(pose: Pose, model: Model): boolean {
  return activeJoints(model).every((joint) => {
    const limits = joint === "gripper" ? [0, 100] : model.limits[joint];
    return (
      Number.isFinite(pose[joint]) &&
      pose[joint] >= limits[0] &&
      pose[joint] <= limits[1]
    );
  });
}
export function forward(model: Model, pose: Pose) {
  const yaw = rad(pose.base),
    shoulder = rad(pose.shoulder),
    elbow = rad(pose.elbow);
  const point = (r: number, y: number): Vec3 => ({
    x: r * Math.cos(yaw),
    y,
    z: r * Math.sin(yaw),
  });
  const root = point(0, model.pedestal);
  const elbowPoint = point(
    model.upper * Math.cos(shoulder),
    model.pedestal + model.upper * Math.sin(shoulder),
  );
  const wrist = point(
    model.upper * Math.cos(shoulder) +
      model.forearm * Math.cos(shoulder + elbow),
    elbowPoint.y + model.forearm * Math.sin(shoulder + elbow),
  );
  const toolLength = model.hasGripper ? 38 : 0;
  const tip = point(
    model.upper * Math.cos(shoulder) +
      (model.forearm + toolLength) * Math.cos(shoulder + elbow),
    elbowPoint.y + (model.forearm + toolLength) * Math.sin(shoulder + elbow),
  );
  return { root, elbow: elbowPoint, wrist, tip };
}
export function inverse(
  model: Model,
  target: Vec3,
  gripper: number,
): Pose | null {
  const radius = Math.hypot(target.x, target.z);
  const height = target.y - model.pedestal;
  const lower = model.forearm + (model.hasGripper ? 38 : 0);
  const cosine =
    (radius ** 2 + height ** 2 - model.upper ** 2 - lower ** 2) /
    (2 * model.upper * lower);
  if (cosine < -1 - 1e-9 || cosine > 1 + 1e-9) return null;
  // Try both radial directions: the arm can fold behind its rotating base.
  for (const signedRadius of [radius, -radius]) {
    for (const elbow of [
      -Math.acos(Math.max(-1, Math.min(1, cosine))),
      Math.acos(Math.max(-1, Math.min(1, cosine))),
    ]) {
      const shoulder =
        Math.atan2(height, signedRadius) -
        Math.atan2(
          lower * Math.sin(elbow),
          model.upper + lower * Math.cos(elbow),
        );
      let yaw =
        deg(Math.atan2(target.z, target.x)) + (signedRadius < 0 ? 180 : 0);
      yaw = ((((yaw + 180) % 360) + 360) % 360) - 180;
      const pose = {
        base: yaw,
        shoulder: deg(shoulder),
        elbow: deg(elbow),
        gripper,
      };
      if (poseFits(pose, model) && target.y >= 16) return pose;
    }
  }
  return null;
}
export function clearance(model: Model, pose: Pose): boolean {
  const { elbow, wrist, tip } = forward(model, pose);
  // Conservative clearance for the modeled link thickness and gripper fingers.
  return Math.min(elbow.y, wrist.y, tip.y) >= 16;
}
export function interpolate(a: Pose, b: Pose, t: number): Pose {
  const eased = t * t * (3 - 2 * t);
  return Object.fromEntries(
    SERVO_IDS.map((j) => [j, a[j] + (b[j] - a[j]) * eased]),
  ) as Pose;
}
export function pathSafe(model: Model, start: Pose, steps: Step[]): boolean {
  let from = start;
  for (const step of steps) {
    if (!poseFits(step.pose, model)) return false;
    for (let i = 0; i <= 80; i++) {
      if (!clearance(model, interpolate(from, step.pose, i / 80))) return false;
    }
    from = step.pose;
  }
  return true;
}

export type PortKind = "power" | "ground" | "signal";
export function portInfo(
  id: string,
): { kind: PortKind; direction: "in" | "out" } | null {
  if (typeof id !== "string" || id.split(":").length !== 2) return null;
  const [node, port] = id.split(":");
  if (node === "power" && (port === "vcc" || port === "gnd"))
    return { kind: port === "vcc" ? "power" : "ground", direction: "out" };
  if (node === "controller") {
    if (port === "vcc" || port === "gnd")
      return { kind: port === "vcc" ? "power" : "ground", direction: "in" };
    if (SERVO_IDS.includes(port as Joint))
      return { kind: "signal", direction: "out" };
  }
  if (
    SERVO_IDS.includes(node as Joint) &&
    ["vcc", "gnd", "signal"].includes(port)
  ) {
    return {
      kind: port === "vcc" ? "power" : port === "gnd" ? "ground" : "signal",
      direction: "in",
    };
  }
  return null;
}
export function connection(a: string, b: string): Wire | null {
  const first = portInfo(a),
    second = portInfo(b);
  if (
    !first ||
    !second ||
    first.kind !== second.kind ||
    first.direction === second.direction
  )
    return null;
  const wire =
    first.direction === "out" ? { from: a, to: b } : { from: b, to: a };
  if (
    first.kind === "signal" &&
    wire.from.split(":")[1] !== wire.to.split(":")[0]
  )
    return null;
  return wire;
}
export function exampleWires(model: Model): Wire[] {
  return [
    { from: "power:vcc", to: "controller:vcc" },
    { from: "power:gnd", to: "controller:gnd" },
    ...activeJoints(model).flatMap((j) => [
      { from: "power:vcc", to: `${j}:vcc` },
      { from: "power:gnd", to: `${j}:gnd` },
      { from: `controller:${j}`, to: `${j}:signal` },
    ]),
  ];
}
export function circuitIssues(model: Model, wires: Wire[]): string[] {
  const expected = exampleWires(model);
  return expected
    .filter(
      (w) =>
        !wires.some((actual) => actual.from === w.from && actual.to === w.to),
    )
    .map((w) => {
      const [node, port] = w.to.split(":");
      const label =
        node === "controller" ? "Controlador" : JOINT_NAMES[node as Joint];
      return `${label}: falta ${port === "vcc" ? "alimentación de 5 V" : port === "gnd" ? "tierra (GND)" : `señal ${SIGNAL_PINS[node as Joint]}`}.`;
    });
}
export function newProject(): Project {
  const model = structuredClone(DEFAULT_MODEL);
  return {
    version: 1,
    name: "Mi primer brazo",
    model,
    pose: { ...DEFAULT_POSE },
    wires: exampleWires(model),
    nodePositions: {},
    steps: [
      {
        id: "step-1",
        name: "Acercar",
        pose: { base: -35, shoulder: 45, elbow: -85, gripper: 95 },
        duration: 1.8,
      },
      {
        id: "step-2",
        name: "Cerrar pinza",
        pose: { base: -35, shoulder: 45, elbow: -85, gripper: 15 },
        duration: 0.8,
      },
      {
        id: "step-3",
        name: "Elevar y girar",
        pose: { base: 40, shoulder: 80, elbow: -85, gripper: 15 },
        duration: 2,
      },
      {
        id: "step-4",
        name: "Abrir pinza",
        pose: { base: 40, shoulder: 80, elbow: -85, gripper: 95 },
        duration: 0.8,
      },
    ],
  };
}
export function parseProject(value: unknown): Project {
  const fail = () => {
    throw new Error("El archivo no es un proyecto válido de DiagramIA.");
  };
  if (!value || typeof value !== "object") return fail();
  const p = value as Project;
  if (
    p.version !== 1 ||
    typeof p.name !== "string" ||
    p.name.length > 80 ||
    !p.model ||
    !p.pose ||
    !Array.isArray(p.wires) ||
    !Array.isArray(p.steps)
  )
    return fail();
  const finite = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  if (
    !finite(p.model.upper, 80, 280) ||
    !finite(p.model.forearm, 80, 280) ||
    !finite(p.model.pedestal, 40, 120) ||
    typeof p.model.hasGripper !== "boolean"
  )
    return fail();
  if (!p.model.limits) return fail();
  for (const j of ["base", "shoulder", "elbow"] as const) {
    const l = p.model.limits[j],
      bound = DEFAULT_MODEL.limits[j];
    if (
      !Array.isArray(l) ||
      l.length !== 2 ||
      !finite(l[0], bound[0], bound[1]) ||
      !finite(l[1], bound[0], bound[1]) ||
      l[0] >= l[1]
    )
      return fail();
  }
  if (
    !poseFits(p.pose, p.model) ||
    !SERVO_IDS.every((j) =>
      finite(
        p.pose[j],
        j === "gripper" ? 0 : -180,
        j === "gripper" ? 100 : 180,
      ),
    )
  )
    return fail();
  if (
    p.wires.length > 20 ||
    p.wires.some(
      (w) =>
        !w ||
        !connection(w.from, w.to) ||
        connection(w.from, w.to)?.from !== w.from,
    )
  )
    return fail();
  if (new Set(p.wires.map((w) => w.to)).size !== p.wires.length) return fail();
  if (
    p.steps.length > 30 ||
    p.steps.some(
      (s) =>
        !s ||
        typeof s.id !== "string" ||
        typeof s.name !== "string" ||
        s.name.length > 60 ||
        !finite(s.duration, 0.2, 10) ||
        !s.pose ||
        !SERVO_IDS.every((j) =>
          finite(
            s.pose[j],
            j === "gripper" ? 0 : -180,
            j === "gripper" ? 100 : 180,
          ),
        ),
    )
  )
    return fail();
  if (new Set(p.steps.map((s) => s.id)).size !== p.steps.length) return fail();
  const positions: Project["nodePositions"] = {};
  if (p.nodePositions && typeof p.nodePositions === "object") {
    for (const [key, pos] of Object.entries(p.nodePositions)) {
      if (
        !["power", "controller", ...SERVO_IDS].includes(key) ||
        !pos ||
        !finite(pos.x, 12, 938 - (key === "power" ? 168 : key === "controller" ? 180 : 184)) ||
        !finite(pos.y, 12, 638 - (key === "controller" ? 210 : 126))
      )
        return fail();
      positions[key] = { x: pos.x, y: pos.y };
    }
  }
  // Pick known fields so an imported file cannot inject extra state into the app.
  return {
    version: 1,
    name: p.name,
    model: structuredClone(p.model),
    pose: { ...p.pose },
    wires: p.wires.map((w) => ({ from: w.from, to: w.to })),
    steps: p.steps.map((s) => ({
      id: s.id,
      name: s.name,
      duration: s.duration,
      pose: { ...s.pose },
    })),
    nodePositions: positions,
  };
}
