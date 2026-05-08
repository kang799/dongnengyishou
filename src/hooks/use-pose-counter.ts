import { useCallback, useEffect, useRef, useState } from "react";

export type ExerciseType = "squat" | "pushup" | "situp";

type Landmark = { x: number; y: number; z: number; visibility?: number };

export type SquatPhase =
  | "idle"
  | "calibrating-stand"
  | "calibrating-squat"
  | "ready"
  | "down"
  | "up";

export type PoseStatus = {
  phase: SquatPhase;
  message: string;
  progress: number; // 0-1, how far between standing and squat baseline
  shoulderVisible: boolean;
};

function angle(a: Landmark, b: Landmark, c: Landmark) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magA = Math.hypot(ab.x, ab.y);
  const magC = Math.hypot(cb.x, cb.y);
  const cos = dot / (magA * magC + 1e-6);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

// 模块级缓存：模型只加载一次，整个会话复用
let landmarkerPromise: Promise<any> | null = null;
function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
      );
      const modelAssetPath =
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
      const common = {
        runningMode: "VIDEO" as const,
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };
      try {
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath, delegate: "CPU" },
          ...common,
        });
      } catch (cpuErr) {
        console.warn("PoseLandmarker CPU failed, fallback to GPU", cpuErr);
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath, delegate: "GPU" },
          ...common,
        });
      }
    })().catch((e) => {
      landmarkerPromise = null;
      throw e;
    });
  }
  return landmarkerPromise;
}

// 暴露给 UI 提前预热（点入页面就开始下载，启动时无延迟）
export function preloadPoseModel() {
  void getLandmarker();
}

