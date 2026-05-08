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
  const exerciseRef = useRef<ExerciseType>(exercise);
  const stableRef = useRef({ down: 0, up: 0 });
  const smoothAnglesRef = useRef<Record<string, number>>({});
  const lastCountAtRef = useRef(0);

  // 切换练习只重置计数，不动摄像头/模型
  useEffect(() => {
    exerciseRef.current = exercise;
    setCount(0);
    stateRef.current = "up";
    stableRef.current = { down: 0, up: 0 };
    smoothAnglesRef.current = {};
    lastCountAtRef.current = 0;
  }, [exercise]);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      setReady(false);
      const existing = streamRef.current;
      if (existing?.getVideoTracks().some((track) => track.readyState === "live")) return true;

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("当前浏览器不支持摄像头调用");
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => undefined);
      }
      return true;
    } catch (e: any) {
      setReady(false);
      setError(e?.name === "NotAllowedError" ? "摄像头权限被拒绝，请允许后重试" : e?.message ?? "无法启用摄像头");
      return false;
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
        const cameraReady = streamRef.current?.getVideoTracks().some((track) => track.readyState === "live") || await startCamera();
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
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
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
    if (best.v < 0.5) return null;
    return angle(best.a, best.b, best.c);
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
      // 髋-膝-踝
      const knee = bestAngle(l, 24, 26, 28, 23, 25, 27);
      if (knee == null) return;
      // 同时要求髋部明显下沉（髋低于一定高度变化量）以减少误判
      if (stateRef.current === "up" && knee < 95) stateRef.current = "down";
      else if (stateRef.current === "down" && knee > 165) {
        stateRef.current = "up";
        tryCount();
      }
    } else if (ex === "pushup") {
      // 肩-肘-腕
      const elbow = bestAngle(l, 12, 14, 16, 11, 13, 15);
      if (elbow == null) return;
      // 要求身体大致水平：肩与髋 y 接近
      const shoulderY = ((l[11]?.y ?? 0) + (l[12]?.y ?? 0)) / 2;
      const hipY = ((l[23]?.y ?? 0) + (l[24]?.y ?? 0)) / 2;
      if (Math.abs(shoulderY - hipY) > 0.25) return; // 不是俯卧姿态
      if (stateRef.current === "up" && elbow < 95) stateRef.current = "down";
      else if (stateRef.current === "down" && elbow > 155) {
        stateRef.current = "up";
        tryCount();
      }
    } else if (ex === "situp") {
      // 肩-髋-膝
      const hip = bestAngle(l, 12, 24, 26, 11, 23, 25);
      if (hip == null) return;
      if (stateRef.current === "up" && hip < 75) {
        stateRef.current = "down";
        tryCount();
      } else if (stateRef.current === "down" && hip > 135) {
        stateRef.current = "up";
      }
    }
  }

  function reset() {
    setCount(0);
    stateRef.current = "up";
  }

  return { videoRef, canvasRef, count, ready, error, reset };
}
