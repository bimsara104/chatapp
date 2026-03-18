import { useRef, useState, useCallback } from "react";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useWebRTC(send, currentUserId) {
  const [callState, setCallState] = useState(null);
  // null | { type, status, remoteUser, isVideo }
  // status: "outgoing" | "incoming" | "active"

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // ── Cleanup ───────────────────────────────────────────────
  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setCallState(null);
  }, []);

  // ── Create PeerConnection ─────────────────────────────────
  const createPC = useCallback((targetId, isVideo) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        send({ event: "ice_candidate", to: targetId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        cleanup();
      }
    };

    return pc;
  }, [send, cleanup]);

  // ── Start call (outgoing) ─────────────────────────────────
  const startCall = useCallback(async (remoteUser, isVideo = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPC(remoteUser.id, isVideo);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      send({
        event: "call_offer",
        to: remoteUser.id,
        offer,
        isVideo,
        callerName: null,
      });

      setCallState({ status: "outgoing", remoteUser, isVideo });
    } catch (e) {
      console.error("startCall error:", e);
      cleanup();
    }
  }, [send, createPC, cleanup]);

  // ── Answer call (incoming) ────────────────────────────────
  const answerCall = useCallback(async () => {
    if (!callState || callState.status !== "incoming") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callState.isVideo,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPC(callState.remoteUser.id, callState.isVideo);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      await pc.setRemoteDescription(callState.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      send({ event: "call_answer", to: callState.remoteUser.id, answer });
      setCallState((prev) => ({ ...prev, status: "active" }));
    } catch (e) {
      console.error("answerCall error:", e);
      cleanup();
    }
  }, [callState, send, createPC, cleanup]);

  // ── Reject / End call ─────────────────────────────────────
  const endCall = useCallback((remoteUserId) => {
    send({ event: "call_end", to: remoteUserId });
    cleanup();
  }, [send, cleanup]);

  // ── Handle incoming WebSocket signaling ──────────────────
  const handleSignal = useCallback(async (data) => {
    const { event } = data;

    if (event === "call_offer") {
      setCallState({
        status: "incoming",
        remoteUser: { id: data.from, display_name: data.callerName || `User ${data.from}` },
        isVideo: data.isVideo,
        offer: data.offer,
      });
    }

    else if (event === "call_answer") {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(data.answer);
        setCallState((prev) => prev ? { ...prev, status: "active" } : prev);
      }
    }

    else if (event === "ice_candidate") {
      if (pcRef.current && data.candidate) {
        await pcRef.current.addIceCandidate(data.candidate).catch(() => {});
      }
    }

    else if (event === "call_end") {
      cleanup();
    }
  }, [cleanup]);

  return {
    callState,
    startCall,
    answerCall,
    endCall,
    handleSignal,
    localVideoRef,
    remoteVideoRef,
    cleanup,
  };
}
