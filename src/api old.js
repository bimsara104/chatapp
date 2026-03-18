const BASE_URL = import.meta.env.VITE_API_URL || "";
async function request(path, options = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Request failed");
  }

  return res.json();
}

export const api = {
  register: (data) => request("/api/auth/register", { method: "POST", body: JSON.stringify(data) }),
  login: (data) => request("/api/auth/login", { method: "POST", body: JSON.stringify(data) }),
  getMe: () => request("/api/users/me"),
  searchUsers: (q) => request(`/api/users/search?q=${encodeURIComponent(q)}`),
  sendMessage: (data) => request("/api/messages/send", { method: "POST", body: JSON.stringify(data) }),
  getConversation: (userId, skip = 0) => request(`/api/messages/conversation/${userId}?skip=${skip}&limit=50`),
  markRead: (userId) => request(`/api/messages/read/${userId}`, { method: "PUT" }),
  createGroup: (data) => request("/api/groups/create", { method: "POST", body: JSON.stringify(data) }),
  getMyGroups: () => request("/api/groups/my-groups"),
};

// OTP endpoints
api.sendOTP = (phone) => request("/api/auth/send-otp", { method: "POST", body: JSON.stringify({ phone }) });
api.verifyOTP = (data) => request("/api/auth/verify-otp", { method: "POST", body: JSON.stringify(data) });
api.whatsappStatus = () => request("/api/auth/whatsapp-status");
