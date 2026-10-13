import { useRef, useState } from "react";
import {
  activeJoints,
  connection,
  JOINT_NAMES,
  SIGNAL_PINS,
  type Joint,
  type Project,
  type Wire,
} from "../lib/robot";

type Props = {
  project: Project;
  onWires: (wires: Wire[]) => void;
  onPositions: (positions: Project["nodePositions"]) => void;
  notify: (message: string) => void;
};
const COLORS = { vcc: "#d7654c", gnd: "#617080", signal: "#d6a039" };
type Node = {
  id: string;
  name: string;
  caption: string;
  x: number;
  y: number;
  w: number;
  h: number;
  inputs: string[];
  outputs: string[];
};

export default function Circuit({
  project,
  onWires,
  onPositions,
  notify,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const joints = activeJoints(project.model);
  const nodes: Node[] = [
    {
      id: "power",
      name: "Fuente de 5 V",
      caption: "ALIMENTACIÓN",
      x: 44,
      y: 62,
      w: 168,
      h: 126,
      inputs: [],
      outputs: ["vcc", "gnd"],
    },
    {
      id: "controller",
      name: "Controlador",
      caption: "CONTROL LÓGICO",
      x: 285,
      y: 236,
      w: 180,
      h: 210,
      inputs: ["vcc", "gnd"],
      outputs: joints,
    },
    ...joints.map((j, i) => ({
      id: j,
      name: `Servo · ${JOINT_NAMES[j]}`,
      caption: "ACTUADOR",
      x: 704,
      y: 28 + i * 153,
      w: 184,
      h: 126,
      inputs: ["vcc", "gnd", "signal"],
      outputs: [],
    })),
  ].map((node) => ({ ...node, ...project.nodePositions[node.id] }));
  function point(id: string) {
    const [name, port] = id.split(":");
    const node = nodes.find((n) => n.id === name);
    if (!node) return null;
    const output = node.outputs.includes(port);
    const index = (output ? node.outputs : node.inputs).indexOf(port);
    if (index < 0) return null;
    return { x: node.x + (output ? node.w : 0), y: node.y + 65 + index * 27 };
  }
  function selectPort(id: string) {
    if (!pending) {
      setPending(id);
      return;
    }
    if (pending === id) {
      setPending(null);
      return;
    }
    const wire = connection(pending, id);
    if (!wire) {
      notify(
        "Conectá puertos del mismo tipo. Cada señal corresponde a su servo.",
      );
      setPending(id);
      return;
    }
    onWires([...project.wires.filter((w) => w.to !== wire.to), wire]);
    setPending(null);
  }
  function coordinates(event: React.PointerEvent) {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix || !svg.current) return { x: 0, y: 0 };
    const point = svg.current.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  }
  const portName = (port: string) =>
    port === "vcc"
      ? "+5 V"
      : port === "gnd"
        ? "GND"
        : port === "signal"
          ? "Señal"
          : SIGNAL_PINS[port as Joint];
  const portColor = (port: string) =>
    COLORS[port === "vcc" ? "vcc" : port === "gnd" ? "gnd" : "signal"];
  return (
    <div className="circuit-canvas">
      <div className="circuit-instruction">
        {pending
          ? "Ahora seleccioná el puerto de destino"
          : "Arrastrá los bloques. Tocá dos puertos para conectarlos."}
        {pending && (
          <button onClick={() => setPending(null)}>Cancelar conexión</button>
        )}
      </div>
      <svg
        ref={svg}
        viewBox="0 0 950 650"
        role="group"
        aria-label="Editor del circuito lógico"
        onPointerMove={(event) => {
          if (!drag.current) return;
          const p = coordinates(event),
            node = nodes.find((n) => n.id === drag.current!.id)!;
          onPositions({
            ...project.nodePositions,
            [node.id]: {
              x: Math.max(12, Math.min(938 - node.w, p.x - drag.current.dx)),
              y: Math.max(12, Math.min(638 - node.h, p.y - drag.current.dy)),
            },
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <defs>
          <pattern
            id="circuit-dots"
            x="0"
            y="0"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1" fill="#d6dbd2" />
          </pattern>
        </defs>
        <rect width="950" height="650" fill="url(#circuit-dots)" />
        {project.wires.map((wire) => {
          const a = point(wire.from),
            b = point(wire.to);
          if (!a || !b) return null;
          const bend = Math.max(45, Math.abs(b.x - a.x) * 0.4);
          const d = `M${a.x},${a.y} C${a.x + bend},${a.y} ${b.x - bend},${b.y} ${b.x},${b.y}`;
          return (
            <g key={wire.to}>
              <path
                d={d}
                fill="none"
                stroke={portColor(wire.to.split(":")[1])}
                strokeWidth="2"
                opacity="0.75"
              />
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth="12"
                tabIndex={0}
                role="button"
                aria-label={`Eliminar conexión ${wire.from} a ${wire.to}`}
                className="wire-hit"
                onClick={() =>
                  onWires(project.wires.filter((w) => w.to !== wire.to))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Delete")
                    onWires(project.wires.filter((w) => w.to !== wire.to));
                }}
              >
                <title>Tocá para eliminar esta conexión</title>
              </path>
            </g>
          );
        })}
        {nodes.map((node) => (
          <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
            <rect
              width={node.w}
              height={node.h}
              rx="11"
              fill="white"
              stroke="#dce1d8"
              strokeWidth="1.5"
            />
            <rect
              width={node.w}
              height="44"
              rx="11"
              fill={
                node.id === "controller"
                  ? "#e7eee7"
                  : node.id === "power"
                    ? "#f7eee6"
                    : "#f2f3ef"
              }
            />
            <path
              d={`M0 35H${node.w}V44H0Z`}
              fill={
                node.id === "controller"
                  ? "#e7eee7"
                  : node.id === "power"
                    ? "#f7eee6"
                    : "#f2f3ef"
              }
            />
            <text x="14" y="18" className="node-caption">
              {node.caption}
            </text>
            <text x="14" y="36" className="node-name">
              {node.name}
            </text>
            <rect
              width={node.w}
              height="44"
              rx="11"
              fill="transparent"
              className="node-drag"
              onPointerDown={(event) => {
                const p = coordinates(event);
                drag.current = {
                  id: node.id,
                  dx: p.x - node.x,
                  dy: p.y - node.y,
                };
                svg.current!.setPointerCapture(event.pointerId);
              }}
            >
              <title>Arrastrar {node.name}</title>
            </rect>
            {[false, true].map((output) =>
              (output ? node.outputs : node.inputs).map((port, index) => {
                const id = `${node.id}:${port}`,
                  selected = pending === id;
                return (
                  <g
                    key={id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Puerto ${node.name} ${portName(port)}`}
                    onClick={() => selectPort(id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectPort(id);
                      }
                    }}
                    className="port"
                  >
                    <rect
                      x={output ? node.w - 90 : -12}
                      y={53 + index * 27}
                      width="102"
                      height="24"
                      fill="transparent"
                      pointerEvents="all"
                    />
                    <circle
                      cx={output ? node.w : 0}
                      cy={65 + index * 27}
                      r="12"
                      fill="transparent"
                    />
                    <circle
                      cx={output ? node.w : 0}
                      cy={65 + index * 27}
                      r={selected ? 7 : 5}
                      fill={portColor(port)}
                      stroke={selected ? "#25372e" : "white"}
                      strokeWidth={selected ? 3 : 2}
                    />
                    <text
                      x={output ? node.w - 14 : 14}
                      y={69 + index * 27}
                      textAnchor={output ? "end" : "start"}
                      className="port-label"
                    >
                      {portName(port)}
                    </text>
                  </g>
                );
              }),
            )}
          </g>
        ))}
      </svg>
      <div className="circuit-legend">
        <span>
          <i style={{ background: COLORS.vcc }} />
          Alimentación
        </span>
        <span>
          <i style={{ background: COLORS.gnd }} />
          Tierra común
        </span>
        <span>
          <i style={{ background: COLORS.signal }} />
          Señal de control
        </span>
      </div>
    </div>
  );
}
