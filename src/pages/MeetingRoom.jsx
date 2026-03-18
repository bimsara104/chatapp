import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Monitor,
  Users, MessageCircle, X, Send, Copy, Check
} from "lucide-react";

const METERED_API_KEY = "3ScUq5Vz5S4vcpUQ8fN3Fiu-sNr22DJxpx7V7Zj597QNDWtB";
const METERED_APP = "frontchat";

async function fetchIceServers() {
  try {
    const res = await fetch(
      `https://${METERED_APP}.metered.live/api/v1/turn/credential?secretKey=${METERED_API_KEY}`
    );
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) return data;
  } catch (e) {
    console.warn("Metered TURN fetch failed, using STUN only:", e);
  }
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
}

export default function MeetingRoom({ meetingId, token }) {
  const [stage, setStage] = useState("join"); // join | lobby | meeting
  const [name, setName] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}").display_name || ""; } catch { return ""; }
  });
  const [meetingInfo, setMeetingInfo] = useState(null);
  const [notFound, setNotFound] = useState(false);

  // Media state
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [participants, setParticipants] = useState({}); // { userId: { name, stream } }
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const iceServersRef = useRef([
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ]);

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const wsRef = useRef(null);
  const peersRef = useRef({});
  const myIdRef = useRef(`guest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const myNameRef = useRef(name);

  // Fetch meeting info
  useEffect(() => {
    fetch(`/api/meetings/${meetingId}`)
      .then(r => r.json())
      .then(data => {
        if (data.detail === "Meeting not found") setNotFound(true);
        else setMeetingInfo(data);
      })
      .catch(() => setNotFound(true));
  }, [meetingId]);

  // Connect WebSocket for signaling
  const connectWS = useCallback(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const storedToken = token || localStorage.getItem("token") || "";
    const tokenParam = storedToken ? `&token=${storedToken}` : "";
    const wsUrl = `${proto}//${host}/ws/meet/${meetingId}?name=${encodeURIComponent(myNameRef.current)}&uid=${myIdRef.current}${tokenParam}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "meet_join",
        meeting_id: meetingId,
        name: myNameRef.current,
        uid: myIdRef.current,
      }));
    };

    ws.onmessage = async (e) => {
      const data = JSON.parse(e.data);
      await handleSignal(data);
    };

    ws.onclose = () => {
      setTimeout(connectWS, 2000);
    };
  }, [meetingId, token]);

  const sendWS = (data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  };

  const createPeer = useCallback((remoteId, remoteName, stream, isInitiator) => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current, iceCandidatePoolSize: 10 });
    peersRef.current[remoteId] = pc;

    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate) sendWS({ type: "meet_ice", to: remoteId, meeting_id: meetingId, candidate: e.candidate });
    };

    pc.ontrack = (e) => {
      const remoteStream = e.streams[0];
      setParticipants(prev => ({
        ...prev,
        [remoteId]: { ...prev[remoteId], name: remoteName || remoteId, stream: remoteStream },
      }));
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] ${remoteId} connection: ${pc.connectionState}`);
      if (["disconnected","failed","closed"].includes(pc.connectionState)) {
        setParticipants(prev => { const u = { ...prev }; delete u[remoteId]; return u; });
        delete peersRef.current[remoteId];
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[ICE] ${remoteId} ice: ${pc.iceConnectionState}`);
    };

    if (isInitiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        sendWS({ type: "meet_offer", to: remoteId, meeting_id: meetingId, sdp: offer, name: myNameRef.current, uid: myIdRef.current });
      });
    }

    return pc;
  }, [meetingId]);

  const handleSignal = useCallback(async (data) => {
    const stream = localStreamRef.current;

    if (data.type === "meet_joined") {
      // Someone joined — initiate peer
      setParticipants(prev => ({ ...prev, [data.uid]: { name: data.name, stream: null } }));
      if (stream) createPeer(data.uid, data.name, stream, true);

    } else if (data.type === "meet_offer") {
      setParticipants(prev => ({ ...prev, [data.uid]: { name: data.name, stream: null } }));
      const pc = stream ? createPeer(data.uid, data.name, stream, false) : new RTCPeerConnection({ iceServers: iceServersRef.current, iceCandidatePoolSize: 10 });
      peersRef.current[data.uid] = pc;
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendWS({ type: "meet_answer", to: data.uid, meeting_id: meetingId, sdp: answer, name: myNameRef.current, uid: myIdRef.current });

    } else if (data.type === "meet_answer") {
      await peersRef.current[data.uid]?.setRemoteDescription(new RTCSessionDescription(data.sdp));

    } else if (data.type === "meet_ice") {
      await peersRef.current[data.uid]?.addIceCandidate(new RTCIceCandidate(data.candidate));

    } else if (data.type === "meet_left") {
      setParticipants(prev => { const u = { ...prev }; delete u[data.uid]; return u; });
      peersRef.current[data.uid]?.close();
      delete peersRef.current[data.uid];

    } else if (data.type === "meet_chat") {
      setChatMessages(prev => [...prev, { name: data.name, text: data.text, time: new Date().toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" }) }]);

    } else if (data.type === "meet_participants") {
      // Existing participants — stream ready වෙලා peer create කරන්න
      const initPeers = (s) => {
        data.participants?.forEach(p => {
          if (p.uid !== myIdRef.current) {
            setParticipants(prev => ({ ...prev, [p.uid]: { name: p.name, stream: null } }));
            createPeer(p.uid, p.name, s, true);
          }
        });
      };
      if (stream) {
        initPeers(stream);
      } else {
        // Stream still loading — wait and retry
        const wait = setInterval(() => {
          if (localStreamRef.current) {
            clearInterval(wait);
            initPeers(localStreamRef.current);
          }
        }, 200);
        setTimeout(() => clearInterval(wait), 5000);
      }
    }
  }, [createPeer, meetingId]);

  const joinMeeting = async () => {
    if (!name.trim()) return;
    myNameRef.current = name.trim();
    try {
      // Fetch TURN credentials from Metered
      const iceServers = await fetchIceServers();
      iceServersRef.current = iceServers;
      console.log("[ICE] Loaded servers:", iceServers.length);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      setStage("meeting");
      setTimeout(() => {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      }, 100);
      connectWS();
    } catch (e) {
      alert("Camera/mic access needed: " + e.message);
    }
  };

  const leaveMeeting = () => {
    sendWS({ type: "meet_leave", meeting_id: meetingId, uid: myIdRef.current });
    Object.values(peersRef.current).forEach(pc => pc.close());
    peersRef.current = {};
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    wsRef.current?.close();
    window.location.href = "/";
  };

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = muted; });
    setMuted(m => !m);
  };

  const toggleVideo = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = videoOff; });
    setVideoOff(v => !v);
  };

  const toggleScreen = async () => {
    if (screenSharing) {
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack) Object.values(peersRef.current).forEach(pc => { const s = pc.getSenders().find(s => s.track?.kind === "video"); if (s) s.replaceTrack(camTrack); });
      if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      setScreenSharing(false);
    } else {
      try {
        const ss = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const st = ss.getVideoTracks()[0];
        screenTrackRef.current = st;
        Object.values(peersRef.current).forEach(pc => { const s = pc.getSenders().find(s => s.track?.kind === "video"); if (s) s.replaceTrack(st); });
        if (localVideoRef.current) localVideoRef.current.srcObject = new MediaStream([st]);
        st.onended = () => { setScreenSharing(false); screenTrackRef.current = null; };
        setScreenSharing(true);
      } catch {}
    }
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const msg = { name: myNameRef.current, text: chatInput.trim(), time: new Date().toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" }) };
    setChatMessages(prev => [...prev, msg]);
    sendWS({ type: "meet_chat", meeting_id: meetingId, name: myNameRef.current, text: chatInput.trim() });
    setChatInput("");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const participantCount = Object.keys(participants).length + 1;

  // ── Join Screen ──────────────────────────────────────
  if (notFound) return (
    <div style={{ minHeight: "100vh", background: "#1e1033", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ fontSize: 64 }}>😕</div>
      <div style={{ color: "#e9d5ff", fontSize: 24, fontWeight: 600 }}>Meeting not found</div>
      <div style={{ color: "#a78bfa", fontSize: 14 }}>This meeting link may have expired</div>
      <button onClick={() => window.location.href = "/"} style={{ background: "#7c3aed", border: "none", borderRadius: 10, padding: "10px 24px", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>
        Go Home
      </button>
    </div>
  );

  if (stage === "join") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1e1033 0%, #2d1b69 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", padding: 16 }}>
      <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 20, padding: "40px 32px", width: "100%", maxWidth: 420, border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Video size={28} color="#fff" />
          </div>
          <div style={{ color: "#e9d5ff", fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            {meetingInfo?.name || "Meeting"}
          </div>
          <div style={{ color: "#a78bfa", fontSize: 13 }}>Enter your name to join</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "12px 16px", color: "#e9d5ff", fontSize: 15, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit" }}
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && joinMeeting()}
            autoFocus
          />
          <button onClick={joinMeeting} disabled={!name.trim()}
            style={{ background: name.trim() ? "#7c3aed" : "#4c1d95", border: "none", borderRadius: 10, padding: "13px", color: "#fff", fontSize: 15, fontWeight: 600, cursor: name.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Video size={18} /> Join Meeting
          </button>
        </div>

        <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ color: "#a78bfa", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{window.location.href}</div>
          <button onClick={copyLink} style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "#00a884" : "#a78bfa", flexShrink: 0 }}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Meeting Room ─────────────────────────────────────
  const allParticipants = [
    { uid: "me", name: `${myNameRef.current} (You)`, isMe: true },
    ...Object.entries(participants).map(([uid, p]) => ({ uid, name: p.name, stream: p.stream, isMe: false })),
  ];

  const cols = allParticipants.length <= 1 ? 1 : allParticipants.length <= 2 ? 2 : allParticipants.length <= 4 ? 2 : 3;

  return (
    <div style={{ height: "100dvh", background: "#1e1033", display: "flex", flexDirection: "column", fontFamily: "'Segoe UI', sans-serif", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "rgba(0,0,0,0.3)", flexShrink: 0 }}>
        <div>
          <div style={{ color: "#e9d5ff", fontSize: 16, fontWeight: 700 }}>{meetingInfo?.name || "Meeting"}</div>
          <div style={{ color: "#a78bfa", fontSize: 12 }}>{participantCount} in call</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={copyLink} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, padding: "6px 12px", color: copied ? "#00a884" : "#e9d5ff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
      </div>

      {/* Video Grid */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, padding: 8, overflow: "hidden" }}>
        {allParticipants.map(p => (
          <div key={p.uid} style={{ position: "relative", background: "#2d1b69", borderRadius: 12, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
            {p.isMe ? (
              <>
                <video ref={localVideoRef} autoPlay playsInline muted
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: videoOff && !screenSharing ? "none" : "block" }} />
                {videoOff && !screenSharing && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#fff", fontWeight: 700 }}>
                      {myNameRef.current[0]?.toUpperCase()}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {p.stream ? (
                  <video autoPlay playsInline
                    ref={el => { if (el && p.stream) el.srcObject = p.stream; }}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#4c1d95", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#e9d5ff", fontWeight: 700 }}>
                      {p.name?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ color: "#a78bfa", fontSize: 11 }}>Connecting...</div>
                  </div>
                )}
              </>
            )}
            <div style={{ position: "absolute", bottom: 8, left: 10, color: "#e9d5ff", fontSize: 12, fontWeight: 600, background: "rgba(0,0,0,0.5)", borderRadius: 6, padding: "2px 8px" }}>
              {p.name} {p.isMe && muted ? "🔇" : ""}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "16px", background: "rgba(0,0,0,0.3)", flexShrink: 0 }}>
        <button onClick={toggleMute} style={{ width: 52, height: 52, borderRadius: "50%", background: muted ? "#f85149" : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {muted ? <MicOff size={22} color="#fff" /> : <Mic size={22} color="#fff" />}
        </button>
        <button onClick={toggleVideo} style={{ width: 52, height: 52, borderRadius: "50%", background: videoOff ? "#f85149" : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {videoOff ? <VideoOff size={22} color="#fff" /> : <Video size={22} color="#fff" />}
        </button>
        <button onClick={toggleScreen} style={{ width: 52, height: 52, borderRadius: "50%", background: screenSharing ? "#7c3aed" : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Monitor size={22} color="#fff" />
        </button>
        <button onClick={() => setShowChat(c => !c)} style={{ width: 52, height: 52, borderRadius: "50%", background: showChat ? "#7c3aed" : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          <MessageCircle size={22} color="#fff" />
          {chatMessages.length > 0 && !showChat && <div style={{ position: "absolute", top: 6, right: 6, width: 10, height: 10, borderRadius: "50%", background: "#00a884" }} />}
        </button>
        <button onClick={leaveMeeting} style={{ width: 52, height: 52, borderRadius: "50%", background: "#f85149", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <PhoneOff size={22} color="#fff" />
        </button>
      </div>

      {/* Chat Panel */}
      {showChat && (
        <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 300, background: "#2d1b69", borderLeft: "1px solid #4c1d95", display: "flex", flexDirection: "column", zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #4c1d95" }}>
            <span style={{ color: "#e9d5ff", fontWeight: 600, fontSize: 15 }}>Meeting Chat</span>
            <button onClick={() => setShowChat(false)} style={{ background: "none", border: "none", color: "#a78bfa", cursor: "pointer" }}><X size={18} /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {chatMessages.length === 0 && <div style={{ color: "#a78bfa", fontSize: 13, textAlign: "center", marginTop: 20 }}>No messages yet</div>}
            {chatMessages.map((m, i) => (
              <div key={i}>
                <div style={{ color: "#a78bfa", fontSize: 11, marginBottom: 2 }}>{m.name} · {m.time}</div>
                <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px", color: "#e9d5ff", fontSize: 14 }}>{m.text}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid #4c1d95" }}>
            <input
              style={{ flex: 1, background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, padding: "8px 12px", color: "#e9d5ff", fontSize: 14, outline: "none", fontFamily: "inherit" }}
              placeholder="Message..." value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendChat()}
            />
            <button onClick={sendChat} style={{ background: "#7c3aed", border: "none", borderRadius: 8, width: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Send size={16} color="#fff" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
