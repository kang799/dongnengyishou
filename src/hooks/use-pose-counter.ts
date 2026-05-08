import { useCallback, useEffect, useRef, useState } from "react";

export type ExerciseType = "squat" | "pushup" | "situp";

type Landmark = { x: number; y: number; z: number; visibility?: number };

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
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.6,
        minPosePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
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
  const stateRef = useRef<"up" | "down">("up");
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraPromiseRef = useRef<Promise<boolean> | null>(null);
  const cameraGenerationRef = useRef(0);
  const exerciseRef = useRef<ExerciseType>(exercise);
  const stableRef = useRef({ down: 0, up: 0 });
  const smoothAnglesRef = useRef<Record<string, number>>({});
  const lastCountAtRef = useRef(0);
  const shoulderBaselineRef = useRef<number | null>(null);
  const baselineSamplesRef = useRef(0);

  // 切换练习只重置计数，不动摄像头/模型
  useEffect(() => {
    exerciseRef.current = exercise;
    setCount(0);
    stateRef.current = "up";
    stableRef.current = { down: 0, up: 0 };
    smoothAnglesRef.current = {};
    lastCountAtRef.current = 0;
    shoulderBaselineRef.current = null;
    baselineSamplesRef.current = 0;
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
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
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
          const now = performance.now();
          if (video.readyState >= 2 && now - lastDetect > 66) {
            lastDetect = now;
            const result = lm.detectForVideo(video, performance.now());
            const lms: Landmark[] | undefined = result?.landmarks?.[0];
            if (lms) {
              detect(exerciseRef.current, lms);
              if (ctx && canvas && now - lastDraw > 66) {
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
      // 判断下半身是否可见（膝+踝任一侧可见度足够）
      const kneeVis = Math.max(
        Math.min(l[25]?.visibility ?? 0, l[27]?.visibility ?? 0),
        Math.min(l[26]?.visibility ?? 0, l[28]?.visibility ?? 0),
      );
      const fullBody = kneeVis >= 0.5;

      if (fullBody) {
        // 全身模式：髋-膝-踝
        const rawKnee = bestAngle(l, 24, 26, 28, 23, 25, 27);
        const knee = rawKnee == null ? null : smoothAngle("knee", rawKnee);
        if (knee == null) return;
        const hipY = ((l[23]?.y ?? 0) + (l[24]?.y ?? 0)) / 2;
        const kneeY = ((l[25]?.y ?? 0) + (l[26]?.y ?? 0)) / 2;
        const downPose = knee < 108 && hipY > kneeY - 0.2;
        const upPose = knee > 158 && hipY < kneeY - 0.16;
        if (stateRef.current === "up" && confirmPose("down", downPose)) {
          stateRef.current = "down";
          stableRef.current.up = 0;
        } else if (stateRef.current === "down" && confirmPose("up", upPose)) {
          stateRef.current = "up";
          stableRef.current.down = 0;
          tryCount();
        }
        return;
      }

      // 上半身模式：用肩膀的下沉量判定
      const lS = l[11], rS = l[12];
      const sVis = Math.min(lS?.visibility ?? 0, rS?.visibility ?? 0);
      if (sVis < 0.5) return;
      const rawShoulderY = ((lS?.y ?? 0) + (rS?.y ?? 0)) / 2;
      const shoulderY = smoothAngle("shoulderY", rawShoulderY);

      // 动态基线 = 历史最高位置（y 最小）
      const base = shoulderBaselineRef.current;
      if (base == null) {
        shoulderBaselineRef.current = shoulderY;
        baselineSamplesRef.current = 1;
        return;
      }
      // 站立位变得更高（y 更小）→ 立刻更新基线
      if (shoulderY < base) {
        shoulderBaselineRef.current = shoulderY;
      } else if (stateRef.current === "up") {
        // 站立态下缓慢漂回基线，吸收姿势微调
        shoulderBaselineRef.current = base * 0.995 + shoulderY * 0.005;
      }
      baselineSamplesRef.current += 1;
      if (baselineSamplesRef.current < 15) return; // 等基线稳定

      const drop = shoulderY - (shoulderBaselineRef.current ?? shoulderY);
      const downPose = drop > 0.08;
      const upPose = drop < 0.025;
      if (stateRef.current === "up" && confirmPose("down", downPose)) {
        stateRef.current = "down";
        stableRef.current.up = 0;
      } else if (stateRef.current === "down" && confirmPose("up", upPose)) {
        stateRef.current = "up";
        stableRef.current.down = 0;
        tryCount();
      }
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

  function reset() {
    setCount(0);
    stateRef.current = "up";
    stableRef.current = { down: 0, up: 0 };
    smoothAnglesRef.current = {};
    lastCountAtRef.current = 0;
    shoulderBaselineRef.current = null;
    baselineSamplesRef.current = 0;
  }

  return { videoRef, canvasRef, count, ready, error, reset, startCamera };
}
