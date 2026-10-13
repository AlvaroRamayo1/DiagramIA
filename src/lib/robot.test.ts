import test from "node:test";
import assert from "node:assert/strict";
import {
  circuitIssues,
  clearance,
  clampPose,
  connection,
  DEFAULT_MODEL,
  DEFAULT_POSE,
  exampleWires,
  forward,
  interpolate,
  inverse,
  newProject,
  parseProject,
  pathSafe,
  type Model,
  type Pose,
} from "./robot.ts";

test("forward kinematics includes base height and the tool extension", () => {
  const result = forward(DEFAULT_MODEL, {
    base: 0,
    shoulder: 0,
    elbow: 0,
    gripper: 0,
  });
  assert.deepEqual(result.tip, { x: 368, y: 65, z: 0 });
  assert.deepEqual(result.wrist, { x: 330, y: 65, z: 0 });
  const noTool = forward(
    { ...DEFAULT_MODEL, hasGripper: false },
    { base: 0, shoulder: 0, elbow: 0, gripper: 0 },
  );
  assert.deepEqual(noTool.tip, noTool.wrist);
});

test("inverse kinematics reproduces reachable positions, including a folded arm", () => {
  const poses: Pose[] = [
    DEFAULT_POSE,
    { base: -50, shoulder: 40, elbow: -70, gripper: 10 },
    { base: 80, shoulder: 90, elbow: -110, gripper: 70 },
    { base: 30, shoulder: 130, elbow: -10, gripper: 25 },
  ];
  for (const pose of poses) {
    const target = forward(DEFAULT_MODEL, pose).tip;
    const solved = inverse(DEFAULT_MODEL, target, pose.gripper);
    assert.ok(solved, `No solution for ${JSON.stringify(pose)}`);
    const result = forward(DEFAULT_MODEL, solved).tip;
    assert.ok(
      Math.hypot(
        result.x - target.x,
        result.y - target.y,
        result.z - target.z,
      ) < 1e-6,
    );
    assert.equal(solved.gripper, pose.gripper);
  }
});

test("unreachable, below-floor and joint-restricted targets are rejected", () => {
  assert.equal(inverse(DEFAULT_MODEL, { x: 600, y: 100, z: 0 }, 50), null);
  assert.equal(inverse(DEFAULT_MODEL, { x: 200, y: 0, z: 0 }, 50), null);
  const model: Model = {
    ...DEFAULT_MODEL,
    limits: { ...DEFAULT_MODEL.limits, base: [-10, 10] },
  };
  assert.equal(inverse(model, { x: 0, y: 200, z: 200 }, 50), null);
});

test("model limits clamp all three axes and the gripper opening", () => {
  assert.deepEqual(
    clampPose(
      { base: 220, shoulder: -60, elbow: 50, gripper: 160 },
      DEFAULT_MODEL,
    ),
    { base: 150, shoulder: -15, elbow: 0, gripper: 100 },
  );
});

test("circuit needs power, common ground, and the matching signal for every actuator", () => {
  const wires = exampleWires(DEFAULT_MODEL);
  assert.equal(wires.length, 14);
  assert.deepEqual(circuitIssues(DEFAULT_MODEL, wires), []);
  assert.equal(
    circuitIssues(
      DEFAULT_MODEL,
      wires.filter((w) => w.to !== "shoulder:gnd"),
    ).length,
    1,
  );
  assert.match(
    circuitIssues(
      DEFAULT_MODEL,
      wires.filter((w) => w.to !== "shoulder:signal"),
    )[0],
    /D5/,
  );
  assert.equal(circuitIssues(DEFAULT_MODEL, []).length, 14);
  const bare = { ...DEFAULT_MODEL, hasGripper: false };
  assert.equal(exampleWires(bare).length, 11);
  assert.deepEqual(circuitIssues(bare, exampleWires(bare)), []);
});

test("wiring rejects incompatible ports, output-to-output, and crossed servo signals", () => {
  assert.equal(connection("power:vcc", "base:gnd"), null);
  assert.equal(connection("power:gnd", "power:vcc"), null);
  assert.equal(connection("controller:base", "shoulder:signal"), null);
  assert.equal(connection("unknown:pin", "base:signal"), null);
  assert.equal(connection("power:vcc:extra", "base:vcc"), null);
  assert.deepEqual(connection("base:signal", "controller:base"), {
    from: "controller:base",
    to: "base:signal",
  });
  assert.deepEqual(connection("power:gnd", "controller:gnd"), {
    from: "power:gnd",
    to: "controller:gnd",
  });
});

test("default sequence is clear of the table and invalid motions are blocked", () => {
  const project = newProject();
  assert.equal(pathSafe(project.model, project.pose, project.steps), true);
  const floorPose = { base: 0, shoulder: -15, elbow: -60, gripper: 50 };
  assert.equal(clearance(DEFAULT_MODEL, floorPose), false);
  assert.equal(
    pathSafe(project.model, project.pose, [
      { id: "bad", name: "Mesa", pose: floorPose, duration: 1 },
    ]),
    false,
  );
  assert.equal(
    pathSafe(project.model, project.pose, [
      {
        id: "limit",
        name: "Límite",
        pose: { ...DEFAULT_POSE, base: 180 },
        duration: 1,
      },
    ]),
    false,
  );
});

test("interpolation reaches both endpoints and does not jump on pause/resume", () => {
  const a = DEFAULT_POSE,
    b = newProject().steps[0].pose;
  assert.deepEqual(interpolate(a, b, 0), a);
  assert.deepEqual(interpolate(a, b, 1), b);
  const halfway = interpolate(a, b, 0.5);
  assert.equal(halfway.base, (a.base + b.base) / 2);
});

test("project files round-trip without accepting corrupt or duplicated wiring", () => {
  const project = newProject();
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
  assert.throws(() => parseProject({ ...project, version: 9 }));
  assert.throws(() =>
    parseProject({ ...project, model: { ...project.model, upper: -1 } }),
  );
  assert.throws(() =>
    parseProject({ ...project, wires: [...project.wires, project.wires[0]] }),
  );
  assert.throws(() =>
    parseProject({ ...project, steps: [{ ...project.steps[0], duration: 0 }] }),
  );
  assert.throws(() =>
    parseProject({ ...project, steps: [project.steps[0], project.steps[0]] }),
  );
  assert.throws(() =>
    parseProject({
      ...project,
      nodePositions: { controller: { x: Infinity, y: 0 } },
    }),
  );
  assert.throws(() => parseProject({ ...project, nodePositions: { controller: { x: 850, y: 600 } } }));
});
