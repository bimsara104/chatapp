import { useEffect, useRef, useState } from "react";

const FACE_API_CDN = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
const MODELS_URL = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";

const STATUS = {
  LOADING: "loading", READY: "ready", SCANNING: "scanning",
  SUCCESS: "success", FAILED: "failed", NO_FACE: "no_face",
};

export default function FaceVerification({ onSuccess, onFail, mode = "register" }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState(STATUS.LOADING);
  const [message, setMessage] = useState("Loading face detection...");
  const [progress, setProgress] = useState(0);

  useEffect(() => { loadFaceApi(); return () => stopCamera(); }, []);

  async function loadFaceApi() {
    try {
      if (!window.faceapi) {
        setMessage("Loading face-api.js...");
        await loadScript(FACE_API_CDN);
      }
      setMessage("Loading AI models (first time may take 30s)...");
      setProgress(20);

      await Promise.all([
        window.faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
        window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_URL),
        window.faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
      ]);

      setProgress(80);
      setMessage("Starting camera...");
      await startCamera();
      setProgress(100);
      setStatus(STATUS.READY);
      setMessage(mode === "register" ? "📸 Look at camera to register face" : "🔍 Look at camera to verify");
    } catch (e) {
      console.error("FaceAPI load error:", e);
      setStatus(STATUS.FAILED);
      setMessage("Failed to load. Check internet connection.");
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 320, height: 240 }
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await new Promise(r => { videoRef.current.onloadedmetadata = r; });
      videoRef.current.play();
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
  }

  async function captureAndProcess() {
    if (!window.faceapi || !videoRef.current) return;
    setStatus(STATUS.SCANNING);
    setMessage("Scanning...");
    try {
      const options = new window.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
      let detection = null;
      for (let i = 0; i < 3; i++) {
        detection = await window.faceapi
          .detectSingleFace(videoRef.current, options)
          .withFaceLandmarks(true)
          .withFaceDescriptor();
        if (detection) break;
        await new Promise(r => setTimeout(r, 500));
      }
      if (!detection) {
        setStatus(STATUS.NO_FACE);
        setMessage("No face detected. Look directly at camera.");
        setTimeout(() => { setStatus(STATUS.READY); setMessage(mode === "register" ? "📸 Look at camera to register face" : "🔍 Look at camera to verify"); }, 2000);
        return;
      }
      const embedding = Array.from(detection.descriptor);
      stopCamera();
      setStatus(STATUS.SUCCESS);
      setMessage("✅ Face captured!");
      onSuccess({ embedding });
    } catch (e) {
      console.error(e);
      setStatus(STATUS.FAILED);
      setMessage("Scan failed. Try again.");
      setTimeout(() => setStatus(STATUS.READY), 2000);
    }
  }

  const color = { loading:"#8b949e", ready:"#3fb950", scanning:"#f0a500", success:"#3fb950", failed:"#f85149", no_face:"#f85149" }[status];

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"12px" }}>
      <div style={{ position:"relative", borderRadius:"12px", overflow:"hidden", border:`2px solid ${color}`, width:"280px", height:"210px", background:"#0d1117" }}>
        <video ref={videoRef} style={{ width:"100%", height:"100%", objectFit:"cover", transform:"scaleX(-1)" }} muted playsInline />
        {status === STATUS.SCANNING && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.5)" }}>
            <div style={{ width:"60px", height:"60px", border:"3px solid #f0a500", borderRadius:"50%", borderTopColor:"transparent", animation:"spin 1s linear infinite" }} />
          </div>
        )}
        {status === STATUS.READY && (
          <div style={{ position:"absolute", inset:"30px", border:"2px dashed rgba(63,185,80,0.4)", borderRadius:"50%", pointerEvents:"none" }} />
        )}
        {status === STATUS.SUCCESS && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.6)", fontSize:"48px" }}>✅</div>
        )}
      </div>

      {status === STATUS.LOADING && (
        <div style={{ width:"280px", height:"4px", background:"#21262d", borderRadius:"4px", overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${progress}%`, background:"#238636", borderRadius:"4px", transition:"width 0.5s" }} />
        </div>
      )}

      <p style={{ fontSize:"13px", color, textAlign:"center", margin:0 }}>{message}</p>

      {(status === STATUS.READY || status === STATUS.NO_FACE) && (
        <button onClick={captureAndProcess} style={{ background:"#238636", color:"#fff", border:"none", borderRadius:"10px", padding:"11px 32px", fontSize:"14px", fontWeight:"500", cursor:"pointer", width:"280px" }}>
          {mode === "register" ? "📸 Register Face" : "🔍 Verify Face"}
        </button>
      )}
      {status === STATUS.FAILED && (
        <button onClick={() => { setStatus(STATUS.LOADING); setProgress(0); loadFaceApi(); }}
          style={{ background:"#21262d", color:"#e6edf3", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"10px", padding:"10px 24px", fontSize:"13px", cursor:"pointer" }}>
          🔄 Try Again
        </button>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
