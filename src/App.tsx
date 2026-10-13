import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Box,
  Cable,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CircuitBoard,
  Copy,
  Crosshair,
  GripVertical,
  Layers3,
  Maximize2,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Move3D,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Settings2,
  SlidersHorizontal,
  Square,
  Undo2,
  X,
  Zap,
} from "lucide-react";
import ArmScene from "./components/ArmScene";
import Circuit from "./components/Circuit";
import {
  activeJoints,
  circuitIssues,
  clampPose,
  clearance,
  DEFAULT_MODEL,
  exampleWires,
  forward,
  interpolate,
  inverse,
  JOINT_NAMES,
  newProject,
  parseProject,
  pathSafe,
  SIGNAL_PINS,
  type Joint,
  type Model,
  type Pose,
  type Project,
  type Step,
  type Vec3,
} from "./lib/robot";

type Mode = "assembly" | "circuit" | "simulation";
type Playback = "idle" | "running" | "paused" | "finished";
const STORAGE_KEY = "diagramia.project.v1";
const MODES = [
  {
    id: "assembly" as const,
    name: "Ensamblado",
    icon: Box,
    description: "Dale forma a tu idea",
  },
  {
    id: "circuit" as const,
    name: "Circuito",
    icon: Cable,
    description: "Conectá los componentes",
  },
  {
    id: "simulation" as const,
    name: "Simulación",
    icon: Play,
    description: "Probá cómo se mueve",
  },
];
function loadInitial() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return {
      project: stored ? parseProject(JSON.parse(stored)) : newProject(),
      error: "",
    };
  } catch {
    return {
      project: newProject(),
      error: "No pude recuperar el proyecto guardado. Se abrió el ejemplo.",
    };
  }
}
function Slider({
  label,
  value,
  min,
  max,
  unit = "°",
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="slider-field">
      <div>
        <label>{label}</label>
        <span>
          {Math.round(value)}
          <small>{unit}</small>
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step="1"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            "--fill": `${((value - min) / (max - min)) * 100}%`,
          } as React.CSSProperties
        }
      />
      <div className="range-ends">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [initial] = useState(loadInitial);
  const [project, setProject] = useState<Project>(initial.project);
  const projectRef = useRef(project);
  const history = useRef<{ undo: Project[]; redo: Project[] }>({
    undo: [],
    redo: [],
  });
  const [historyVersion, setHistoryVersion] = useState(0);
  const [mode, setMode] = useState<Mode>("assembly");
  const [selected, setSelected] = useState<Joint>("shoulder");
  const [toast, setToast] = useState(initial.error);
  const [saved, setSaved] = useState<"saving" | "saved" | "error">("saving");
  const [showHelp, setShowHelp] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReach, setShowReach] = useState(false);
  const [showPath, setShowPath] = useState(true);
  const [view, setView] = useState<"perspective" | "top">("perspective");
  const [resetCamera, setResetCamera] = useState(0);
  const [playback, setPlayback] = useState<Playback>("idle");
  const [animatedPose, setAnimatedPose] = useState<Pose | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(-1);
  const run = useRef<{ elapsed: number; start: Pose; steps: Step[] }>({
    elapsed: 0,
    start: project.pose,
    steps: project.steps,
  });
  const [target, setTarget] = useState<Vec3>({ x: 220, y: 180, z: 80 });
  const [targetVisible, setTargetVisible] = useState(false);
  const [targetResult, setTargetResult] = useState<
    "none" | "ok" | "unreachable"
  >("none");
  const fileInput = useRef<HTMLInputElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const pose = animatedPose || project.pose;
  const tip = forward(project.model, pose).tip;
  const issues = circuitIssues(project.model, project.wires);
  const clear = clearance(project.model, pose);
  const totalDuration = project.steps.reduce(
    (sum, step) => sum + step.duration,
    0,
  );
  const moving = playback === "running" || playback === "paused";
  const joints = activeJoints(project.model);
  void historyVersion;

  useEffect(() => {
    setSaved("saving");
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
        setSaved("saved");
      } catch {
        setSaved("error");
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [project]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!showHelp && !showTemplates) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowHelp(false);
        setShowTemplates(false);
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), a[href]",
        ) || [],
      );
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keyboard);
      previousFocus?.focus();
    };
  }, [showHelp, showTemplates]);
  useEffect(() => {
    if (playback !== "running") return;
    let frame = 0,
      previousTime = 0;
    const duration = run.current.steps.reduce(
      (sum, step) => sum + step.duration,
      0,
    );
    const tick = (time: number) => {
      if (previousTime) run.current.elapsed += (time - previousTime) / 1000;
      previousTime = time;
      const elapsed = Math.min(run.current.elapsed, duration);
      let remaining = elapsed,
        start = run.current.start;
      for (let i = 0; i < run.current.steps.length; i++) {
        const step = run.current.steps[i];
        if (remaining <= step.duration || i === run.current.steps.length - 1) {
          setAnimatedPose(
            interpolate(
              start,
              step.pose,
              Math.min(1, remaining / step.duration),
            ),
          );
          setCurrentStep(i);
          break;
        }
        remaining -= step.duration;
        start = step.pose;
      }
      setProgress(duration ? elapsed / duration : 0);
      if (elapsed >= duration) {
        setPlayback("finished");
        setToast(
          "Secuencia terminada. Los movimientos y las conexiones son válidos.",
        );
      } else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playback]);

  function resetPlayback() {
    setPlayback("idle");
    setAnimatedPose(null);
    setProgress(0);
    setCurrentStep(-1);
  }
  function update(next: Project, record = true) {
    if (record) {
      history.current.undo = [
        ...history.current.undo.slice(-39),
        projectRef.current,
      ];
      history.current.redo = [];
      setHistoryVersion((v) => v + 1);
    }
    projectRef.current = next;
    setProject(next);
    resetPlayback();
    setTargetResult("none");
    setTargetVisible(false);
    if (!next.model.hasGripper && selected === "gripper") setSelected("elbow");
  }
  function undo(redo = false) {
    const from = redo ? history.current.redo : history.current.undo;
    const to = redo ? history.current.undo : history.current.redo;
    const previous = from.pop();
    if (!previous) return;
    to.push(projectRef.current);
    update(previous, false);
    setHistoryVersion((v) => v + 1);
  }
  function changeModel(model: Model) {
    const wires = model.hasGripper
      ? project.wires
      : project.wires.filter(
          (w) => !w.from.includes(":gripper") && !w.to.startsWith("gripper:"),
        );
    update({ ...project, model, wires, pose: clampPose(project.pose, model) });
  }
  function changePose(joint: Joint, value: number) {
    update({ ...project, pose: { ...project.pose, [joint]: value } });
  }
  function play() {
    if (playback === "running") {
      setPlayback("paused");
      return;
    }
    if (playback === "paused") {
      setPlayback("running");
      return;
    }
    if (issues.length) {
      setToast("Completá las conexiones del circuito antes de simular.");
      setMode("circuit");
      return;
    }
    if (!project.steps.length) {
      setToast("Agregá al menos un movimiento a la secuencia.");
      return;
    }
    if (!pathSafe(project.model, project.pose, project.steps)) {
      setToast(
        "La secuencia excede un límite o se acerca demasiado a la mesa. Revisá las posiciones.",
      );
      return;
    }
    run.current = {
      elapsed: 0,
      start: project.pose,
      steps: structuredClone(project.steps),
    };
    setAnimatedPose(project.pose);
    setProgress(0);
    setCurrentStep(0);
    setPlayback("running");
  }
  function goTarget() {
    const solution = inverse(project.model, target, project.pose.gripper);
    if (!solution || !clearance(project.model, solution)) {
      setTargetResult("unreachable");
      setTargetVisible(true);
      return;
    }
    update({ ...project, pose: solution });
    setTargetResult("ok");
    setTargetVisible(true);
  }
  function addStep() {
    if (project.steps.length >= 30) {
      setToast("Podés agregar hasta 30 movimientos por secuencia.");
      return;
    }
    update({
      ...project,
      pose: { ...pose },
      steps: [
        ...project.steps,
        {
          id: crypto.randomUUID(),
          name: `Movimiento ${project.steps.length + 1}`,
          pose: { ...pose },
          duration: 1.5,
        },
      ],
    });
    setToast("Posición agregada a la secuencia.");
  }
  function exportProject() {
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.name.replace(/[^a-zA-Z0-9áéíóúñ_-]/g, "-").slice(0, 60) || "brazo"}.diagramia.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setShowMenu(false);
    setToast("Proyecto exportado. Podés volver a abrirlo cuando quieras.");
  }
  async function importProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 500_000)
        throw new Error("El archivo supera los 500 KB permitidos.");
      update(parseProject(JSON.parse(await file.text())));
      setToast("Proyecto importado.");
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "No pude abrir el archivo.",
      );
    }
    if (fileInput.current) fileInput.current.value = "";
    setShowMenu(false);
  }
  function template(compact: boolean) {
    const p = newProject();
    p.name = compact ? "Brazo compacto" : "Mi primer brazo";
    if (compact)
      p.model = { ...p.model, upper: 120, forearm: 105, pedestal: 50 };
    update(p);
    setShowTemplates(false);
    setMode("assembly");
    setToast(
      "Plantilla cargada. Podés recuperar el proyecto anterior con Deshacer.",
    );
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await workspace.current?.requestFullscreen();
    } catch {
      setToast("Tu navegador no permite la pantalla completa.");
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          href="#"
          className="brand"
          onClick={(e) => e.preventDefault()}
          aria-label="DiagramIA, taller de robótica"
        >
          <span className="brand-mark">
            <Move3D size={23} strokeWidth={2.2} />
          </span>
          <span>
            Diagram<span className="brand-accent">IA</span>
          </span>
          <span className="beta">BETA</span>
        </a>
        <div className="header-divider" />
        <div className="project-title">
          <input
            aria-label="Nombre del proyecto"
            value={project.name}
            maxLength={80}
            onChange={(e) => update({ ...project, name: e.target.value })}
          />
          <ChevronDown size={14} />
          <span
            className={`saved-status ${saved === "error" ? "save-error" : ""}`}
          >
            <span />
            {saved === "saved"
              ? "Guardado en este navegador"
              : saved === "saving"
                ? "Guardando…"
                : "Sin guardado local"}
          </span>
        </div>
        <div className="header-actions">
          <button className="help-button" onClick={() => setShowHelp(true)}>
            <CircleHelp size={17} />
            <span>Guía rápida</span>
          </button>
          <button className="export-button" onClick={exportProject}>
            <ArrowDownToLine size={16} />
            <span>Exportar proyecto</span>
          </button>
          <div className="menu-wrap">
            <button
              className="icon-button"
              aria-label="Más opciones del proyecto"
              onClick={() => setShowMenu(!showMenu)}
            >
              <MoreHorizontal size={21} />
            </button>
            {showMenu && (
              <div className="dropdown">
                <button onClick={() => fileInput.current?.click()}>
                  <ArrowUpFromLine size={16} />
                  Importar proyecto
                </button>
                <button
                  onClick={() => {
                    setShowTemplates(true);
                    setShowMenu(false);
                  }}
                >
                  <Copy size={16} />
                  Usar una plantilla
                </button>
              </div>
            )}
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void importProject(e.target.files?.[0])}
        />
      </header>

      <div className="intro-row">
        <div>
          <span className="eyebrow">TU TALLER DE ROBÓTICA</span>
          <h1>
            De la idea al movimiento<span>.</span>
          </h1>
          <p>Armá, conectá y probá tu brazo. Un paso a la vez.</p>
        </div>
        <button
          className="template-button"
          onClick={() => setShowTemplates(true)}
        >
          <Layers3 size={17} />
          Explorar plantillas
          <ArrowUpRight size={16} />
        </button>
      </div>

      <nav className="workflow" aria-label="Etapas del proyecto">
        {MODES.map((tab, i) => (
          <button
            key={tab.id}
            className={`workflow-step ${mode === tab.id ? "active" : ""}`}
            onClick={() => {
              setMode(tab.id);
              if (mode !== tab.id) resetPlayback();
            }}
            aria-current={mode === tab.id ? "step" : undefined}
          >
            <span className="step-icon">
              <tab.icon size={18} />
            </span>
            <span className="step-description">
              <span>
                <small>0{i + 1}</small>
                {tab.name}
              </span>
              <em>{tab.description}</em>
            </span>
            {i < 2 && <ChevronRight className="step-chevron" size={17} />}
            {tab.id === "circuit" && !issues.length && (
              <Check className="workflow-check" size={16} />
            )}
          </button>
        ))}
      </nav>

      <main className="studio">
        <aside className="inspector">
          <div className="inspector-heading">
            <h2>
              {mode === "assembly"
                ? "Tu ensamblado"
                : mode === "circuit"
                  ? "Tu circuito"
                  : "Control del brazo"}
            </h2>
            <span>
              {mode === "assembly"
                ? "3 ejes"
                : mode === "circuit"
                  ? "5 V"
                  : "EN VIVO"}
            </span>
          </div>
          {mode === "assembly" && (
            <>
              <div className="inspector-description">
                Un brazo sencillo, con posibilidades enormes.
              </div>
              <div className="components-list">
                {joints.map((joint, i) => (
                  <button
                    key={joint}
                    className={`component-row ${selected === joint ? "selected" : ""}`}
                    onClick={() => setSelected(joint)}
                  >
                    <span className="component-symbol">
                      {joint === "gripper" ? (
                        <GripVertical size={19} />
                      ) : (
                        <Box size={19} />
                      )}
                    </span>
                    <span>
                      <strong>
                        {joint === "base"
                          ? "Base giratoria"
                          : joint === "shoulder"
                            ? "Brazo superior"
                            : joint === "elbow"
                              ? "Antebrazo"
                              : "Pinza"}
                      </strong>
                      <small>
                        {joint === "gripper"
                          ? "Herramienta · abrir y cerrar"
                          : `${JOINT_NAMES[joint]} · articulación ${i + 1}`}
                      </small>
                    </span>
                    <span className="component-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </button>
                ))}
              </div>
              <button
                className={`add-tool ${project.model.hasGripper ? "has-tool" : ""}`}
                onClick={() => {
                  changeModel({
                    ...project.model,
                    hasGripper: !project.model.hasGripper,
                  });
                  if (selected === "gripper") setSelected("elbow");
                }}
              >
                {project.model.hasGripper ? (
                  <Minus size={15} />
                ) : (
                  <Plus size={15} />
                )}
                {project.model.hasGripper ? "Quitar pinza" : "Agregar pinza"}
              </button>
              <div className="panel-section">
                <div className="section-heading">
                  <span>PROPIEDADES</span>
                  <Settings2 size={15} />
                </div>
                <h3>{JOINT_NAMES[selected]}</h3>
                {selected === "shoulder" && (
                  <Slider
                    label="Largo del brazo"
                    value={project.model.upper}
                    min={80}
                    max={280}
                    unit=" mm"
                    onChange={(value) =>
                      changeModel({ ...project.model, upper: value })
                    }
                  />
                )}
                {selected === "elbow" && (
                  <Slider
                    label="Largo del antebrazo"
                    value={project.model.forearm}
                    min={80}
                    max={280}
                    unit=" mm"
                    onChange={(value) =>
                      changeModel({ ...project.model, forearm: value })
                    }
                  />
                )}
                {selected === "base" && (
                  <Slider
                    label="Altura de la base"
                    value={project.model.pedestal}
                    min={40}
                    max={120}
                    unit=" mm"
                    onChange={(value) =>
                      changeModel({ ...project.model, pedestal: value })
                    }
                  />
                )}
                <Slider
                  label={
                    selected === "gripper"
                      ? "Apertura de la pinza"
                      : "Ángulo de la articulación"
                  }
                  value={project.pose[selected]}
                  min={
                    selected === "gripper"
                      ? 0
                      : project.model.limits[selected][0]
                  }
                  max={
                    selected === "gripper"
                      ? 100
                      : project.model.limits[selected][1]
                  }
                  unit={selected === "gripper" ? "%" : "°"}
                  onChange={(value) => changePose(selected, value)}
                />
                {selected !== "gripper" && (
                  <div className="joint-limits">
                    <span>Límites de movimiento</span>
                    <div>
                      {(["mínimo", "máximo"] as const).map((label, i) => (
                        <label key={label}>
                          <small>{label}</small>
                          <span>
                            <input
                              type="number"
                              aria-label={`Ángulo ${label} de ${JOINT_NAMES[selected]}`}
                              value={project.model.limits[selected][i]}
                              min={DEFAULT_MODEL.limits[selected][0]}
                              max={DEFAULT_MODEL.limits[selected][1]}
                              onChange={(e) => {
                                const value = Number(e.target.value),
                                  bounds = DEFAULT_MODEL.limits[selected];
                                if (
                                  !Number.isFinite(value) ||
                                  value < bounds[0] ||
                                  value > bounds[1]
                                )
                                  return;
                                const limits = [
                                  ...project.model.limits[selected],
                                ] as [number, number];
                                limits[i] = value;
                                if (limits[0] < limits[1])
                                  changeModel({
                                    ...project.model,
                                    limits: {
                                      ...project.model.limits,
                                      [selected]: limits,
                                    },
                                  });
                              }}
                            />
                            °
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="tip-card">
                <span>
                  <Zap size={16} />
                  Una idea para empezar
                </span>
                <p>
                  Cambiá el largo del brazo y girá una articulación. La vista se
                  actualiza al instante.
                </p>
              </div>
            </>
          )}

          {mode === "circuit" && (
            <>
              <div className="inspector-description">
                Cada motor necesita energía, tierra y una señal.
              </div>
              <div
                className={`circuit-summary ${issues.length ? "incomplete" : ""}`}
              >
                <span>
                  {issues.length ? (
                    <Cable size={22} />
                  ) : (
                    <CheckCircle2 size={22} />
                  )}
                </span>
                <div>
                  <strong>
                    {issues.length
                      ? "Hay conexiones pendientes"
                      : "Todo está conectado"}
                  </strong>
                  <small>
                    {issues.length
                      ? `${issues.length} conexiones por completar`
                      : `${project.wires.length} conexiones · listo para simular`}
                  </small>
                </div>
              </div>
              <div className="panel-section">
                <div className="section-heading">
                  <span>COMPONENTES</span>
                  <CircuitBoard size={15} />
                </div>
                <div className="circuit-component">
                  <Zap size={18} />
                  <span>
                    Fuente genérica<strong>5 V · corriente no modelada</strong>
                  </span>
                </div>
                <div className="circuit-component">
                  <CircuitBoard size={18} />
                  <span>
                    Controlador genérico
                    <strong>{joints.length} salidas de señal</strong>
                  </span>
                </div>
                {joints.map((j) => (
                  <div key={j} className="circuit-component">
                    <Settings2 size={18} />
                    <span>
                      Servo de {JOINT_NAMES[j].toLowerCase()}
                      <strong>Señal {SIGNAL_PINS[j]} · +5 V · GND</strong>
                    </span>
                  </div>
                ))}
              </div>
              <div className="circuit-actions">
                <button
                  className="secondary-button"
                  onClick={() =>
                    update({ ...project, wires: exampleWires(project.model) })
                  }
                >
                  <Cable size={15} />
                  Conectar automáticamente
                </button>
                <button
                  className="text-button"
                  onClick={() => update({ ...project, wires: [] })}
                >
                  Desconectar todo
                </button>
              </div>
              {issues.length > 0 && (
                <div className="connection-issues">
                  <span>POR COMPLETAR</span>
                  <ul>
                    {issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="tip-card">
                <span>
                  <MousePointer2 size={16} />
                  Conectar es sencillo
                </span>
                <p>
                  Tocá un puerto y después otro del mismo color. Tocá un cable
                  para quitarlo.
                </p>
              </div>
            </>
          )}

          {mode === "simulation" && (
            <>
              <div className="inspector-description">
                Mové cada eje o indicá un punto de destino.
              </div>
              <div className="manual-controls">
                {joints.map((j) => (
                  <Slider
                    key={j}
                    label={JOINT_NAMES[j]}
                    value={pose[j]}
                    min={j === "gripper" ? 0 : project.model.limits[j][0]}
                    max={j === "gripper" ? 100 : project.model.limits[j][1]}
                    unit={j === "gripper" ? "%" : "°"}
                    disabled={moving}
                    onChange={(v) => changePose(j, v)}
                  />
                ))}
              </div>
              <button
                className="secondary-button record-button"
                disabled={moving}
                onClick={addStep}
              >
                <Plus size={16} />
                Guardar esta posición
              </button>
              <div className="panel-section target-section">
                <div className="section-heading">
                  <span>PUNTO DE DESTINO</span>
                  <Crosshair size={15} />
                </div>
                <p>¿Puede llegar hasta acá?</p>
                <div className="coordinate-inputs">
                  {(["x", "y", "z"] as const).map((axis) => (
                    <label key={axis}>
                      {axis.toUpperCase()}
                      <input
                        type="number"
                        aria-label={`Destino ${axis.toUpperCase()}`}
                        value={target[axis]}
                        min={-650}
                        max={650}
                        disabled={moving}
                        onChange={(e) => {
                          setTarget({
                            ...target,
                            [axis]: Math.max(
                              -650,
                              Math.min(650, Number(e.target.value)),
                            ),
                          });
                          setTargetResult("none");
                          setTargetVisible(false);
                        }}
                      />
                    </label>
                  ))}
                </div>
                <span className="coordinate-caption">
                  Milímetros · Y es la altura
                </span>
                <button
                  className="secondary-button"
                  disabled={moving}
                  onClick={goTarget}
                >
                  <Crosshair size={15} />
                  Calcular posición
                </button>
                {targetResult !== "none" && (
                  <div
                    className={`target-result ${targetResult}`}
                    role="status"
                  >
                    {targetResult === "ok"
                      ? "Punto alcanzable. Posición actualizada."
                      : "Fuera del alcance o de los límites. Probá otro punto."}
                  </div>
                )}
              </div>
            </>
          )}
          <div className="inspector-footer">
            <span className="tiny-dot" />
            Ensamblado guiado · componentes genéricos
          </div>
        </aside>

        <div className="workspace-column">
          <div
            ref={workspace}
            className={`workspace ${mode === "circuit" ? "circuit-workspace" : ""}`}
          >
            <div className="viewport-toolbar">
              <div className="view-label">
                <span className="live-dot" />
                {mode === "circuit"
                  ? "DIAGRAMA LÓGICO"
                  : "VISTA DEL ENSAMBLADO"}
                <span className="view-badge">
                  {mode === "circuit" ? "2D" : "3D"}
                </span>
              </div>
              <div className="viewport-actions">
                <button
                  className="icon-button"
                  aria-label="Deshacer"
                  title="Deshacer"
                  disabled={!history.current.undo.length || moving}
                  onClick={() => undo()}
                >
                  <Undo2 size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Rehacer"
                  title="Rehacer"
                  disabled={!history.current.redo.length || moving}
                  onClick={() => undo(true)}
                >
                  <Redo2 size={16} />
                </button>
                <span />
                {mode !== "circuit" && (
                  <button
                    className="icon-button"
                    aria-label="Restablecer vista"
                    title="Restablecer vista"
                    onClick={() => {
                      setView("perspective");
                      setResetCamera((v) => v + 1);
                    }}
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label="Pantalla completa"
                  title="Pantalla completa"
                  onClick={() => void fullscreen()}
                >
                  <Maximize2 size={16} />
                </button>
              </div>
            </div>
            {mode === "circuit" ? (
              <Circuit
                project={project}
                onWires={(wires) => update({ ...project, wires })}
                onPositions={(positions) =>
                  update({ ...project, nodePositions: positions })
                }
                notify={setToast}
              />
            ) : (
              <>
                <ArmScene
                  model={project.model}
                  pose={pose}
                  steps={project.steps}
                  showPath={mode === "simulation" && showPath}
                  showReach={showReach}
                  cameraView={view}
                  resetCamera={resetCamera}
                  selected={selected}
                  target={
                    targetVisible && mode === "simulation" ? target : null
                  }
                />
                <div className="scene-top-label">
                  <span>ENSAMBLADO 01</span>
                  <strong>{project.name || "Brazo sin nombre"}</strong>
                  <small>
                    {joints.length} componentes ·{" "}
                    {joints.length - (project.model.hasGripper ? 1 : 0)} grados
                    de libertad
                  </small>
                </div>
                <div className="scene-view-switch">
                  <button
                    className={view === "perspective" ? "active" : ""}
                    onClick={() => setView("perspective")}
                  >
                    Perspectiva
                  </button>
                  <button
                    className={view === "top" ? "active" : ""}
                    onClick={() => setView("top")}
                  >
                    Superior
                  </button>
                </div>
                <div className="scene-bottom-left">
                  <span>
                    <MousePointer2 size={13} />
                    Arrastrá para girar
                  </span>
                  <span>Scroll para acercar</span>
                </div>
                <div className="scene-axis" aria-label="Ejes de coordenadas">
                  <span className="axis-y">Y</span>
                  <span className="axis-x">X</span>
                  <span className="axis-z">Z</span>
                  <i />
                </div>
                {!clear && (
                  <div className="collision-banner" role="alert">
                    El brazo se acerca demasiado a la mesa. Aumentá su altura.
                  </div>
                )}
                <button
                  className={`reach-toggle ${showReach ? "active" : ""}`}
                  onClick={() => setShowReach(!showReach)}
                >
                  <Crosshair size={14} />
                  {showReach
                    ? "Ocultar alcance máximo"
                    : "Mostrar alcance máximo"}
                </button>
              </>
            )}
            <div className="viewport-status">
              <span>
                <span className={`tiny-dot ${issues.length ? "amber" : ""}`} />
                {issues.length
                  ? "Circuito por completar"
                  : "Circuito conectado"}
              </span>
              <span>
                {mode === "circuit"
                  ? `${project.wires.length} conexiones`
                  : "Escala en milímetros"}
                <span className="status-separator">/</span>
                {mode === "circuit"
                  ? "Puertos compatibles por color"
                  : "Cuadrícula: 40 mm"}
              </span>
            </div>
          </div>

          {mode === "simulation" ? (
            <div className="sequence-panel">
              <div className="sequence-heading">
                <div>
                  <h2>
                    Secuencia de movimientos <span>{project.steps.length}</span>
                  </h2>
                  <p>El brazo recorre las posiciones en este orden.</p>
                </div>
                <button
                  className="icon-button"
                  aria-label="Agregar posición actual"
                  disabled={moving}
                  onClick={addStep}
                >
                  <Plus size={18} />
                </button>
              </div>
              <div className="sequence-items">
                {project.steps.map((step, index) => (
                  <div
                    key={step.id}
                    className={`sequence-item ${currentStep === index ? "current" : ""}`}
                  >
                    <button
                      className="sequence-number"
                      title="Ver esta posición"
                      aria-label={`Ver posición ${index + 1}`}
                      disabled={moving}
                      onClick={() =>
                        update({
                          ...project,
                          pose: clampPose(step.pose, project.model),
                        })
                      }
                    >
                      {String(index + 1).padStart(2, "0")}
                    </button>
                    <div className="sequence-item-text">
                      <input
                        aria-label={`Nombre del movimiento ${index + 1}`}
                        maxLength={60}
                        value={step.name}
                        disabled={moving}
                        onChange={(e) =>
                          update({
                            ...project,
                            steps: project.steps.map((s) =>
                              s.id === step.id
                                ? { ...s, name: e.target.value }
                                : s,
                            ),
                          })
                        }
                      />
                      <span>
                        {Math.round(step.pose.base)}° base ·{" "}
                        {Math.round(step.pose.shoulder)}° hombro ·{" "}
                        {Math.round(step.pose.elbow)}° codo
                        {project.model.hasGripper &&
                          ` · ${Math.round(step.pose.gripper)}% pinza`}
                      </span>
                    </div>
                    <label className="duration-input">
                      <input
                        type="number"
                        aria-label={`Duración del movimiento ${index + 1}`}
                        min="0.2"
                        max="10"
                        step="0.1"
                        value={step.duration}
                        disabled={moving}
                        onChange={(e) => {
                          const duration = Number(e.target.value);
                          if (duration >= 0.2 && duration <= 10)
                            update({
                              ...project,
                              steps: project.steps.map((s) =>
                                s.id === step.id ? { ...s, duration } : s,
                              ),
                            });
                        }}
                      />
                      s
                    </label>
                    <div className="step-buttons">
                      <button
                        className="icon-button"
                        title="Mover antes"
                        aria-label={`Subir movimiento ${index + 1}`}
                        disabled={!index || moving}
                        onClick={() => {
                          const steps = [...project.steps];
                          [steps[index - 1], steps[index]] = [
                            steps[index],
                            steps[index - 1],
                          ];
                          update({ ...project, steps });
                        }}
                      >
                        <ArrowUpFromLine size={13} />
                      </button>
                      <button
                        className="icon-button"
                        title="Eliminar movimiento"
                        aria-label={`Eliminar movimiento ${index + 1}`}
                        disabled={moving}
                        onClick={() =>
                          update({
                            ...project,
                            steps: project.steps.filter(
                              (s) => s.id !== step.id,
                            ),
                          })
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {!project.steps.length && (
                  <p className="empty-sequence">
                    Mové el brazo y guardá tu primera posición.
                  </p>
                )}
              </div>
              <div className="playback-controls">
                <button className="play-button" onClick={play}>
                  {playback === "running" ? (
                    <Pause size={16} />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )}
                  {playback === "running"
                    ? "Pausar"
                    : playback === "paused"
                      ? "Continuar"
                      : "Ejecutar secuencia"}
                </button>
                <button
                  className="icon-button"
                  aria-label="Detener y reiniciar simulación"
                  onClick={resetPlayback}
                >
                  <Square size={15} />
                </button>
                <div
                  className="playback-progress"
                  role="progressbar"
                  aria-label="Avance de la simulación"
                  aria-valuenow={Math.round(progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${progress * 100}%` }} />
                </div>
                <span className="playback-time">
                  {(progress * totalDuration).toFixed(1)} /{" "}
                  {totalDuration.toFixed(1)} s
                </span>
                <label className="path-toggle">
                  <input
                    type="checkbox"
                    checked={showPath}
                    onChange={(e) => setShowPath(e.target.checked)}
                  />
                  Trayectoria
                </label>
              </div>
            </div>
          ) : (
            <div className="next-step-card">
              <span className="next-step-icon">
                {mode === "assembly" ? <Cable size={24} /> : <Play size={24} />}
              </span>
              <div>
                <h3>
                  {mode === "assembly"
                    ? "Cada idea necesita una conexión."
                    : "Dale vida a tu diseño."}
                </h3>
                <p>
                  {mode === "assembly"
                    ? "El circuito de ejemplo ya está preparado. Exploralo o armá el tuyo."
                    : "Probá el alcance y creá una secuencia de movimientos."}
                </p>
              </div>
              <button
                onClick={() =>
                  setMode(mode === "assembly" ? "circuit" : "simulation")
                }
              >
                {mode === "assembly" ? "Ver el circuito" : "Ir a simulación"}
                <ChevronRight size={17} />
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <span>
          <span className="tiny-dot" />
          {playback === "running"
            ? "Simulando movimientos"
            : playback === "paused"
              ? "Simulación en pausa"
              : playback === "finished"
                ? "Secuencia completada"
                : "Tu espacio para experimentar"}
        </span>
        <div className="tool-position">
          <span>POSICIÓN DE LA HERRAMIENTA</span>
          <strong>
            X <b>{tip.x.toFixed(0)}</b>
          </strong>
          <strong>
            Y <b>{tip.y.toFixed(0)}</b>
          </strong>
          <strong>
            Z <b>{tip.z.toFixed(0)}</b>
          </strong>
          <small>mm</small>
        </div>
        <span className="footer-scope">
          Simulación cinemática y lógica
          <SlidersHorizontal size={13} />
        </span>
      </footer>

      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {(showHelp || showTemplates) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setShowHelp(false);
            setShowTemplates(false);
          }}
        >
          <div
            ref={dialog}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Cerrar"
              onClick={() => {
                setShowHelp(false);
                setShowTemplates(false);
              }}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">
              {showTemplates ? "UN PUNTO DE PARTIDA" : "BIENVENIDO A TU TALLER"}
            </span>
            <h2 id="modal-title">
              {showTemplates
                ? "Empezá con una idea."
                : "Tu primer brazo, paso a paso."}
            </h2>
            <p className="modal-intro">
              {showTemplates
                ? "Las plantillas incluyen el ensamblado, el circuito y una secuencia de ejemplo."
                : "No necesitás piezas ni conocimientos de CAD para empezar a explorar."}
            </p>
            {showTemplates ? (
              <div className="template-grid">
                <button onClick={() => template(false)}>
                  <span className="template-visual">
                    <Move3D size={58} strokeWidth={1} />
                  </span>
                  <strong>
                    Brazo explorador
                    <ArrowUpRight size={17} />
                  </strong>
                  <p>180 + 150 mm · 3 ejes y pinza</p>
                  <span className="template-tag">IDEAL PARA EMPEZAR</span>
                </button>
                <button onClick={() => template(true)}>
                  <span className="template-visual compact">
                    <Move3D size={46} strokeWidth={1} />
                  </span>
                  <strong>
                    Brazo compacto
                    <ArrowUpRight size={17} />
                  </strong>
                  <p>120 + 105 mm · 3 ejes y pinza</p>
                  <span className="template-tag">MENOS ESPACIO</span>
                </button>
              </div>
            ) : (
              <>
                <div className="guide-steps">
                  {MODES.map((tab, i) => (
                    <div key={tab.id}>
                      <span>0{i + 1}</span>
                      <div>
                        <h3>{tab.name}</h3>
                        <p>
                          {i === 0
                            ? "Elegí una pieza a la izquierda. Ajustá su largo, posición y límites, y girá la vista arrastrando."
                            : i === 1
                              ? "Conectá alimentación, tierra y señales. El ejemplo ya viene conectado; podés desconectarlo y practicar."
                              : "Mové los ejes, comprobá un punto de destino y guardá posiciones. Ejecutá la secuencia para ver el recorrido."}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="guide-note">
                  <Save size={18} />
                  <p>
                    Tu proyecto se guarda en este navegador. Exportalo como
                    archivo para conservarlo o abrirlo en otro equipo.
                  </p>
                </div>
                <div className="scope-note">
                  <strong>¿Qué evalúa esta versión?</strong>
                  <p>
                    Alcance, ángulos, separación de la mesa y conexiones
                    lógicas. Los movimientos siguen posiciones programadas; no
                    se calculan fuerza, consumo, carga, colisiones entre piezas
                    ni sujeción de objetos.
                  </p>
                </div>
                <button
                  className="play-button guide-start"
                  onClick={() => setShowHelp(false)}
                >
                  Empezar a explorar
                  <ArrowUpRight size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