export function usePoseCounter(exercise: ExerciseType, active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PoseStatus>({
    phase: "idle",
    message: "等待启动",
    progress: 0,
    shoulderVisible: false,
  });
  const stateRef = useRef<"up" | "down">("up");
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraPromiseRef = useRef<Promise<boolean> | null>(null);
  const cameraGenerationRef = useRef(0);
  const exerciseRef = useRef<ExerciseType>(exercise);
  const stableRef = useRef({ down: 0, up: 0 });
  const smoothAnglesRef = useRef<Record<string, number>>({});
  const lastCountAtRef = useRef(0);
  // 校准状态：站立 y / 下蹲 y
  const standYRef = useRef<number | null>(null);
  const squatYRef = useRef<number | null>(null);
  const calibPhaseRef = useRef<SquatPhase>("calibrating-stand");
  const calibSamplesRef = useRef(0);
  const calibStartAtRef = useRef(0);
  const lastSeenAtRef = useRef(0);
  const busyRef = useRef(false);
  const statusRef = useRef<PoseStatus>({
    phase: "idle",
    message: "等待启动",
    progress: 0,
    shoulderVisible: false,
  });

  const updateStatus = useCallback((next: Partial<PoseStatus>) => {
    const merged = { ...statusRef.current, ...next };
    if (
      merged.phase === statusRef.current.phase &&
      merged.message === statusRef.current.message &&
      Math.abs(merged.progress - statusRef.current.progress) < 0.02 &&
      merged.shoulderVisible === statusRef.current.shoulderVisible
    ) return;
    statusRef.current = merged;
    setStatus(merged);
  }, []);

  // 切换练习只重置计数，不动摄像头/模型
  useEffect(() => {
    exerciseRef.current = exercise;
    setCount(0);
    stateRef.current = "up";
    stableRef.current = { down: 0, up: 0 };
    smoothAnglesRef.current = {};
    lastCountAtRef.current = 0;
    standYRef.current = null;
    squatYRef.current = null;
    calibPhaseRef.current = exercise === "squat" ? "calibrating-stand" : "ready";
    calibSamplesRef.current = 0;
    calibStartAtRef.current = 0;
    if (exercise === "squat") {
      updateStatus({ phase: "calibrating-stand", message: "请正对摄像头站直，保持 2 秒", progress: 0, shoulderVisible: false });
    } else {
      updateStatus({ phase: "ready", message: "可以开始", progress: 0, shoulderVisible: true });
    }
  }, [exercise]);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      setReady(false);
      const existing = streamRef.current;
      if (existing?.getVideoTracks().some((track) => track.readyState === "live")) return true;
      if (cameraPromiseRef.current) return cameraPromiseRef.current;

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("当前浏览器不支持摄像头调用");
        return false;
      }

      const generation = cameraGenerationRef.current;
      cameraPromiseRef.current = navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 480 },
          height: { ideal: 360 },
          frameRate: { ideal: 20, max: 24 },
        },
        audio: false,
      }).then(async (stream) => {
        if (generation !== cameraGenerationRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return false;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          await video.play().catch(() => undefined);
        }
        return true;
      });

      return await cameraPromiseRef.current;
    } catch (e: any) {
      setReady(false);
      setError(e?.name === "NotAllowedError" ? "摄像头权限被拒绝，请允许后重试" : e?.message ?? "无法启用摄像头");
      return false;
    } finally {
      cameraPromiseRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setError(null);
    setReady(false);

    (async () => {
      try {
        const lm = await getLandmarker();
        if (cancelled) return;
        const cameraReady =
          streamRef.current?.getVideoTracks().some((track) => track.readyState === "live") ||
          (await startCamera());
        if (cancelled || !cameraReady) return;
        const video = videoRef.current!;
        if (!video.srcObject) video.srcObject = streamRef.current;
        await video.play().catch(() => undefined);
        setReady(true);

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d") ?? null;
        let lastDraw = 0;
        let lastDetect = 0;

        const loop = () => {
          if (cancelled) return;
          try {
            const now = performance.now();
            // ~10 FPS, 且上一帧还在跑就跳过
            if (!busyRef.current && video.readyState >= 2 && now - lastDetect > 110) {
              lastDetect = now;
              busyRef.current = true;
              try {
                const result = lm.detectForVideo(video, performance.now());
                const lms: Landmark[] | undefined = result?.landmarks?.[0];
                if (lms) {
                  try { detect(exerciseRef.current, lms); } catch (e) { console.warn("detect error", e); }
                  if (ctx && canvas && now - lastDraw > 110) {
                    lastDraw = now;
                    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
                    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = "rgba(176, 47, 32, 0.85)";
                    for (const p of lms) {
                      ctx.beginPath();
                      ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2);
                      ctx.fill();
                    }
                  }
                }
              } finally {
                busyRef.current = false;
              }
            }
          } catch (e) {
            console.warn("pose loop frame error", e);
            busyRef.current = false;
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (e: any) {
        setError(e?.message ?? "无法启用摄像头");
      }
    })();

    return () => {
      cancelled = true;
      cameraGenerationRef.current += 1;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      cameraPromiseRef.current = null;
      const v = videoRef.current;
      if (v) {
        try { v.pause(); } catch {}
        v.srcObject = null;
      }
      setReady(false);
      // 模型保留在缓存中，下一次启动直接复用
    };
  }, [active, startCamera]);

  // 选可见度更高的一侧测角度，过低则返回 null
  function bestAngle(l: Landmark[], rA: number, rB: number, rC: number, lA: number, lB: number, lC: number) {
    const visR = Math.min(l[rA]?.visibility ?? 0, l[rB]?.visibility ?? 0, l[rC]?.visibility ?? 0);
    const visL = Math.min(l[lA]?.visibility ?? 0, l[lB]?.visibility ?? 0, l[lC]?.visibility ?? 0);
    const best = visR >= visL ? { v: visR, a: l[rA], b: l[rB], c: l[rC] } : { v: visL, a: l[lA], b: l[lB], c: l[lC] };
    if (best.v < 0.42) return null;
    return angle(best.a, best.b, best.c);
  }

  function smoothAngle(key: string, value: number) {
    const prev = smoothAnglesRef.current[key];
    const next = prev == null ? value : prev * 0.65 + value * 0.35;
    smoothAnglesRef.current[key] = next;
    return next;
  }

  function confirmPose(target: "up" | "down", matched: boolean) {
    if (!matched) {
      stableRef.current[target] = 0;
      return false;
    }
    stableRef.current[target] += 1;
    return stableRef.current[target] >= 2;
  }

  // 简单时间锁，避免抖动重复计数（每次计数最少间隔 650ms）
  function tryCount() {
    const now = performance.now();
    if (now - lastCountAtRef.current < 650) return false;
    lastCountAtRef.current = now;
    setCount((c) => c + 1);
    return true;
  }

  function detect(ex: ExerciseType, l: Landmark[]) {
    if (ex === "squat") {
      detectSquat(l);
    } else if (ex === "pushup") {
      // 肩-肘-腕
      const rawElbow = bestAngle(l, 12, 14, 16, 11, 13, 15);
      const elbow = rawElbow == null ? null : smoothAngle("elbow", rawElbow);
      if (elbow == null) return;
      // 要求身体大致水平：肩与髋 y 接近
      const shoulderY = ((l[11]?.y ?? 0) + (l[12]?.y ?? 0)) / 2;
      const hipY = ((l[23]?.y ?? 0) + (l[24]?.y ?? 0)) / 2;
      if (Math.abs(shoulderY - hipY) > 0.32) return; // 不是俯卧姿态
      if (stateRef.current === "up" && confirmPose("down", elbow < 108)) {
        stateRef.current = "down";
        stableRef.current.up = 0;
      } else if (stateRef.current === "down" && confirmPose("up", elbow > 150)) {
        stateRef.current = "up";
        stableRef.current.down = 0;
        tryCount();
      }
    } else if (ex === "situp") {
      // 肩-髋-膝
      const rawHip = bestAngle(l, 12, 24, 26, 11, 23, 25);
      const hip = rawHip == null ? null : smoothAngle("hip", rawHip);
      if (hip == null) return;
      if (stateRef.current === "up" && confirmPose("down", hip > 132)) {
        stateRef.current = "down";
        stableRef.current.up = 0;
      } else if (stateRef.current === "down" && confirmPose("up", hip < 88)) {
        stateRef.current = "up";
        stableRef.current.down = 0;
        tryCount();
      }
    }
  }

  // 深蹲：基于用户自身校准的“站立 y”和“下蹲 y”进行计数
  function detectSquat(l: Landmark[]) {
    const lS = l[11], rS = l[12];
    const nose = l[0];
    const sVis = Math.max(lS?.visibility ?? 0, rS?.visibility ?? 0);
    const noseVis = nose?.visibility ?? 0;
    if (sVis < 0.35 && noseVis < 0.35) {
      updateStatus({ shoulderVisible: false, message: "未检测到上半身，请把肩膀放进画面" });
      return;
    }
    // 取肩中心 y；若肩不可见则退回鼻子
    let rawY: number;
    if (sVis >= 0.35 && lS && rS) {
      rawY = ((lS.y) + (rS.y)) / 2;
    } else {
      rawY = nose!.y;
    }
    const y = smoothAngle("squatY", rawY);
    lastSeenAtRef.current = performance.now();

    const phase = calibPhaseRef.current;

    if (phase === "calibrating-stand") {
      if (calibStartAtRef.current === 0) calibStartAtRef.current = performance.now();
      calibSamplesRef.current += 1;
      // 收集 ~2 秒（约 18 帧）取最小 y 当作站立位
      const prev = standYRef.current;
      standYRef.current = prev == null ? y : Math.min(prev, y);
      const elapsed = performance.now() - calibStartAtRef.current;
      const progress = Math.min(1, elapsed / 2000);
      updateStatus({
        phase: "calibrating-stand",
        message: `请站直，正在校准 ${Math.round(progress * 100)}%`,
        progress: 0,
        shoulderVisible: true,
      });
      if (elapsed >= 2000 && calibSamplesRef.current >= 12) {
        calibPhaseRef.current = "calibrating-squat";
        calibStartAtRef.current = performance.now();
        calibSamplesRef.current = 0;
        updateStatus({
          phase: "calibrating-squat",
          message: "请下蹲一次到最低点，并保持 1 秒",
          progress: 0,
          shoulderVisible: true,
        });
      }
      return;
    }

    if (phase === "calibrating-squat") {
      // 取下蹲过程中 y 的最大值（画面下方），需要明显大于站立位
      const stand = standYRef.current ?? y;
      const prev = squatYRef.current;
      squatYRef.current = prev == null ? y : Math.max(prev, y);
      const drop = (squatYRef.current - stand);
      // 至少下沉 3% 画面高度才算有效下蹲
      const ok = drop > 0.03;
      const elapsed = performance.now() - calibStartAtRef.current;
      updateStatus({
        phase: "calibrating-squat",
        message: ok
          ? "保持最低点…"
          : "请明显下蹲，让肩膀往下移动",
        progress: Math.min(1, drop / 0.06),
        shoulderVisible: true,
      });
      if (ok && elapsed >= 1500) {
        calibPhaseRef.current = "ready";
        stateRef.current = "up";
        updateStatus({
          phase: "ready",
          message: "校准完成，开始计数。下蹲到最低点再起立 +1",
          progress: 0,
          shoulderVisible: true,
        });
      }
      return;
    }

    // 正式计数阶段
    const stand = standYRef.current!;
    const squat = squatYRef.current!;
    const range = Math.max(0.02, squat - stand);
    const ratio = Math.max(0, Math.min(1.2, (y - stand) / range));

    // 慢慢更新站立基线（用户站姿可能微调），只在 up 状态且 y 比 stand 还小时
    if (stateRef.current === "up" && y < stand) {
      standYRef.current = stand * 0.7 + y * 0.3;
    }

    const downPose = ratio > 0.65;
    const upPose = ratio < 0.25;

    let phaseLabel: SquatPhase = stateRef.current === "down" ? "down" : "up";
    let msg = stateRef.current === "down" ? "已下蹲，起立计数 +1" : "请下蹲到最低点";
    if (ratio > 0.25 && ratio < 0.65 && stateRef.current === "up") {
      msg = "再蹲低一点";
    }

    if (stateRef.current === "up" && confirmPose("down", downPose)) {
      stateRef.current = "down";
      stableRef.current.up = 0;
      phaseLabel = "down";
      msg = "已下蹲，起立计数 +1";
    } else if (stateRef.current === "down" && confirmPose("up", upPose)) {
      stateRef.current = "up";
      stableRef.current.down = 0;
      phaseLabel = "up";
      msg = "请下蹲到最低点";
      tryCount();
    }

    updateStatus({
      phase: phaseLabel,
      message: msg,
      progress: ratio,
      shoulderVisible: true,
    });
  }

  function reset() {
    setCount(0);
    stateRef.current = "up";
    stableRef.current = { down: 0, up: 0 };
    smoothAnglesRef.current = {};
    lastCountAtRef.current = 0;
    standYRef.current = null;
    squatYRef.current = null;
    calibSamplesRef.current = 0;
    calibStartAtRef.current = 0;
    calibPhaseRef.current = exerciseRef.current === "squat" ? "calibrating-stand" : "ready";
    if (exerciseRef.current === "squat") {
      updateStatus({ phase: "calibrating-stand", message: "请正对摄像头站直，保持 2 秒", progress: 0, shoulderVisible: false });
    } else {
      updateStatus({ phase: "ready", message: "可以开始", progress: 0, shoulderVisible: true });
    }
  }

  function recalibrate() {
    if (exerciseRef.current !== "squat") return;
    standYRef.current = null;
    squatYRef.current = null;
    calibSamplesRef.current = 0;
    calibStartAtRef.current = 0;
    calibPhaseRef.current = "calibrating-stand";
    stateRef.current = "up";
    stableRef.current = { down: 0, up: 0 };
    updateStatus({ phase: "calibrating-stand", message: "请正对摄像头站直，保持 2 秒", progress: 0, shoulderVisible: false });
  }

  return { videoRef, canvasRef, count, ready, error, status, reset, recalibrate, startCamera };
}
