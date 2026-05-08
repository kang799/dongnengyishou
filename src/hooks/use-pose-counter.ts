import { useEffect, useRef, useState } from "react";

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

export function usePoseCounter(exercise: ExerciseType, active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<"up" | "down">("up");
  const rafRef = useRef<number | null>(null);
  const landmarkerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setCount(0);
    stateRef.current = "up";
  }, [exercise]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setError(null);
    setReady(false);

    (async () => {
      try {
        const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
        );
        const lm = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        if (cancelled) {
          lm.close();
          return;
        }
        landmarkerRef.current = lm;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setReady(true);

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d") ?? null;

        const loop = () => {
          if (cancelled || !landmarkerRef.current) return;
          if (video.readyState >= 2) {
            const result = landmarkerRef.current.detectForVideo(video, performance.now());
            const lms: Landmark[] | undefined = result?.landmarks?.[0];
            if (lms) {
              detect(exercise, lms);
              if (ctx && canvas) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
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
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, exercise]);

  function detect(ex: ExerciseType, l: Landmark[]) {
    // MediaPipe Pose indices
    // 11 L-shoulder, 12 R-shoulder, 13 L-elbow, 14 R-elbow, 15 L-wrist, 16 R-wrist
    // 23 L-hip, 24 R-hip, 25 L-knee, 26 R-knee, 27 L-ankle, 28 R-ankle
    if (ex === "squat") {
      const a = angle(l[24], l[26], l[28]); // 右髋-膝-踝
      const b = angle(l[23], l[25], l[27]);
      const knee = (a + b) / 2;
      if (stateRef.current === "up" && knee < 100) stateRef.current = "down";
      else if (stateRef.current === "down" && knee > 160) {
        stateRef.current = "up";
        setCount((c) => c + 1);
      }
    } else if (ex === "pushup") {
      const a = angle(l[12], l[14], l[16]);
      const b = angle(l[11], l[13], l[15]);
      const elbow = (a + b) / 2;
      if (stateRef.current === "up" && elbow < 90) stateRef.current = "down";
      else if (stateRef.current === "down" && elbow > 160) {
        stateRef.current = "up";
        setCount((c) => c + 1);
      }
    } else if (ex === "situp") {
      // 髋角：肩-髋-膝
      const a = angle(l[12], l[24], l[26]);
      const b = angle(l[11], l[23], l[25]);
      const hip = (a + b) / 2;
      if (stateRef.current === "up" && hip < 80) {
        stateRef.current = "down";
        setCount((c) => c + 1);
      } else if (stateRef.current === "down" && hip > 140) {
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
