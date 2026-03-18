import { useCallback, useState, useEffect, useRef } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import { useWebRTC } from "../hooks/useWebRTC";
import { api } from "../api";
import {
  Phone, Video, ArrowLeft, LogOut, Search, Settings,
  Send, Users, Plus, X, MessageCircle, Check, CheckCheck,
  MoreVertical, Smile, Paperclip, Mic, MicOff, Image, FileText,
  Download, Play, Monitor, VideoOff, PhoneOff
} from "lucide-react";

export default function ChatApp({ token, onLogout }) {
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem("user") || "{}"));

  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [recentChats, setRecentChats] = useState([]);
  const [myGroups, setMyGroups] = useState([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupSearchResults, setGroupSearchResults] = useState([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profile");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const [formData, setFormData] = useState({ display_name: "", username: "", bio: "", last_seen_visible: true });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [sidebarTab, setSidebarTab] = useState("chats");

  // File/Image sharing
  const [uploadingFile, setUploadingFile] = useState(false);
  const [filePreview, setFilePreview] = useState(null); // { url, name, type, file }
  const [lightboxImg, setLightboxImg] = useState(null);

  // Group call state
  const [groupCall, setGroupCall] = useState(null);
  // groupCall = { groupId, groupName, status: "outgoing"|"active", participants: {userId: {stream, pc, name, avatar}} }
  const [gcMuted, setGcMuted] = useState(false);
  const [gcVideoOff, setGcVideoOff] = useState(false);
  const [gcScreenSharing, setGcScreenSharing] = useState(false);
  const [gcIncoming, setGcIncoming] = useState(null); // { groupId, groupName, callerId, callerName }
  const localGcStreamRef = useRef(null);
  const gcPeersRef = useRef({}); // { userId: RTCPeerConnection }
  const gcScreenTrackRef = useRef(null);
  const localGcVideoRef = useRef(null);
  const gcRemoteVideosRef = useRef({});

  const messagesEndRef = useRef(null);
  const searchTimeout = useRef(null);
  const groupSearchTimeout = useRef(null);
  const selectedUserRef = useRef(null);
  const selectedGroupRef = useRef(null);
  const fileInputRef = useRef(null);
  const attachInputRef = useRef(null);
  const handleSignalRef = useRef(null);
  const handleGcSignalRef = useRef(null);
  const notifPermRef = useRef("default");

  useEffect(() => {
    if ("Notification" in window) Notification.requestPermission().then(p => { notifPermRef.current = p; });
  }, []);

  const showNotif = (title, body, icon) => {
    if (notifPermRef.current === "granted" && document.hidden) new Notification(title, { body, icon: icon || "/favicon.svg" });
  };

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);
  useEffect(() => { selectedGroupRef.current = selectedGroup; }, [selectedGroup]);

  const loadRecentChats = () => api.getRecentChats().then(setRecentChats).catch(() => {});
  const loadGroups = () => api.getMyGroups().then(setMyGroups).catch(() => {});
  useEffect(() => { loadRecentChats(); loadGroups(); }, []);

  useEffect(() => {
    if (showSettings) {
      setFormData({ display_name: currentUser.display_name || "", username: currentUser.username || "", bio: currentUser.bio || "", last_seen_visible: currentUser.last_seen_visible !== false });
      setAvatarPreview(currentUser.avatar_url || null);
      setSettingsError(""); setSettingsSuccess(""); setAvatarFile(null);
    }
  }, [showSettings]);

  const onMessage = useCallback((data) => {
    if (["call_offer","call_answer","ice_candidate","call_end"].includes(data.event)) { handleSignalRef.current?.(data); return; }
    if (["gc_start","gc_join","gc_offer","gc_answer","gc_ice","gc_end"].includes(data.type)) { handleGcSignalRef.current?.(data); return; }
    if (data.type === "new_message") {
      const msg = data.message || data;
      const current = selectedUserRef.current;
      if (current && (msg.sender_id === current.id || msg.receiver_id === current.id)) {
        setMessages((prev) => prev.find((m) => m.id === msg.id) ? prev : [...prev, { ...msg, created_at: msg.created_at || new Date().toISOString() }]);
      }
      setRecentChats(prev => {
        const existing = prev.find(c => c.user_id === msg.sender_id);
        const isCurrentChat = current?.id === msg.sender_id;
        const newChat = { user_id: msg.sender_id, username: msg.sender_name || `user${msg.sender_id}`, display_name: msg.sender_name, avatar_url: msg.sender_avatar, last_message: msg.content || "📎 File", last_message_time: msg.created_at || new Date().toISOString(), unread_count: isCurrentChat ? 0 : (existing ? (existing.unread_count || 0) + 1 : 1), is_me: false };
        return [newChat, ...prev.filter(c => c.user_id !== msg.sender_id)];
      });
      if (!selectedUserRef.current || selectedUserRef.current.id !== msg.sender_id) showNotif(msg.sender_name || `User ${msg.sender_id}`, msg.content || "Sent a file", msg.sender_avatar);
    }
    if (data.type === "new_group_message") {
      const msg = data.message || data;
      const currentGroup = selectedGroupRef.current;
      if (currentGroup && msg.group_id === currentGroup.id) setMessages((prev) => prev.find((m) => m.id === msg.id) ? prev : [...prev, { ...msg, created_at: msg.created_at || new Date().toISOString() }]);
      setMyGroups(prev => prev.map(g => g.id === msg.group_id ? { ...g, last_message: msg.content || "📎 File", unread_count: currentGroup?.id === msg.group_id ? 0 : (g.unread_count || 0) + 1 } : g));
      if (!currentGroup || currentGroup.id !== msg.group_id) {
        const grp = myGroups.find(g => g.id === msg.group_id);
        showNotif(grp?.name || "Group", `${msg.sender_name || "Someone"}: ${msg.content || "Sent a file"}`);
      }
    }
  }, [myGroups]);

  const { send } = useWebSocket(token, onMessage);
  const { callState, startCall, answerCall, endCall, handleSignal, localVideoRef, remoteVideoRef } = useWebRTC(send, currentUser.id);
  handleSignalRef.current = handleSignal;

  // ── Group Call Logic ─────────────────────────────────

  const GC_ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

  const getLocalGcStream = async (video = true) => {
    if (localGcStreamRef.current) return localGcStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
    localGcStreamRef.current = stream;
    if (localGcVideoRef.current) localGcVideoRef.current.srcObject = stream;
    return stream;
  };

  const createGcPeer = (remoteUserId, stream, groupId, isInitiator) => {
    const pc = new RTCPeerConnection(GC_ICE);
    gcPeersRef.current[remoteUserId] = pc;

    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "gc_ice", to: remoteUserId, group_id: groupId, candidate: e.candidate });
    };

    pc.ontrack = (e) => {
      const remoteStream = e.streams[0];
      setGroupCall(prev => {
        if (!prev) return prev;
        const participants = { ...prev.participants };
        if (participants[remoteUserId]) {
          participants[remoteUserId] = { ...participants[remoteUserId], stream: remoteStream };
        } else {
          participants[remoteUserId] = { stream: remoteStream, name: `User ${remoteUserId}`, avatar: null };
        }
        return { ...prev, participants, status: "active" };
      });
      if (gcRemoteVideosRef.current[remoteUserId]) gcRemoteVideosRef.current[remoteUserId].srcObject = remoteStream;
    };

    pc.onconnectionstatechange = () => {
      if (["disconnected","failed","closed"].includes(pc.connectionState)) {
        setGroupCall(prev => {
          if (!prev) return prev;
          const participants = { ...prev.participants };
          delete participants[remoteUserId];
          if (Object.keys(participants).length === 0) { endGroupCall(); return null; }
          return { ...prev, participants };
        });
        delete gcPeersRef.current[remoteUserId];
      }
    };

    if (isInitiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        send({ type: "gc_offer", to: remoteUserId, group_id: groupId, sdp: offer });
      });
    }
    return pc;
  };

  const startGroupCall = async (group) => {
    try {
      const stream = await getLocalGcStream(true);
      setGroupCall({ groupId: group.id, groupName: group.name, status: "outgoing", participants: {} });
      // Notify all group members via WS
      send({ type: "gc_start", group_id: group.id, group_name: group.name, caller_name: currentUser.display_name || currentUser.username });
      // Fetch members and initiate peer connections
      const members = await api.getGroupMembers(group.id).catch(() => []);
      members.map(m => ({...m, id: m.id ?? m.user_id})).filter(m => m.id !== currentUser.id).forEach(m => {
        createGcPeer(m.id, stream, group.id, true);
        setGroupCall(prev => prev ? { ...prev, status: "active", participants: { ...prev.participants, [m.id]: { stream: null, name: m.display_name || m.username, avatar: m.avatar_url } } } : prev);
      });
    } catch (e) { alert("Camera/mic access failed: " + e.message); }
  };

  const joinGroupCall = async (incoming) => {
    setGcIncoming(null);
    try {
      const stream = await getLocalGcStream(true);
      setGroupCall({ groupId: incoming.groupId, groupName: incoming.groupName, status: "active", participants: { [incoming.callerId]: { stream: null, name: incoming.callerName, avatar: null } } });
      send({ type: "gc_join", group_id: incoming.groupId, joiner_name: currentUser.display_name || currentUser.username });
      createGcPeer(incoming.callerId, stream, incoming.groupId, false);
    } catch (e) { alert("Camera/mic access failed: " + e.message); }
  };

  const endGroupCall = () => {
    if (groupCall) send({ type: "gc_end", group_id: groupCall.groupId });
    Object.values(gcPeersRef.current).forEach(pc => pc.close());
    gcPeersRef.current = {};
    if (localGcStreamRef.current) { localGcStreamRef.current.getTracks().forEach(t => t.stop()); localGcStreamRef.current = null; }
    if (gcScreenTrackRef.current) { gcScreenTrackRef.current.stop(); gcScreenTrackRef.current = null; }
    setGroupCall(null); setGcMuted(false); setGcVideoOff(false); setGcScreenSharing(false);
  };

  const toggleGcMute = () => {
    if (!localGcStreamRef.current) return;
    localGcStreamRef.current.getAudioTracks().forEach(t => { t.enabled = gcMuted; });
    setGcMuted(m => !m);
  };

  const toggleGcVideo = () => {
    if (!localGcStreamRef.current) return;
    localGcStreamRef.current.getVideoTracks().forEach(t => { t.enabled = gcVideoOff; });
    setGcVideoOff(v => !v);
  };

  const toggleGcScreen = async () => {
    if (gcScreenSharing) {
      if (gcScreenTrackRef.current) { gcScreenTrackRef.current.stop(); gcScreenTrackRef.current = null; }
      const camTrack = localGcStreamRef.current?.getVideoTracks()[0];
      if (camTrack) Object.values(gcPeersRef.current).forEach(pc => { const sender = pc.getSenders().find(s => s.track?.kind === "video"); if (sender) sender.replaceTrack(camTrack); });
      setGcScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        gcScreenTrackRef.current = screenTrack;
        Object.values(gcPeersRef.current).forEach(pc => { const sender = pc.getSenders().find(s => s.track?.kind === "video"); if (sender) sender.replaceTrack(screenTrack); });
        if (localGcVideoRef.current) { const ms = new MediaStream([screenTrack, ...( localGcStreamRef.current?.getAudioTracks() || [])]); localGcVideoRef.current.srcObject = ms; }
        screenTrack.onended = () => { setGcScreenSharing(false); gcScreenTrackRef.current = null; };
        setGcScreenSharing(true);
      } catch {}
    }
  };

  // Handle incoming group call signals via WebSocket
  const handleGcSignal = useCallback((data) => {
    if (data.type === "gc_start") {
      if (!groupCall) setGcIncoming({ groupId: data.group_id, groupName: data.group_name, callerId: data.sender_id, callerName: data.caller_name });
    } else if (data.type === "gc_join") {
      if (groupCall && data.group_id === groupCall.groupId) {
        setGroupCall(prev => prev ? { ...prev, participants: { ...prev.participants, [data.sender_id]: { stream: null, name: data.joiner_name, avatar: null } } } : prev);
        const stream = localGcStreamRef.current;
        if (stream) createGcPeer(data.sender_id, stream, data.group_id, true);
      }
    } else if (data.type === "gc_offer") {
      const pc = gcPeersRef.current[data.sender_id] || (localGcStreamRef.current ? createGcPeer(data.sender_id, localGcStreamRef.current, data.group_id, false) : null);
      if (pc) pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).then(() => pc.createAnswer()).then(ans => { pc.setLocalDescription(ans); send({ type: "gc_answer", to: data.sender_id, group_id: data.group_id, sdp: ans }); });
    } else if (data.type === "gc_answer") {
      gcPeersRef.current[data.sender_id]?.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.type === "gc_ice") {
      gcPeersRef.current[data.sender_id]?.addIceCandidate(new RTCIceCandidate(data.candidate));
    } else if (data.type === "gc_end") {
      setGroupCall(prev => {
        if (!prev || prev.groupId !== data.group_id) return prev;
        endGroupCall(); return null;
      });
    }
  }, [groupCall]);
  handleGcSignalRef.current = handleGcSignal;

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!selectedUser) return;
    setLoadingMsgs(true); setMessages([]);
    api.getConversation(selectedUser.id).then(setMessages).catch(() => setMessages([])).finally(() => setLoadingMsgs(false));
    api.markRead(selectedUser.id).then(() => setRecentChats(prev => prev.map(c => c.user_id === selectedUser.id ? { ...c, unread_count: 0 } : c))).catch(() => {});
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedGroup) return;
    setLoadingMsgs(true); setMessages([]);
    api.getGroupMessages(selectedGroup.id).then(setMessages).catch(() => setMessages([])).finally(() => setLoadingMsgs(false));
    setMyGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, unread_count: 0 } : g));
  }, [selectedGroup]);

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    if (!search.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimeout.current = setTimeout(() => { api.searchUsers(search).then(setSearchResults).catch(() => setSearchResults([])).finally(() => setSearching(false)); }, 400);
  }, [search]);

  useEffect(() => {
    clearTimeout(groupSearchTimeout.current);
    if (!groupSearch.trim()) { setGroupSearchResults([]); return; }
    groupSearchTimeout.current = setTimeout(() => { api.searchUsers(groupSearch).then(setGroupSearchResults).catch(() => setGroupSearchResults([])); }, 400);
  }, [groupSearch]);

  // ── File attach handler ──────────────────────────────
  const handleAttachFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("File too large! Max 10MB"); return; }
    const isImage = file.type.startsWith("image/");
    const url = URL.createObjectURL(file);
    setFilePreview({ url, name: file.name, type: file.type, file, isImage });
    e.target.value = "";
  };

  const cancelFile = () => {
    if (filePreview?.url) URL.revokeObjectURL(filePreview.url);
    setFilePreview(null);
  };

  // ── Send message ─────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() && !filePreview) return;
    if (!selectedUser && !selectedGroup) return;

    let content = input.trim();
    let messageType = "text";
    let fileUrl = null;
    let fileName = null;

    setInput("");
    const previewToSend = filePreview;
    setFilePreview(null);

    if (previewToSend) {
      setUploadingFile(true);
      try {
        const res = await api.uploadFile(previewToSend.file);
        fileUrl = res.url;
        fileName = res.filename;
        messageType = previewToSend.isImage ? "image" : "file";
        if (!content) content = previewToSend.isImage ? "📷 Image" : `📎 ${fileName}`;
      } catch (e) {
        alert("File upload failed!");
        setUploadingFile(false);
        return;
      }
      setUploadingFile(false);
    }

    const tempMsg = {
      id: `temp-${Date.now()}`,
      content,
      file_url: fileUrl,
      file_name: fileName,
      message_type: messageType,
      sender_id: currentUser.id,
      receiver_id: selectedUser?.id || null,
      group_id: selectedGroup?.id || null,
      created_at: new Date().toISOString(),
      is_read: false,
      sender_name: currentUser.display_name || currentUser.username,
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const payload = {
        ...(selectedGroup ? { group_id: selectedGroup.id } : { receiver_id: selectedUser.id }),
        content,
        ...(fileUrl ? { file_url: fileUrl, file_name: fileName, message_type: messageType } : {}),
      };
      const res = await api.sendMessage(payload);
      setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? { ...tempMsg, id: res.id || res.message_id } : m));
      if (!selectedGroup) {
        setRecentChats(prev => [{ user_id: selectedUser.id, username: selectedUser.username, display_name: selectedUser.display_name, avatar_url: selectedUser.avatar_url, last_message: content, last_message_time: new Date().toISOString(), unread_count: 0, is_me: true }, ...prev.filter(c => c.user_id !== selectedUser.id)]);
        send({ type: "message", receiver_id: selectedUser.id, content, id: res.id || res.message_id, created_at: new Date().toISOString(), file_url: res.file_url || fileUrl || null, file_name: res.file_name || fileName || null, message_type: messageType });
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setInput(content);
    }
  };

  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const selectUser = (u) => { setSelectedUser(u); setSelectedGroup(null); setSearch(""); setSearchResults([]); if (isMobile) setShowChat(true); };
  const selectGroup = (g) => { setSelectedGroup(g); setSelectedUser(null); if (isMobile) setShowChat(true); };
  const goBack = () => { setShowChat(false); setSelectedUser(null); setSelectedGroup(null); };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Colombo" });
    return d.toLocaleDateString("en-LK", { day: "numeric", month: "short", timeZone: "Asia/Colombo" });
  };

  const isMe = (msg) => msg.sender_id === currentUser.id;
  const avatarLetter = (u) => (u?.display_name || u?.username || u?.name || "?")[0].toUpperCase();
  const avatarColor = (u) => {
    const colors = ["#7c3aed","#6d28d9","#a855f7","#8b5cf6","#9333ea","#5b21b6"];
    return colors[((u?.username || u?.name || "").charCodeAt(0) || 0) % colors.length];
  };
  const av = (size, u) => ({
    width: size, height: size, borderRadius: "50%",
    background: u?.avatar_url ? "transparent" : avatarColor(u),
    backgroundImage: u?.avatar_url ? `url(${u.avatar_url})` : "none",
    backgroundSize: "cover", backgroundPosition: "center",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
  });

  const getDateLabel = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    const toKey = (dt) => dt.toLocaleDateString("en-LK", { timeZone: "Asia/Colombo" });
    if (toKey(d) === toKey(today)) return "Today";
    if (toKey(d) === toKey(yesterday)) return "Yesterday";
    return d.toLocaleDateString("en-LK", { timeZone: "Asia/Colombo", day: "numeric", month: "long", year: "numeric" });
  };
  const getMsgDateKey = (ts) => ts ? new Date(ts).toLocaleDateString("en-LK", { timeZone: "Asia/Colombo" }) : "";

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setSettingsError("Photo 5MB vadiya!"); return; }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = async () => {
    setSettingsLoading(true); setSettingsError(""); setSettingsSuccess("");
    try {
      let avatar_url = currentUser.avatar_url;
      if (avatarFile) { avatar_url = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = (e) => resolve(e.target.result); reader.readAsDataURL(avatarFile); }); }
      const updateData = { display_name: formData.display_name.trim() || currentUser.display_name, username: formData.username.trim() || currentUser.username, bio: formData.bio.trim(), last_seen_visible: formData.last_seen_visible, ...(avatarFile ? { avatar_url } : {}) };
      const updated = await api.updateProfile(updateData);
      const newUser = { ...currentUser, ...updateData, ...updated };
      localStorage.setItem("user", JSON.stringify(newUser));
      setCurrentUser(newUser);
      setSettingsSuccess("Profile update una! ✅");
      setTimeout(() => setSettingsSuccess(""), 3000);
    } catch (e) { setSettingsError(e.message || "Update karanna bari una!"); }
    finally { setSettingsLoading(false); }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      const res = await api.createGroup({ name: newGroupName.trim(), description: newGroupDesc.trim(), member_ids: selectedMembers.map(m => m.id) });
      await loadGroups();
      setShowCreateGroup(false);
      setNewGroupName(""); setNewGroupDesc(""); setSelectedMembers([]); setGroupSearch(""); setGroupSearchResults([]);
      selectGroup({ id: res.group_id, name: res.name, member_count: selectedMembers.length + 1 });
    } catch (e) { alert(e.message); }
    finally { setCreatingGroup(false); }
  };

  const toggleMember = (u) => setSelectedMembers(prev => prev.find(m => m.id === u.id) ? prev.filter(m => m.id !== u.id) : [...prev, u]);

  const totalUnread = recentChats.reduce((s, c) => s + (c.unread_count || 0), 0) + myGroups.reduce((s, g) => s + (g.unread_count || 0), 0);

  const iconBtn = (onClick, Icon, color = "#6b5b9a", size = 20) => (
    <button onClick={onClick} style={{ background: "transparent", border: "none", cursor: "pointer", color, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", width: 36, height: 36, flexShrink: 0 }}
      onMouseEnter={e => e.currentTarget.style.background = "#d8cff0"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <Icon size={size} />
    </button>
  );

  // ── Message bubble renderer ──────────────────────────
  const renderMsgContent = (msg) => {
  const type = msg.message_type || "text";
const fileUrl = msg.file_url || null;

    if (type === "image" && fileUrl) {
      return (
        <div style={{ cursor: "pointer" }} onClick={() => setLightboxImg(fileUrl)}>
          <img src={fileUrl} alt="image" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, display: "block", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
          {msg.content && msg.content !== "📷 Image" && <div style={{ color: "#1e1033", fontSize: 14, marginTop: 4 }}>{msg.content}</div>}
        </div>
      );
    }

    if (type === "file" && fileUrl) {
      const isVideo = fileUrl.match(/\.(mp4|webm|ogg)$/i);
      if (isVideo) {
        return (
          <div>
            <video controls style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8 }}>
              <source src={fileUrl} />
            </video>
          </div>
        );
      }
      return (
        <a href={fileUrl} download={msg.file_name} target="_blank" rel="noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(100,80,180,0.1)", borderRadius: 8, padding: "10px 12px", textDecoration: "none" }}>
          <FileText size={28} color="#7c3aed" />
          <div>
            <div style={{ color: "#1e1033", fontSize: 13, fontWeight: 500 }}>{msg.file_name || "File"}</div>
            <div style={{ color: "#6b5b9a", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}><Download size={11} /> Download</div>
          </div>
        </a>
      );
    }

    return <div style={{ color: "#1e1033", fontSize: 14, lineHeight: 1.45 }}>{msg.content}</div>;
  };

  const chatTarget = selectedGroup || selectedUser;
  const isGroup = !!selectedGroup;

  // ── Sidebar ──────────────────────────────────────────
  const Sidebar = (
    <div style={{ width: isMobile ? "100vw" : "360px", display: "flex", flexDirection: "column", background: "#f3f0fa", borderRight: isMobile ? "none" : "1px solid #2a3942", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ ...av(40, currentUser), cursor: "pointer" }} onClick={() => setShowSettings(true)}>{!currentUser.avatar_url && avatarLetter(currentUser)}</div>
          <span style={{ color: "#1e1033", fontWeight: 600, fontSize: 15 }}>{currentUser.display_name || currentUser.username}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {totalUnread > 0 && <div style={{ background: "#7c3aed", borderRadius: 10, padding: "2px 7px", color: "#fff", fontSize: 11, fontWeight: 700 }}>{totalUnread}</div>}
          {iconBtn(() => setShowSettings(true), Settings)}
          {iconBtn(onLogout, LogOut)}
        </div>
      </div>

      <div style={{ display: "flex", background: "#ffffff", borderBottom: "1px solid #2a3942" }}>
        {["chats","groups"].map(tab => {
          const tabUnread = tab === "chats" ? recentChats.reduce((s, c) => s + (c.unread_count || 0), 0) : myGroups.reduce((s, g) => s + (g.unread_count || 0), 0);
          return (
            <button key={tab} onClick={() => setSidebarTab(tab)}
              style={{ flex: 1, padding: "10px", border: "none", background: "transparent", color: sidebarTab === tab ? "#7c3aed" : "#6b5b9a", fontSize: 13, fontWeight: 600, cursor: "pointer", borderBottom: sidebarTab === tab ? "2px solid #7c3aed" : "2px solid transparent", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {tab === "chats" ? <><MessageCircle size={15} /> Chats</> : <><Users size={15} /> Groups</>}
              {tabUnread > 0 && <span style={{ background: "#7c3aed", borderRadius: 10, padding: "1px 6px", color: "#fff", fontSize: 11, fontWeight: 700 }}>{tabUnread}</span>}
            </button>
          );
        })}
      </div>

      {sidebarTab === "chats" && (
        <div style={{ padding: "8px 12px", background: "#f3f0fa" }}>
          <div style={{ display: "flex", alignItems: "center", background: "#ffffff", borderRadius: 8, padding: "8px 12px", gap: 8 }}>
            <Search size={16} color="#6b5b9a" />
            <input style={{ flex: 1, background: "transparent", border: "none", color: "#1e1033", fontSize: 14, outline: "none" }} placeholder="Search or start new chat" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      )}

      {sidebarTab === "groups" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#f3f0fa" }}>
          <span style={{ color: "#6b5b9a", fontSize: 13 }}>Your Groups</span>
          <button onClick={() => setShowCreateGroup(true)} style={{ background: "#7c3aed", border: "none", borderRadius: 20, padding: "6px 14px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <Plus size={14} /> New Group
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {sidebarTab === "chats" && (
          <>
            {search.trim() ? (
              <>
                {searching && <div style={{ color: "#6b5b9a", textAlign: "center", padding: 16, fontSize: 13 }}>Searching...</div>}
                {!searching && searchResults.length === 0 && <div style={{ color: "#6b5b9a", textAlign: "center", padding: 24, fontSize: 13 }}>No users found</div>}
                {searchResults.map((u) => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", background: selectedUser?.id === u.id ? "#d8cff0" : "transparent", borderBottom: "1px solid #1f2c33" }} onClick={() => selectUser(u)}>
                    <div style={av(46, u)}>{!u.avatar_url && avatarLetter(u)}</div>
                    <div><div style={{ color: "#1e1033", fontSize: 15, fontWeight: 500 }}>{u.display_name || u.username}</div><div style={{ color: "#6b5b9a", fontSize: 13, marginTop: 2 }}>Tap to chat</div></div>
                  </div>
                ))}
              </>
            ) : (
              <>
                {recentChats.length === 0 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, gap: 12 }}>
                    <MessageCircle size={48} color="#d8cff0" />
                    <span style={{ color: "#6b5b9a", fontSize: 13, textAlign: "center" }}>Search for a user to start chatting</span>
                  </div>
                )}
                {recentChats.map((chat) => (
                  <div key={chat.user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", background: selectedUser?.id === chat.user_id ? "#d8cff0" : "transparent", borderBottom: "1px solid #1f2c33" }}
                    onClick={() => selectUser({ id: chat.user_id, username: chat.username, display_name: chat.display_name, avatar_url: chat.avatar_url })}>
                    <div style={av(46, chat)}>{!chat.avatar_url && avatarLetter(chat)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ color: "#1e1033", fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chat.display_name || chat.username}</div>
                        <div style={{ color: chat.unread_count > 0 ? "#7c3aed" : "#6b5b9a", fontSize: 11, flexShrink: 0, marginLeft: 8 }}>{formatTime(chat.last_message_time)}</div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
                        <div style={{ color: "#6b5b9a", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
                          {chat.is_me && <CheckCheck size={14} color="#7c3aed" />}
                          {chat.last_message}
                        </div>
                        {chat.unread_count > 0 && <div style={{ background: "#7c3aed", borderRadius: 10, padding: "2px 7px", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{chat.unread_count}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
        {sidebarTab === "groups" && (
          <>
            {myGroups.length === 0 && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 40, gap: 12 }}><Users size={48} color="#d8cff0" /><span style={{ color: "#6b5b9a", fontSize: 13 }}>No groups yet!</span></div>}
            {myGroups.map((g) => (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", background: selectedGroup?.id === g.id ? "#d8cff0" : "transparent", borderBottom: "1px solid #1f2c33" }} onClick={() => selectGroup(g)}>
                <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Users size={22} color="#fff" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ color: "#1e1033", fontSize: 15, fontWeight: 500 }}>{g.name}</div>
                    {g.unread_count > 0 && <div style={{ background: "#7c3aed", borderRadius: 10, padding: "2px 7px", color: "#fff", fontSize: 11, fontWeight: 700 }}>{g.unread_count}</div>}
                  </div>
                  <div style={{ color: "#6b5b9a", fontSize: 13, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.last_message || `${g.member_count} members`}</div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );

  // ── Chat View ──────────────────────────────────────
  const Chat = chatTarget && (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#ede8f7", height: "100%", width: isMobile ? "100vw" : "auto", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#ffffff", borderBottom: "1px solid #2a3942", flexShrink: 0 }}>
        {isMobile && iconBtn(goBack, ArrowLeft, "#1e1033")}
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: isGroup ? "#7c3aed" : avatarColor(chatTarget), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, flexShrink: 0, fontSize: 16, overflow: "hidden" }}>
          {isGroup ? <Users size={20} color="#fff" /> : chatTarget.avatar_url ? <img src={chatTarget.avatar_url} style={{ width: 40, height: 40, objectFit: "cover" }} /> : avatarLetter(chatTarget)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#1e1033", fontSize: 16, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isGroup ? chatTarget.name : (chatTarget.display_name || chatTarget.username)}</div>
          <div style={{ color: "#6b5b9a", fontSize: 12 }}>{isGroup ? `${chatTarget.member_count || ""} members` : ""}</div>
        </div>
        {!isGroup && <>{iconBtn(() => startCall(selectedUser, false), Phone)}{iconBtn(() => startCall(selectedUser, true), Video)}</>}
        {isGroup && iconBtn(() => startGroupCall(selectedGroup), Video, "#7c3aed")}
        {iconBtn(() => {}, MoreVertical)}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px" : "12px 60px", display: "flex", flexDirection: "column", gap: 4 }}>
        {loadingMsgs && <div style={{ color: "#6b5b9a", textAlign: "center", padding: 16 }}>Loading...</div>}
        {messages.map((msg, i) => {
          const showDate = i === 0 || getMsgDateKey(msg.created_at) !== getMsgDateKey(messages[i - 1]?.created_at);
          const me = isMe(msg);
          return (
            <div key={msg.id || i} style={{ display: "contents" }}>
              {showDate && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0", alignSelf: "stretch" }}>
                  <div style={{ flex: 1, height: 1, background: "#d8cff0" }} />
                  <span style={{ color: "#6b5b9a", fontSize: 12, background: "#e8e0f8", padding: "2px 10px", borderRadius: 8, border: "1px solid #2a3942", whiteSpace: "nowrap" }}>{getDateLabel(msg.created_at)}</span>
                  <div style={{ flex: 1, height: 1, background: "#d8cff0" }} />
                </div>
              )}
              <div style={{ maxWidth: isMobile ? "85%" : "65%", padding: "7px 12px 5px", borderRadius: me ? "8px 0px 8px 8px" : "0px 8px 8px 8px", background: me ? "#ede0ff" : "#f8f5ff", alignSelf: me ? "flex-end" : "flex-start", wordBreak: "break-word", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>
                {isGroup && !me && <div style={{ color: "#7c3aed", fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{msg.sender_name || `User ${msg.sender_id}`}</div>}
                {renderMsgContent(msg)}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 3 }}>
                  <span style={{ color: "#6b5b9a", fontSize: 11 }}>{formatTime(msg.created_at)}</span>
                  {me && (msg.is_read ? <CheckCheck size={14} color="#7c3aed" /> : <Check size={14} color="#6b5b9a" />)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* File preview bar */}
      {filePreview && (
        <div style={{ background: "#ede8f7", borderTop: "1px solid #2a3942", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          {filePreview.isImage ? (
            <img src={filePreview.url} style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} alt="preview" />
          ) : (
            <div style={{ width: 60, height: 60, borderRadius: 8, background: "#d8cff0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileText size={28} color="#7c3aed" />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#1e1033", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{filePreview.name}</div>
            <div style={{ color: "#6b5b9a", fontSize: 12 }}>{filePreview.isImage ? "Image" : "File"} • {(filePreview.file.size / 1024).toFixed(0)} KB</div>
          </div>
          <button onClick={cancelFile} style={{ background: "none", border: "none", color: "#6b5b9a", cursor: "pointer" }}><X size={20} /></button>
        </div>
      )}

      {/* Input */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "8px 12px", background: "#ffffff", flexShrink: 0 }}>
        <input ref={attachInputRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.zip,.txt" style={{ display: "none" }} onChange={handleAttachFile} />
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", background: "#d8cff0", borderRadius: 10, padding: "6px 12px", gap: 8 }}>
          <button onClick={() => attachInputRef.current?.click()} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b5b9a", flexShrink: 0, marginBottom: 2, display: "flex", padding: 0 }}>
            <Paperclip size={22} />
          </button>
          <textarea
            style={{ flex: 1, background: "transparent", border: "none", color: "#1e1033", fontSize: 15, outline: "none", resize: "none", maxHeight: 120, lineHeight: 1.4, fontFamily: "inherit", minHeight: 28, padding: "2px 0" }}
            rows={1} placeholder={filePreview ? "Add a caption..." : "Type a message"} value={input}
            onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
          />
        </div>
        <button onClick={sendMessage} disabled={uploadingFile}
          style={{ width: 46, height: 46, borderRadius: "50%", background: uploadingFile ? "#d8cff0" : "#7c3aed", border: "none", cursor: uploadingFile ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {uploadingFile ? <div style={{ width: 18, height: 18, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> : <Send size={20} color="#fff" />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        * { box-sizing: border-box; } body { margin: 0; overflow: hidden; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #2a3942; border-radius: 3px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.08); } }
      `}</style>
      <div style={{ display: "flex", height: "100dvh", width: "100vw", background: "#ede8f7", fontFamily: "'Segoe UI', sans-serif", overflow: "hidden" }}>

        {isMobile ? (showChat && chatTarget ? Chat : Sidebar) : (
          <>{Sidebar}{chatTarget ? Chat : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#6b5b9a", gap: 16 }}>
              <MessageCircle size={80} color="#d8cff0" />
              <div style={{ fontSize: 20, fontWeight: 300, color: "#1e1033" }}>ChatApp Web</div>
              <div style={{ fontSize: 14 }}>Select a chat or search for a user</div>
            </div>
          )}</>
        )}

        {/* Image Lightbox */}
        {lightboxImg && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(40,20,80,0.97)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000 }} onClick={() => setLightboxImg(null)}>
            <button onClick={() => setLightboxImg(null)} style={{ position: "absolute", top: 16, right: 16, background: "rgba(80,40,140,0.5)", border: "none", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={20} color="#fff" />
            </button>
            <img src={lightboxImg} style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8 }} onClick={e => e.stopPropagation()} />
            <a href={lightboxImg} download style={{ position: "absolute", bottom: 24, background: "#7c3aed", border: "none", borderRadius: 20, padding: "10px 20px", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
              <Download size={16} /> Download
            </a>
          </div>
        )}

        {/* Incoming Group Call Banner */}
        {gcIncoming && !groupCall && (
          <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#ffffff", borderRadius: 16, padding: "16px 20px", boxShadow: "0 8px 32px rgba(124,58,237,0.25)", zIndex: 2500, display: "flex", alignItems: "center", gap: 16, minWidth: 300, border: "2px solid #7c3aed" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, animation: "pulse 1.2s infinite" }}>
              <Video size={22} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#1e1033", fontWeight: 600, fontSize: 14 }}>{gcIncoming.groupName}</div>
              <div style={{ color: "#6b5b9a", fontSize: 12 }}>{gcIncoming.callerName} is calling...</div>
            </div>
            <button onClick={() => joinGroupCall(gcIncoming)} style={{ background: "#7c3aed", border: "none", borderRadius: 22, padding: "8px 16px", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Join</button>
            <button onClick={() => setGcIncoming(null)} style={{ background: "#f3e8ff", border: "none", borderRadius: 22, padding: "8px 12px", color: "#7c3aed", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Decline</button>
          </div>
        )}

        {/* Group Call Overlay */}
        {groupCall && (
          <div style={{ position: "fixed", inset: 0, background: "linear-gradient(135deg, #1e1033 0%, #3b1f6e 100%)", display: "flex", flexDirection: "column", zIndex: 2000 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px" }}>
              <div>
                <div style={{ color: "#e9d5ff", fontSize: 18, fontWeight: 700 }}>{groupCall.groupName}</div>
                <div style={{ color: "#a78bfa", fontSize: 13, marginTop: 2 }}>
                  {groupCall.status === "outgoing" ? "Calling..." : `${Object.keys(groupCall.participants).length + 1} in call`}
                </div>
              </div>
              <div style={{ color: "#a78bfa", fontSize: 12 }}>
                {gcScreenSharing && <span style={{ background: "rgba(124,58,237,0.4)", borderRadius: 8, padding: "4px 10px" }}>📡 Screen sharing</span>}
              </div>
            </div>

            {/* Video Grid */}
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: Object.keys(groupCall.participants).length === 0 ? "1fr" : Object.keys(groupCall.participants).length === 1 ? "1fr 1fr" : "repeat(auto-fit, minmax(240px, 1fr))", gap: 8, padding: "0 12px", alignItems: "center" }}>
              {/* Local video tile */}
              <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#2d1b69", aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid rgba(167,139,250,0.3)" }}>
                <video ref={localGcVideoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: gcVideoOff && !gcScreenSharing ? "none" : "block" }} />
                {gcVideoOff && !gcScreenSharing && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 64, height: 64, borderRadius: "50%", background: avatarColor(currentUser), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: "#fff", fontWeight: 700 }}>{avatarLetter(currentUser)}</div>
                    <span style={{ color: "#a78bfa", fontSize: 12 }}>Camera off</span>
                  </div>
                )}
                <div style={{ position: "absolute", bottom: 8, left: 10, color: "#e9d5ff", fontSize: 12, fontWeight: 600, background: "rgba(0,0,0,0.4)", borderRadius: 6, padding: "2px 8px" }}>
                  You {gcMuted ? "🔇" : ""}
                </div>
              </div>

              {/* Remote participant tiles */}
              {Object.entries(groupCall.participants).map(([uid, p]) => (
                <div key={uid} style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#2d1b69", aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid rgba(167,139,250,0.3)" }}>
                  <video ref={el => { gcRemoteVideosRef.current[uid] = el; if (el && p.stream) el.srcObject = p.stream; }} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: p.stream ? "block" : "none" }} />
                  {!p.stream && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: "#fff", fontWeight: 700 }}>{(p.name || "?")[0].toUpperCase()}</div>
                      <span style={{ color: "#a78bfa", fontSize: 12 }}>Connecting...</span>
                    </div>
                  )}
                  <div style={{ position: "absolute", bottom: 8, left: 10, color: "#e9d5ff", fontSize: 12, fontWeight: 600, background: "rgba(0,0,0,0.4)", borderRadius: 6, padding: "2px 8px" }}>{p.name || `User ${uid}`}</div>
                </div>
              ))}

              {groupCall.status === "outgoing" && Object.keys(groupCall.participants).length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "#a78bfa" }}>
                  <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(124,58,237,0.3)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pulse 1.5s infinite" }}>
                    <Users size={36} color="#a78bfa" />
                  </div>
                  <span>Waiting for others to join...</span>
                </div>
              )}
            </div>

            {/* Controls */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "20px 16px 28px" }}>
              <button onClick={toggleGcMute} style={{ width: 56, height: 56, borderRadius: "50%", background: gcMuted ? "#dc2626" : "rgba(167,139,250,0.2)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}>
                {gcMuted ? <MicOff size={24} color="#fff" /> : <Mic size={24} color="#e9d5ff" />}
              </button>
              <button onClick={toggleGcVideo} style={{ width: 56, height: 56, borderRadius: "50%", background: gcVideoOff ? "#dc2626" : "rgba(167,139,250,0.2)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}>
                {gcVideoOff ? <VideoOff size={24} color="#fff" /> : <Video size={24} color="#e9d5ff" />}
              </button>
              <button onClick={toggleGcScreen} style={{ width: 56, height: 56, borderRadius: "50%", background: gcScreenSharing ? "#7c3aed" : "rgba(167,139,250,0.2)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}>
                <Monitor size={24} color={gcScreenSharing ? "#fff" : "#e9d5ff"} />
              </button>
              <button onClick={endGroupCall} style={{ width: 64, height: 64, borderRadius: "50%", background: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(220,38,38,0.5)" }}>
                <PhoneOff size={28} color="#fff" />
              </button>
            </div>
          </div>
        )}

        {/* Create Group Modal */}
        {showCreateGroup && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(80,40,140,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={(e) => e.target === e.currentTarget && setShowCreateGroup(false)}>
            <div style={{ background: "#ffffff", borderRadius: 16, width: 460, maxWidth: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #2a3942" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#1e1033", fontSize: 18, fontWeight: 600 }}><Users size={20} /> Create Group</div>
                <button onClick={() => setShowCreateGroup(false)} style={{ background: "none", border: "none", color: "#6b5b9a", cursor: "pointer" }}><X size={22} /></button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                {[{ label: "Group Name *", val: newGroupName, set: setNewGroupName, ph: "Enter group name", max: 100 }, { label: "Description", val: newGroupDesc, set: setNewGroupDesc, ph: "Optional", max: 200 }].map(f => (
                  <div key={f.label}>
                    <span style={{ fontSize: 12, color: "#6b5b9a", marginBottom: 6, display: "block" }}>{f.label}</span>
                    <input style={{ width: "100%", background: "#f3f0fa", border: "1px solid #2a3942", borderRadius: 10, padding: "10px 14px", color: "#1e1033", fontSize: 14, outline: "none", boxSizing: "border-box" }} placeholder={f.ph} value={f.val} onChange={(e) => f.set(e.target.value)} maxLength={f.max} />
                  </div>
                ))}
                <div>
                  <span style={{ fontSize: 12, color: "#6b5b9a", marginBottom: 6, display: "block" }}>Add Members</span>
                  <div style={{ display: "flex", alignItems: "center", background: "#f3f0fa", border: "1px solid #2a3942", borderRadius: 10, padding: "8px 12px", gap: 8 }}>
                    <Search size={15} color="#6b5b9a" />
                    <input style={{ flex: 1, background: "transparent", border: "none", color: "#1e1033", fontSize: 14, outline: "none" }} placeholder="Search users..." value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} />
                  </div>
                  {groupSearchResults.length > 0 && (
                    <div style={{ background: "#f3f0fa", borderRadius: 10, marginTop: 8, border: "1px solid #2a3942", overflow: "hidden" }}>
                      {groupSearchResults.map(u => (
                        <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #2a3942" }} onClick={() => toggleMember(u)}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={av(34, u)}>{!u.avatar_url && avatarLetter(u)}</div>
                            <span style={{ color: "#1e1033", fontSize: 14 }}>{u.display_name || u.username}</span>
                          </div>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: selectedMembers.find(m => m.id === u.id) ? "#7c3aed" : "#d8cff0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {selectedMembers.find(m => m.id === u.id) ? <Check size={13} color="#fff" /> : <Plus size={13} color="#fff" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedMembers.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {selectedMembers.map(m => (
                        <div key={m.id} style={{ background: "#d8cff0", borderRadius: 20, padding: "4px 10px 4px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "#1e1033", fontSize: 13 }}>{m.display_name || m.username}</span>
                          <button onClick={() => toggleMember(m)} style={{ background: "none", border: "none", color: "#6b5b9a", cursor: "pointer", display: "flex", padding: 0 }}><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()} style={{ width: "100%", background: "#7c3aed", border: "none", borderRadius: 10, padding: 12, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: (creatingGroup || !newGroupName.trim()) ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Check size={16} /> {creatingGroup ? "Creating..." : "Create Group"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Call Overlay */}
        {callState && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(40,20,80,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
            <video ref={remoteVideoRef} autoPlay playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: callState.isVideo && callState.status === "active" ? "block" : "none" }} />
            <video ref={localVideoRef} autoPlay playsInline muted style={{ position: "absolute", bottom: 120, right: 20, width: 140, borderRadius: 12, border: "2px solid #2a3942", display: callState.isVideo && callState.status === "active" ? "block" : "none" }} />
            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div style={{ width: 100, height: 100, borderRadius: "50%", background: avatarColor(callState.remoteUser), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, color: "#fff", fontWeight: 700 }}>{avatarLetter(callState.remoteUser)}</div>
              <div style={{ color: "#1e1033", fontSize: 24, fontWeight: 600 }}>{callState.remoteUser.display_name || callState.remoteUser.username || `User ${callState.remoteUser.id}`}</div>
              <div style={{ color: "#6b5b9a", fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
                {callState.status === "outgoing" && <><Phone size={16} /> Calling...</>}
                {callState.status === "incoming" && <><Phone size={16} /> Incoming call...</>}
                {callState.status === "active" && <><div style={{ width: 8, height: 8, borderRadius: "50%", background: "#7c3aed" }} /> Connected</>}
              </div>
              <div style={{ display: "flex", gap: 32, marginTop: 16 }}>
                {callState.status === "incoming" && (
                  <>
                    <button onClick={answerCall} style={{ width: 64, height: 64, borderRadius: "50%", background: "#7c3aed", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Phone size={28} color="#fff" /></button>
                    <button onClick={() => endCall(callState.remoteUser.id)} style={{ width: 64, height: 64, borderRadius: "50%", background: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={28} color="#fff" /></button>
                  </>
                )}
                {(callState.status === "outgoing" || callState.status === "active") && (
                  <button onClick={() => endCall(callState.remoteUser.id)} style={{ width: 64, height: 64, borderRadius: "50%", background: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Phone size={28} color="#fff" style={{ transform: "rotate(135deg)" }} /></button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettings && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(80,40,140,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={(e) => e.target === e.currentTarget && setShowSettings(false)}>
            <div style={{ background: "#ffffff", borderRadius: 16, width: 460, maxWidth: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #2a3942" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#1e1033", fontSize: 18, fontWeight: 600 }}><Settings size={20} /> Settings</div>
                <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", color: "#6b5b9a", cursor: "pointer" }}><X size={22} /></button>
              </div>
              <div style={{ padding: "12px 20px 0" }}>
                <div style={{ display: "flex", gap: 4, background: "#f3f0fa", borderRadius: 10, padding: 4 }}>
                  {["profile","privacy"].map(tab => (
                    <button key={tab} onClick={() => setSettingsTab(tab)} style={{ flex: 1, padding: 8, border: "none", borderRadius: 8, background: settingsTab === tab ? "#d8cff0" : "transparent", color: settingsTab === tab ? "#1e1033" : "#6b5b9a", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                      {tab === "profile" ? "👤 Profile" : "🔒 Privacy"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
                {settingsError && <div style={{ background: "rgba(248,81,73,0.1)", borderRadius: 8, padding: "10px 14px", color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{settingsError}</div>}
                {settingsSuccess && <div style={{ background: "rgba(124,58,237,0.1)", borderRadius: 8, padding: "10px 14px", color: "#7c3aed", fontSize: 13, marginBottom: 12 }}>{settingsSuccess}</div>}
                {settingsTab === "profile" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div>
                      <span style={{ fontSize: 12, color: "#6b5b9a", marginBottom: 6, display: "block" }}>Profile Photo</span>
                      <div onClick={() => fileInputRef.current?.click()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 20, background: "#f3f0fa", borderRadius: 12, border: "2px dashed #2a3942", cursor: "pointer" }}>
                        {avatarPreview ? <img src={avatarPreview} style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover" }} alt="avatar" /> : <div style={{ width: 80, height: 80, borderRadius: "50%", background: avatarColor(currentUser), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "#fff", fontWeight: 600 }}>{avatarLetter(currentUser)}</div>}
                        <span style={{ color: "#6b5b9a", fontSize: 13 }}>📷 Click karala photo change karanna</span>
                      </div>
                      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
                    </div>
                    {[{ label: "Display Name", key: "display_name", placeholder: "Oyage nama" }, { label: "Username", key: "username", placeholder: "username" }].map(f => (
                      <div key={f.key}>
                        <span style={{ fontSize: 12, color: "#6b5b9a", marginBottom: 6, display: "block" }}>{f.label}</span>
                        <input style={{ width: "100%", background: "#f3f0fa", border: "1px solid #2a3942", borderRadius: 10, padding: "10px 14px", color: "#1e1033", fontSize: 14, outline: "none", boxSizing: "border-box" }} value={formData[f.key]} onChange={(e) => setFormData(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                      </div>
                    ))}
                    <div>
                      <span style={{ fontSize: 12, color: "#6b5b9a", marginBottom: 6, display: "block" }}>Bio</span>
                      <textarea style={{ width: "100%", background: "#f3f0fa", border: "1px solid #2a3942", borderRadius: 10, padding: "10px 14px", color: "#1e1033", fontSize: 14, outline: "none", boxSizing: "border-box", resize: "vertical", minHeight: 80, fontFamily: "inherit" }} value={formData.bio} onChange={(e) => setFormData(p => ({ ...p, bio: e.target.value }))} placeholder="Oyage gena kota dekak..." maxLength={300} />
                    </div>
                  </div>
                )}
                {settingsTab === "privacy" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "#f3f0fa", borderRadius: 10 }}>
                      <div>
                        <div style={{ color: "#1e1033", fontSize: 14, fontWeight: 500 }}>Last Seen</div>
                        <div style={{ color: "#6b5b9a", fontSize: 12, marginTop: 3 }}>{formData.last_seen_visible ? "Anith users walata pennewa" : "Hide karala thiyanawa"}</div>
                      </div>
                      <button onClick={() => setFormData(p => ({ ...p, last_seen_visible: !p.last_seen_visible }))} style={{ width: 44, height: 24, borderRadius: 12, background: formData.last_seen_visible ? "#7c3aed" : "#d8cff0", border: "none", cursor: "pointer", position: "relative" }}>
                        <div style={{ position: "absolute", top: 3, left: formData.last_seen_visible ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                      </button>
                    </div>
                  </div>
                )}
                <button onClick={handleSaveSettings} disabled={settingsLoading} style={{ width: "100%", background: "#7c3aed", border: "none", borderRadius: 10, padding: 12, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 16, opacity: settingsLoading ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Check size={16} /> {settingsLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
