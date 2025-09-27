import { client } from "../../supabase.js";

document.addEventListener("DOMContentLoaded", async () => {
    const DEFAULT_PROFILE_IMG = "./assets/icon/download.jpeg";
    const ADMIN_USERNAME = "Saim_Malik88";
    const ADMIN_REQUEST_KEY = "adminRequestShown";

    // Global state management
    const state = {
        currentUserId: null,
        friendRequests: [],
        unseenCounts: {},
        currentOpenChatId: null,
        notificationData: {},
        deletionTimeouts: {},
        processingMessageIds: new Set(),
        allFriends: new Map(),
        onlineStatusInterval: null,
        activeChannels: new Set(),
        messageQueue: [],
        isProcessingQueue: false
    };

    // Helper function for retrying database operations
    async function withRetry(fn, maxRetries = 3, initialDelay = 500) {
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                console.log(`Attempt ${attempt} failed:`, error.message);

                if (attempt === maxRetries) break;

                const delay = initialDelay * Math.pow(2, attempt - 1) + Math.random() * 200;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    // Ensure user profile exists
    async function ensureUserProfileExists(userId) {
        try {
            const { data: existingProfile } = await client
                .from("user_profiles")
                .select("user_id")
                .eq("user_id", userId)
                .maybeSingle();

            if (existingProfile) return true;

            console.log(`User profile ${userId} not found, creating...`);

            const { data: { user } } = await client.auth.getUser();
            if (!user) return false;

            const { error } = await client
                .from("user_profiles")
                .insert([{
                    user_id: userId,
                    user_name: user.user_metadata?.full_name || user.email?.split('@')[0] || "User",
                    full_name: user.user_metadata?.full_name || "",
                    bio: "",
                    profile_image_url: user.user_metadata?.avatar_url || "",
                    is_online: true,
                    last_seen: new Date().toISOString()
                }]);

            if (error) {
                console.error("Error creating user profile:", error);
                return false;
            }

            console.log(`User profile ${userId} created successfully`);
            return true;
        } catch (err) {
            console.error("Error ensuring user profile exists:", err);
            return false;
        }
    }

    // Ensure user exists in private_users table
    async function ensureUserExists(userId) {
        return withRetry(async () => {
            const { data: existingUser } = await client
                .from("private_users")
                .select("id")
                .eq("id", userId)
                .maybeSingle();

            if (existingUser) return true;

            console.log(`User ${userId} not found, attempting to create...`);

            const { data: profile } = await client
                .from("user_profiles")
                .select("user_name")
                .eq("user_id", userId)
                .maybeSingle();

            if (!profile) throw new Error("User profile not found");

            await client
                .from("private_users")
                .insert([{
                    id: userId,
                    name: profile.user_name || "User",
                    email: `${userId}@placeholder.com`
                }]);

            console.log(`User ${userId} created successfully`);
            return true;
        });
    }

    // Process message queue to handle rapid message sending
    async function processMessageQueue() {
        if (state.isProcessingQueue || state.messageQueue.length === 0) return;
        
        state.isProcessingQueue = true;
        const { friendId, content } = state.messageQueue.shift();
        
        try {
            await sendMessageInternal(friendId, content);
        } catch (err) {
            console.error("Error processing queued message:", err);
            showToast("Failed to send message. Please try again.", "error");
        } finally {
            state.isProcessingQueue = false;
            processMessageQueue();
        }
    }

    // Internal message sending function
    async function sendMessageInternal(senderId, receiverId, content) {
        try {
            console.log(`Inserting message from ${senderId} to ${receiverId}`);

            await ensureUserExists(senderId);
            await ensureUserExists(receiverId);

            let retries = 3;
            while (retries > 0) {
                try {
                    const { data, error } = await client
                        .from("messages")
                        .insert({
                            sender_id: senderId,
                            receiver_id: receiverId,
                            content: content
                        })
                        .select()
                        .single();

                    if (error) throw error;
                    console.log("Message inserted successfully");
                    return true;
                } catch (err) {
                    retries--;
                    if (err.code === '23503') { // Foreign key violation
                        await ensureUserExists(senderId);
                        await ensureUserExists(receiverId);
                        if (retries > 0) await new Promise(resolve => setTimeout(resolve, 2000));
                    } else if (err.code === '409' || err.code === '23505') { // Conflict
                        if (retries > 0) await new Promise(resolve => setTimeout(resolve, 1000));
                    } else break;
                }
            }
            return false;
        } catch (err) {
            console.error("Error in insertMessage:", err);
            return false;
        }
    }

    // Enhanced sendMessage function
    async function sendMessage(friendId, content) {
        if (!content || !content.trim()) return;

        try {
            await ensureUserExists(state.currentUserId);
            await ensureUserExists(friendId);

            // Add to queue instead of sending directly
            state.messageQueue.push({ friendId, content });
            processMessageQueue();
        } catch (err) {
            console.error("Error in sendMessage:", err);
            showToast("Message failed to send. Please try again.", "error");
        }
    }

    // Update last message only for specific friend
    function updateLastMessage(friendId, content, createdAt) {
        try {
            if (!friendId) {
                console.error("No friendId provided to updateLastMessage");
                return;
            }

            const friendIdStr = String(friendId);
            const chatLi = document.querySelector(`.chat[data-friend-id="${friendIdStr}"]`);
            if (!chatLi) {
                console.warn(`Chat element not found for friendId: ${friendIdStr}`);
                return;
            }

            const lastMessageEl = chatLi.querySelector(".last-message");
            const timeEl = chatLi.querySelector(".time");

            if (lastMessageEl) lastMessageEl.textContent = content;
            if (timeEl) {
                const timeStr = new Date(createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                });
                timeEl.textContent = timeStr;
            }

            // Move chat to top of list
            const chatList = chatLi.parentElement;
            if (chatList && chatList.firstChild !== chatLi) {
                chatList.prepend(chatLi);
            }
        } catch (error) {
            console.error("Error updating last message:", error);
            showToast("Failed to update message preview", "error");
        }
    }

    // Update user online status
    async function setUserOnlineStatus(isOnline) {
        if (!state.currentUserId) return;
        try {
            console.log(`Setting user ${state.currentUserId} online status to: ${isOnline}`);
            await client.from('user_profiles')
                .upsert({
                    user_id: state.currentUserId,
                    is_online: isOnline,
                    last_seen: new Date().toISOString()
                }, {
                    onConflict: 'user_id'
                });

            updateCurrentUserStatusUI(isOnline);
        } catch (err) {
            console.error("Error updating online status:", err);
        }
    }

    // Update current user's status UI
    function updateCurrentUserStatusUI(isOnline) {
        try {
            const headerStatusElement = document.querySelector('.header-user-status');
            if (headerStatusElement) {
                headerStatusElement.textContent = isOnline ? "Online" : "Offline";
                headerStatusElement.className = isOnline ? "header-user-status online" : "header-user-status offline";
            }

            const popupStatusElement = document.querySelector('.popup-user-status');
            if (popupStatusElement) {
                popupStatusElement.textContent = isOnline ? "Online" : "Offline";
                popupStatusElement.className = isOnline ? "popup-user-status online" : "popup-user-status offline";
            }
        } catch (error) {
            console.error("Error updating current user status UI:", error);
        }
    }

    // Periodic online status check with cleanup
    function setupOnlineStatusCheck() {
        if (state.onlineStatusInterval) {
            clearInterval(state.onlineStatusInterval);
        }

        state.onlineStatusInterval = setInterval(async () => {
            if (state.currentUserId) {
                try {
                    await setUserOnlineStatus(true);
                } catch (err) {
                    console.error("Error in periodic status check:", err);
                }
            }
        }, 30000);
    }

    // UI Helper Functions
    function showModal(modalId) {
        try {
            const modal = document.getElementById(modalId);
            if (!modal) return;

            modal.classList.remove('hidden');
            modal.offsetHeight;
            modal.classList.add('show');
        } catch (error) {
            console.error("Error showing modal:", error);
        }
    }

    function hideModal(modalId) {
        try {
            const modal = document.getElementById(modalId);
            if (!modal) return;

            modal.classList.remove('show');
            setTimeout(() => modal.classList.add('hidden'), 300);
        } catch (error) {
            console.error("Error hiding modal:", error);
        }
    }

    function showToast(message, type = "info") {
        try {
            const toast = document.getElementById("toast-notification");
            const messageEl = document.getElementById("toast-message");
            if (!toast || !messageEl) return;

            messageEl.textContent = message;
            toast.classList.remove("hidden", "success", "error", "info", "warning");
            toast.classList.add("show", type);

            const closeBtn = document.getElementById("toast-close");
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    toast.classList.remove("show");
                    setTimeout(() => toast.classList.add('hidden'), 300);
                });
            }

            setTimeout(() => {
                toast.classList.remove("show");
                setTimeout(() => toast.classList.add("hidden"), 300);
            }, 3000);
        } catch (error) {
            console.error("Error showing toast:", error);
        }
    }

    function showLoading(message = 'Loading...') {
        try {
            const overlay = document.getElementById("loading-overlay");
            const msgEl = document.getElementById("loading-message");
            if (!overlay) return;

            if (msgEl) msgEl.textContent = message;
            overlay.classList.remove('hidden');
            overlay.offsetHeight;
            overlay.classList.add('show');
        } catch (error) {
            console.error("Error showing loading overlay:", error);
        }
    }

    function hideLoading() {
        try {
            const overlay = document.getElementById("loading-overlay");
            if (!overlay) return;

            overlay.classList.remove('show');
            setTimeout(() => overlay.classList.add("hidden"), 300);
        } catch (error) {
            console.error("Error hiding loading overlay:", error);
        }
    }

    // Track active popups
    const activePopups = new Set();

    // Show top-right popup
    function showTopRightPopup(message, type = "info", image = null, onClick = null) {
        try {
            const popupKey = `${message}-${type}-${image || ''}`;
            if (activePopups.has(popupKey)) return;

            activePopups.add(popupKey);

            let popupContainer = document.getElementById("top-right-popup-container");
            if (!popupContainer) {
                popupContainer = document.createElement("div");
                popupContainer.id = "top-right-popup-container";
                popupContainer.style.position = "fixed";
                popupContainer.style.top = "20px";
                popupContainer.style.right = "20px";
                popupContainer.style.zIndex = "9999";
                document.body.appendChild(popupContainer);
            }

            const popup = document.createElement("div");
            popup.className = `top-right-popup ${type}`;

            const imageHtml = image ? `<img src="${image}" class="popup-avatar" style="width:40px;height:40px;border-radius:50%;object-fit:cover;margin-right:10px;">` : '';

            popup.innerHTML = `
                <div class="popup-content" style="display:flex;align-items:center;">
                    ${imageHtml}
                    <span class="popup-message">${message}</span>
                    <button class="popup-close">&times;</button>
                </div>
            `;

            popup.style.backgroundColor = type === "success" ? "#4CAF50" :
                type === "error" ? "#f44336" :
                    type === "warning" ? "#ff9800" : "#2196F3";
            popup.style.color = "white";
            popup.style.padding = "12px 20px";
            popup.style.borderRadius = "4px";
            popup.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
            popup.style.marginBottom = "10px";
            popup.style.minWidth = "250px";
            popup.style.display = "flex";
            popup.style.justifyContent = "space-between";
            popup.style.alignItems = "center";
            popup.style.animation = "slideIn 0.3s ease-out";

            if (!document.getElementById("popup-styles")) {
                const style = document.createElement("style");
                style.id = "popup-styles";
                style.textContent = `
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    @keyframes slideOut {
                        from { transform: translateX(0); opacity: 1; }
                        to { transform: translateX(100%); opacity: 0; }
                    }
                    .popup-close {
                        background: none;
                        border: none;
                        color: white;
                        font-size: 18px;
                        cursor: pointer;
                        margin-left: 10px;
                    }
                `;
                document.head.appendChild(style);
            }

            const popupContent = popup.querySelector(".popup-content");
            if (onClick) {
                popupContent.style.cursor = "pointer";
                popupContent.addEventListener("click", () => {
                    onClick();
                    popup.style.animation = "slideOut 0.3s ease-out forwards";
                    setTimeout(() => {
                        popup.remove();
                        activePopups.delete(popupKey);
                    }, 300);
                });
            }

            popup.querySelector(".popup-close").addEventListener("click", () => {
                popup.style.animation = "slideOut 0.3s ease-out forwards";
                setTimeout(() => {
                    popup.remove();
                    activePopups.delete(popupKey);
                }, 300);
            });

            setTimeout(() => {
                if (popup.parentNode) {
                    popup.style.animation = "slideOut 0.3s ease-out forwards";
                    setTimeout(() => {
                        popup.remove();
                        activePopups.delete(popupKey);
                    }, 300);
                }
            }, 5000);

            popupContainer.appendChild(popup);
        } catch (error) {
            console.error("Error showing top-right popup:", error);
        }
    }

    // Notification functions
    async function requestNotificationPermission() {
        if (!("Notification" in window)) {
            console.warn("Browser does not support notifications.");
            return false;
        }

        if (Notification.permission === "granted") {
            console.log("Notifications already enabled ✅");
            return true;
        }

        try {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
                console.log("Notifications enabled ✅");
                return true;
            } else {
                console.log("Notifications blocked by user.");
                return false;
            }
        } catch (err) {
            console.warn("Notification permission error", err);
            return false;
        }
    }

    async function showNotification(title, options = {}) {
        const hasPermission = await requestNotificationPermission();

        if (hasPermission) {
            try {
                const notif = new Notification(title, options);
                return notif;
            } catch (err) {
                console.warn("Error showing notification:", err);
            }
        }

        showTopRightPopup(title, "info", options.icon);
        return null;
    }

    // User profile functions
    async function fetchCurrentUserAvatar(profileImageSelector = '.profile-pic') {
        try {
            const profileImage = document.querySelector(profileImageSelector);
            if (!profileImage) return;

            const { data: { user } } = await client.auth.getUser();
            if (!user) return;

            const { data: profile } = await client
                .from("user_profiles")
                .select("profile_image_url")
                .eq("user_id", user.id)
                .maybeSingle();

            let avatarUrl = DEFAULT_PROFILE_IMG;
            if (profile?.profile_image_url) {
                avatarUrl = profile.profile_image_url;
            }
            profileImage.src = avatarUrl;
        } catch (err) {
            console.error("fetchCurrentUserAvatar error:", err);
        }
    }

    fetchCurrentUserAvatar();

    async function ensureCurrentUserInPrivateUsersTable() {
        if (!state.currentUserId) return false;

        try {
            const userExists = await userExistsInPrivateUsersTable(state.currentUserId);

            if (!userExists) {
                console.log("Current user not found in private_users table, adding...");

                const { data: { user } } = await client.auth.getUser();
                if (!user) return false;

                await client
                    .from("private_users")
                    .insert([{
                        id: state.currentUserId,
                        name: user.user_metadata?.full_name || user.email?.split('@')[0] || "User",
                        email: user.email || `${state.currentUserId}@placeholder.com`
                    }]);

                console.log("User added to private_users table successfully");
            }

            return true;
        } catch (err) {
            console.error("Error ensuring user in private_users table:", err);
            return false;
        }
    }

    async function getCurrentUser() {
        try {
            const { data: { user }, error } = await client.auth.getUser();
            if (error || !user) {
                showToast("User not logged in", "error");
                window.location.href = 'signup.html';
                return null;
            }
            state.currentUserId = user.id;
            console.log("Current user ID:", state.currentUserId);

            await ensureUserProfileExists(state.currentUserId);
            await ensureCurrentUserInPrivateUsersTable();
            await setUserOnlineStatus(true);
            await checkAndShowAdminRequestPopup();

            return user;
        } catch (err) {
            console.error("getCurrentUser error:", err);
            showToast("Failed to get current user.", "error");
            return null;
        }
    }

    async function isAlreadyFriend(userId) {
        if (!state.currentUserId || !userId) return false;

        try {
            const { data } = await client
                .from("friends")
                .select("*")
                .or(`and(user1_id.eq.${state.currentUserId},user2_id.eq.${userId}),and(user1_id.eq.${userId},user2_id.eq.${state.currentUserId})`)
                .maybeSingle();

            return !!data;
        } catch (err) {
            console.error("Error in isAlreadyFriend:", err);
            return false;
        }
    }

    async function checkAndShowAdminRequestPopup() {
        if (localStorage.getItem(ADMIN_REQUEST_KEY) === 'true') return;

        try {
            const { data: { user } } = await client.auth.getUser();
            if (!user) return;

            const createdAt = new Date(user.created_at);
            const now = new Date();
            const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);

            if (hoursSinceCreation > 24) {
                localStorage.setItem(ADMIN_REQUEST_KEY, 'true');
                return;
            }

            const { data: adminProfile } = await client
                .from("user_profiles")
                .select("user_id")
                .eq("user_name", ADMIN_USERNAME)
                .maybeSingle();

            if (!adminProfile) {
                localStorage.setItem(ADMIN_REQUEST_KEY, 'true');
                return;
            }

            const isAdminFriend = await isAlreadyFriend(adminProfile.user_id);
            if (isAdminFriend) {
                localStorage.setItem(ADMIN_REQUEST_KEY, 'true');
                return;
            }

            showConfirmPopup(
                `Would you like to send a friend request to Admin ${ADMIN_USERNAME}?`,
                async () => {
                    await sendFriendRequest(ADMIN_USERNAME);
                    localStorage.setItem(ADMIN_REQUEST_KEY, 'true');
                },
                () => {
                    localStorage.setItem(ADMIN_REQUEST_KEY, 'true');
                }
            );
        } catch (err) {
            console.error("Error in checkAndShowAdminRequestPopup:", err);
            localStorage.setItem(ADMIN_REQUEST_KEY, 'true');
        }
    }

    // Friend request functions
    async function acceptRequest(requestId, senderId) {
        try {
            const alreadyFriends = await isAlreadyFriend(senderId);
            if (alreadyFriends) {
                showToast("You are already friends with this user.", "info");
                return;
            }

            const { error: updateError } = await client
                .from("requests")
                .update({ status: "accepted" })
                .eq("id", requestId);

            if (updateError) {
                console.error("Error updating request:", updateError);
                return showToast("Failed to accept request.", "error");
            }

            const { error: insertError } = await client
                .from("friends")
                .insert([{ user1_id: state.currentUserId, user2_id: senderId }]);

            if (insertError) {
                console.error("Error inserting into friends:", insertError);
                return showToast("Failed to add friend.", "error");
            }

            showToast("Friend request accepted!", "success");
            showTopRightPopup("Friend request accepted!", "success");

            await fetchFriendRequests();
            await fetchFriends();
            await openSpecificChat(senderId);
            await fetchRecentChats();

        } catch (err) {
            console.error("Unexpected error:", err);
            showToast("An error occurred while accepting request.", "error");
        }
    }

    async function rejectRequest(requestId) {
        try {
            const { error } = await client
                .from("requests")
                .update({ status: "rejected" })
                .eq("id", requestId);

            if (error) {
                console.error("Error rejecting request:", error);
                return showToast("Failed to reject request.", "error");
            }

            showToast("Friend request rejected!", "info");
            showTopRightPopup("Friend request rejected", "info");
            fetchFriendRequests();
        } catch (err) {
            console.error("Unexpected error rejecting request:", err);
            showToast("Failed to reject friend request.", "error");
        }
    }

    // Cleanup function for subscriptions
    function cleanupSubscriptions() {
        state.activeChannels.forEach(channel => {
            client.removeChannel(channel);
        });
        state.activeChannels.clear();
    }

    // Handle page unload
    window.addEventListener('beforeunload', () => {
        setUserOnlineStatus(false);
        Object.values(state.deletionTimeouts).forEach(timeoutId => clearTimeout(timeoutId));

        if (state.onlineStatusInterval) {
            clearInterval(state.onlineStatusInterval);
        }

        cleanupSubscriptions();
    });

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            setUserOnlineStatus(true);
        } else {
            setUserOnlineStatus(false);
        }
    });

    function renderFriendRequests() {
        try {
            const messageList = document.getElementById("friend-requests-list");
            const unreadBadge = document.getElementById("unread-count");
            if (!messageList || !unreadBadge) return;

            messageList.innerHTML = "";
            if (!state.friendRequests || state.friendRequests.length === 0) {
                const noRequestsItem = document.createElement("li");
                noRequestsItem.className = "no-requests";
                noRequestsItem.textContent = "No pending friend requests.";
                messageList.appendChild(noRequestsItem);
            } else {
                state.friendRequests.forEach((req) => {
                    const li = document.createElement("li");
                    li.className = "message-item";
                    li.innerHTML = `
                        <img src="${req.avatar}" alt="User" class="msg-avatar" style="width:30px;height:30px;border-radius:50%;object-fit:cover;">
                        <div class="message-text">${req.text}</div>
                        <div class="message-actions">
                            <button class="accept-btn">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                    <path d="M20 6L9 17l-5 5"></path>
                                </svg>
                                Accept
                            </button>
                            <button class="reject-btn">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="15" y1="9" x2="9" y2="15"></line>
                                    <line x1="9" y1="9" x2="15" y2="15"></line>
                                </svg>
                                Reject
                            </button>
                        </div>
                    `;
                    const acceptBtn = li.querySelector(".accept-btn");
                    const rejectBtn = li.querySelector(".reject-btn");
                    acceptBtn?.addEventListener("click", async () => {
                        await acceptRequest(req.requestId, req.senderId);
                    });
                    rejectBtn?.addEventListener("click", async () => {
                        await rejectRequest(req.requestId);
                    });
                    messageList.appendChild(li);
                });
            }

            unreadBadge.textContent = (state.friendRequests && state.friendRequests.length) ? state.friendRequests.length : "0";
        } catch (error) {
            console.error("Error rendering friend requests:", error);
        }
    }

    document.getElementById("message-notification")?.addEventListener("click", () => {
        try {
            const popup = document.getElementById("friend-requests-popup");
            if (popup) {
                if (popup.classList.contains("show")) {
                    popup.classList.remove("show");
                } else {
                    popup.classList.add("show");
                }
            }
        } catch (error) {
            console.error("Error handling message notification click:", error);
        }
    });

    document.addEventListener("click", (e) => {
        try {
            const messageIcon = document.getElementById("message-notification");
            const messagePopup = document.getElementById("friend-requests-popup");
            if (messageIcon && messagePopup && !messageIcon.contains(e.target) && !messagePopup.contains(e.target)) {
                messagePopup.classList.remove("show");
            }
        } catch (error) {
            console.error("Error handling outside click:", error);
        }
    });

    async function fetchFriendRequests() {
        if (!state.currentUserId) return;

        console.log("Fetching friend requests for user:", state.currentUserId);
        showLoading("Fetching friend requests...");

        try {
            const { data: requests } = await client
                .from("requests")
                .select("id, sender_id, status")
                .eq("receiver_id", state.currentUserId)
                .eq("status", "pending");

            console.log("Friend requests data:", requests);
            state.friendRequests = [];

            if (requests && requests.length) {
                const senderIds = Array.from(new Set(requests.map(r => r.sender_id)));
                console.log("Sender IDs:", senderIds);

                const { data: profilesMap } = await client
                    .from("user_profiles")
                    .select("user_id, user_name, profile_image_url")
                    .in("user_id", senderIds);

                const profileById = {};
                (profilesMap || []).forEach(p => {
                    profileById[p.user_id] = p;
                    console.log(`Profile for ${p.user_id}:`, p);
                });

                for (const req of requests) {
                    const senderProfile = profileById[req.sender_id] || {};
                    const avatarUrl = senderProfile.profile_image_url || DEFAULT_PROFILE_IMG;
                    const senderName = senderProfile.user_name || "Someone";

                    state.friendRequests.push({
                        text: `${senderName} sent you a friend request`,
                        requestId: req.id,
                        senderId: req.sender_id,
                        avatar: avatarUrl
                    });

                    console.log(`Added friend request from ${senderName}`);
                }
            }

            console.log("Final friend requests list:", state.friendRequests);
            renderFriendRequests();
        } catch (err) {
            console.error("Error fetching requests:", err);
            showToast("Failed to fetch friend requests.", "error");
        } finally {
            hideLoading();
        }
    }

    function updateUnseenBadge(friendId, count) {
        try {
            const chatLi = document.querySelector(`.chat[data-friend-id="${friendId}"]`);
            if (!chatLi) return;

            let badge = chatLi.querySelector(".non-seen-msg");
            if (!badge) {
                badge = document.createElement("p");
                badge.className = "non-seen-msg";
                chatLi.appendChild(badge);
            }

            if (count > 0) {
                badge.textContent = count;
                badge.style.display = "flex";
            } else {
                badge.textContent = "";
                badge.style.display = "none";
            }
        } catch (error) {
            console.error("Error updating unseen badge:", error);
        }
    }

    async function updateUnseenCountForFriend(friendId) {
        try {
            const { count } = await client
                .from("messages")
                .select("*", { count: "exact", head: true })
                .eq("sender_id", friendId)
                .eq("receiver_id", state.currentUserId)
                .eq("seen", false)
                .is('deleted_at', null);

            const unseenCount = count || 0;
            state.unseenCounts[friendId] = unseenCount;
            updateUnseenBadge(friendId, unseenCount);
        } catch (err) {
            console.error("updateUnseenCountForFriend error:", err);
        }
    }

    function scheduleMessageDeletion(messageId, friendId, delay = 30000) {
        try {
            if (state.deletionTimeouts[messageId]) {
                clearTimeout(state.deletionTimeouts[messageId]);
            }

            state.deletionTimeouts[messageId] = setTimeout(async () => {
                try {
                    const { error } = await client
                        .from("messages")
                        .update({ deleted_at: new Date().toISOString() })
                        .eq("id", messageId);

                    if (error) {
                        console.error("Error deleting message:", error);
                    } else {
                        console.log(`Message ${messageId} deleted after timeout`);
                        updateLastMessageInChatList(friendId);
                    }
                } catch (err) {
                    console.error("Error in scheduled message deletion:", err);
                } finally {
                    delete state.deletionTimeouts[messageId];
                }
            }, delay);
        } catch (error) {
            console.error("Error scheduling message deletion:", error);
        }
    }

    async function deleteSeenMessagesForChat(friendId) {
        if (!state.currentUserId) return;

        try {
            const { data: seenMessages } = await client
                .from("messages")
                .select("id")
                .eq("receiver_id", state.currentUserId)
                .eq("sender_id", friendId)
                .eq("seen", true)
                .is('deleted_at', null);

            if (!seenMessages || seenMessages.length === 0) return;

            seenMessages.forEach(msg => {
                if (state.deletionTimeouts[msg.id]) {
                    clearTimeout(state.deletionTimeouts[msg.id]);
                    delete state.deletionTimeouts[msg.id];
                }
            });

            const messageIds = seenMessages.map(msg => msg.id);
            const { error: updateError } = await client
                .from("messages")
                .update({ deleted_at: new Date().toISOString() })
                .in('id', messageIds);

            if (updateError) {
                console.error("Error deleting seen messages for chat:", updateError);
            } else {
                console.log(`Deleted ${messageIds.length} seen messages for chat with ${friendId}`);
                updateLastMessageInChatList(friendId);
            }
        } catch (err) {
            console.error("deleteSeenMessagesForChat error:", err);
        }
    }

    async function updateLastMessageInChatList(friendId) {
        try {
            const { data: lastMsgData } = await client
                .from("messages")
                .select("content, created_at, sender_id, receiver_id")
                .or(`and(sender_id.eq.${state.currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${state.currentUserId})`)
                .is('deleted_at', null)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            const lastMessageText = lastMsgData?.content || "No messages yet";
            const lastMessageTime = lastMsgData ? new Date(lastMsgData.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

            const chatLi = document.querySelector(`.chat[data-friend-id="${friendId}"]`);
            if (chatLi) {
                const lastMessageEl = chatLi.querySelector(".last-message");
                const timeEl = chatLi.querySelector(".time");

                if (lastMessageEl) lastMessageEl.textContent = lastMessageText;
                if (timeEl) timeEl.textContent = lastMessageTime;
            }
        } catch (err) {
            console.error("Error updating last message in chat list:", err);
        }
    }

    // Update specific friend element instead of rebuilding entire list
    function updateFriendElement(friendId, updates) {
        const friendElement = document.querySelector(`.chat[data-friend-id="${friendId}"]`);
        if (!friendElement) return;
        
        if (updates.name) {
            const nameElement = friendElement.querySelector("h4");
            if (nameElement) nameElement.textContent = updates.name;
        }
        
        if (updates.avatar) {
            const avatarElement = friendElement.querySelector(".avatar-wrapper img");
            if (avatarElement) avatarElement.src = updates.avatar;
        }
        
        if (updates.online !== undefined) {
            const avatarWrapper = friendElement.querySelector(".avatar-wrapper");
            const existingDot = avatarWrapper.querySelector(".online-dot");
            
            if (updates.online && !existingDot) {
                const onlineDot = document.createElement("span");
                onlineDot.className = "online-dot";
                avatarWrapper.appendChild(onlineDot);
            } else if (!updates.online && existingDot) {
                existingDot.remove();
            }
        }
    }

    async function fetchFriends() {
        showLoading("Fetching friends...");
        if (!state.currentUserId) {
            hideLoading();
            return;
        }

        try {
            const { data: friends } = await client
                .from("friends")
                .select("*")
                .or(`user1_id.eq.${state.currentUserId},user2_id.eq.${state.currentUserId}`);

            const chatList = document.querySelector(".chat-list");
            if (!chatList) return;
            chatList.innerHTML = "";

            const friendIds = [...new Set(friends.map(f =>
                f.user1_id === state.currentUserId ? f.user2_id : f.user1_id
            ))];

            const { data: profiles } = await client
                .from("user_profiles")
                .select("user_id, user_name, profile_image_url, is_online")
                .in("user_id", friendIds);

            state.allFriends.clear();
            (profiles || []).forEach(p => {
                state.allFriends.set(p.user_id, p);
            });

            const friendDataPromises = friendIds.map(async (friendId) => {
                let profile = state.allFriends.get(friendId) || {};
                let friendName, avatarUrl, isOnline;

                friendName = profile.user_name || "Unknown";
                avatarUrl = profile.profile_image_url || DEFAULT_PROFILE_IMG;
                isOnline = profile.is_online || false;

                const { data: lastMsgData } = await client
                    .from("messages")
                    .select("content, created_at, sender_id, receiver_id")
                    .or(`and(sender_id.eq.${state.currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${state.currentUserId})`)
                    .is('deleted_at', null)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const lastMessageText = lastMsgData?.content || "No messages yet";
                const lastMessageTime = lastMsgData ? new Date(lastMsgData.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

                let unseenCount = 0;
                try {
                    const { count } = await client
                        .from("messages")
                        .select("*", { count: "exact", head: true })
                        .eq("sender_id", friendId)
                        .eq("receiver_id", state.currentUserId)
                        .eq("seen", false)
                        .is('deleted_at', null);

                    unseenCount = count || 0;
                } catch (err) {
                    console.warn("unseen count fetch failed:", err);
                }

                return { friendId, friendName, avatarUrl, isOnline, lastMessageText, lastMessageTime, unseenCount };
            });

            const friendData = await Promise.all(friendDataPromises);

            friendData.forEach(data => {
                const { friendId, friendName, avatarUrl, isOnline, lastMessageText, lastMessageTime, unseenCount } = data;

                const existingChat = document.querySelector(`.chat[data-friend-id="${friendId}"]`);
                if (existingChat) {
                    updateFriendElement(friendId, {
                        name: friendName,
                        avatar: avatarUrl,
                        online: isOnline
                    });

                    const existingLastMessage = existingChat.querySelector(".last-message");
                    const existingTime = existingChat.querySelector(".time");
                    const existingBadge = existingChat.querySelector(".non-seen-msg");

                    if (existingLastMessage) existingLastMessage.textContent = lastMessageText;
                    if (existingTime) existingTime.textContent = lastMessageTime;

                    if (unseenCount > 0) {
                        if (!existingBadge) {
                            const badge = document.createElement("p");
                            badge.className = "non-seen-msg";
                            badge.textContent = unseenCount;
                            existingChat.appendChild(badge);
                        } else {
                            existingBadge.textContent = unseenCount;
                            existingBadge.style.display = "flex";
                        }
                    } else if (existingBadge) {
                        existingBadge.style.display = "none";
                    }

                    return;
                }

                const defaultImg = './assets/icon/download.jpeg';

                const li = document.createElement("li");
                li.classList.add("chat");
                li.setAttribute("data-friend-id", friendId);
                li.innerHTML = `
                    <div class="avatar-wrapper" style="position:relative;">
                        <img src="${avatarUrl ? avatarUrl : defaultImg}" alt="User" style="object-fit: cover; border-radius:50%;">
                            ${isOnline ? '<span class="online-dot"></span>' : ''}
                    </div>
                    <div class="chat-meta">
                        <h4>${friendName}</h4>
                        <p class="last-message" title="${lastMessageText}">${lastMessageText}</p>
                    </div>
                        <span class="time">${lastMessageTime}</span>
                        ${unseenCount > 0 ? `<p class="non-seen-msg">${unseenCount}</p>` : ''}
                `;

                li.addEventListener("click", () => {
                    openSpecificChat(friendId, {
                        user_name: friendName,
                        profile_image_url: avatarUrl
                    });

                    const chatArea = document.querySelector('.chat-area-main');
                    if (window.innerWidth <= 768) {
                        document.getElementById('message-notification')?.classList.add("hidden");
                        if (chatArea) chatArea.style.display = 'flex';
                    }
                });

                chatList.appendChild(li);
                state.unseenCounts[friendId] = unseenCount || 0;
            });

            enableFriendSearch();
        } catch (err) {
            console.error("Error fetching friends:", err);
            showToast("Failed to load friends.", "error");
        } finally {
            hideLoading();
        }
    }

    function enableFriendSearch() {
        try {
            const searchInput = document.getElementById("search-friends");
            const chatList = document.querySelector(".chat-list");
            if (!searchInput || !chatList) return;

            if (searchInput.dataset.hasListener) return;
            searchInput.dataset.hasListener = "true";

            let timer = null;
            searchInput.addEventListener("input", (e) => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    const query = searchInput.value.toLowerCase().trim();
                    const chats = chatList.querySelectorAll(".chat");
                    chats.forEach(chat => {
                        const nameEl = chat.querySelector("h4");
                        const name = nameEl ? nameEl.textContent.toLowerCase() : "";
                        chat.style.display = name.includes(query) ? "flex" : "none";
                    });

                    if (e.key === 'Enter') {
                        const visibleChats = Array.from(chats).filter(chat =>
                            chat.style.display !== 'none'
                        );

                        if (visibleChats.length === 1) {
                            const friendId = visibleChats[0].getAttribute('data-friend-id');
                            const friendName = visibleChats[0].querySelector('h4').textContent;
                            const friendAvatar = visibleChats[0].querySelector('img').src;
                            openSpecificChat(friendId, {
                                user_name: friendName,
                                profile_image_url: friendAvatar
                            });
                        }
                    }
                }, 120);
            });
        } catch (error) {
            console.error("Error enabling friend search:", error);
        }
    }

    function linkify(text) {
        try {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            return text.replace(urlRegex, function (url) {
                return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">${url}</a>`;
            });
        } catch (error) {
            console.error("Error linkifying text:", error);
            return text;
        }
    }

    function renderChatMessages(chatBox, msgs, friendAvatar) {
        try {
            if (!chatBox) return;
            chatBox.innerHTML = "";

            const animationDelay = 50;

            msgs.forEach((msg, index) => {
                const isMe = msg.sender_id === state.currentUserId;
                const msgDiv = document.createElement("div");
                msgDiv.className = `message ${isMe ? "sent" : "received"}`;
                msgDiv.setAttribute("data-message-id", msg.id);
                msgDiv.style.animationDelay = `${index * animationDelay}ms`;

                const timeStr = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                }) : "";

                const msgBubble = document.createElement("div");
                msgBubble.className = "msg-bubble";

                const msgText = document.createElement("span");
                msgText.className = "msg-text";
                msgText.innerHTML = linkify(msg.content);

                const msgMeta = document.createElement("div");
                msgMeta.className = "msg-meta";
                msgMeta.innerHTML = `
                    <small class="msg-time">${timeStr}</small>
                    ${isMe ? `<small class="seen-status">${msg.seen ? "✓✓" : "✓"}</small>` : ""}
                `;

                msgBubble.appendChild(msgText);
                msgBubble.appendChild(msgMeta);

                if (!isMe) {
                    const avatarImg = document.createElement("img");
                    avatarImg.src = friendAvatar;
                    avatarImg.className = "msg-avatar";
                    avatarImg.style.cssText = "width:25px;height:25px;border-radius:50%;margin-right:6px;";
                    msgDiv.appendChild(avatarImg);
                }

                msgDiv.appendChild(msgBubble);
                chatBox.appendChild(msgDiv);
            });

            setTimeout(() => {
                chatBox.scrollTop = chatBox.scrollHeight;
            }, msgs.length * animationDelay);
        } catch (error) {
            console.error("Error rendering chat messages:", error);
        }
    }

    async function sendFriendRequest(username) {
        if (!username) return showToast("Enter a username.", "error");

        console.log("Sending friend request to:", username);
        showLoading("Sending friend request...");

        try {
            const { data: user } = await client
                .from("user_profiles")
                .select("user_id")
                .eq("user_name", username)
                .maybeSingle();

            if (!user) {
                hideLoading();
                return showToast("User not found.", "error");
            }

            const receiverId = user.user_id;
            console.log("Found user with ID:", receiverId);

            if (receiverId === state.currentUserId) {
                hideLoading();
                return showToast("You cannot send a request to yourself.", "warning");
            }

            const alreadyFriends = await isAlreadyFriend(receiverId);
            if (alreadyFriends) {
                hideLoading();
                showToast(`You are already friends with ${username}`, "info");
                showTopRightPopup(`You are already friends with ${username}`, "info");
                return;
            }

            const { data: existing } = await client
                .from("requests")
                .select("id, status")
                .or(`and(sender_id.eq.${state.currentUserId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${state.currentUserId})`)
                .maybeSingle();

            if (existing) {
                console.log("Existing request found:", existing);
                hideLoading();
                if (existing.status === "pending") {
                    showTopRightPopup(`You already have a pending request to ${username}`, "warning");
                    return showToast("You have already sent a request.", "info");
                }
                if (existing.status === "accepted") {
                    showToast(`You are already friends with ${username}`, "info");
                    showTopRightPopup(`You are already friends with ${username}`, "info");
                    return;
                }
                if (existing.status === "rejected") {
                    showTopRightPopup(`This user rejected your request before`, "warning");
                    return showToast("This user rejected your request before.", "warning");
                }
            }

            console.log("Creating new friend request...");
            const { data: newRequest } = await client
                .from("requests")
                .insert([{
                    sender_id: state.currentUserId,
                    receiver_id: receiverId,
                    status: "pending"
                }])
                .select()
                .single();

            console.log("Friend request created successfully:", newRequest);
            showToast("Friend request sent successfully!", "success");
            showTopRightPopup(`Friend request sent to ${username}!`, "success");
        } catch (err) {
            console.error("Unexpected error in sendFriendRequest:", err);
            showToast("Unexpected error. Please try again.", "error");
        } finally {
            hideLoading();
        }
    }

    function updateMessageSeenStatus(chatBox, messageId) {
        try {
            const chatMessage = chatBox.querySelector(`.message[data-message-id="${messageId}"] .seen-status`);
            if (chatMessage) {
                chatMessage.textContent = "✓✓";
            }
        } catch (error) {
            console.error("Error updating message seen status:", error);
        }
    }

    async function markMessagesAsSeen(friendId, chatBox, messages, friendAvatar) {
        if (!state.currentUserId || !friendId) return;

        try {
            const { data: unseenMessages } = await client
                .from("messages")
                .select("id")
                .eq("sender_id", friendId)
                .eq("receiver_id", state.currentUserId)
                .eq("seen", false)
                .is('deleted_at', null);

            if (unseenMessages && unseenMessages.length > 0) {
                const { error: updateError } = await client
                    .from("messages")
                    .update({ seen: true })
                    .in("id", unseenMessages.map(msg => msg.id));

                if (updateError) {
                    console.error("Error marking messages as seen:", updateError);
                    return;
                }

                unseenMessages.forEach(unseenMsg => {
                    const msgIndex = messages.findIndex(m => m.id === unseenMsg.id);
                    if (msgIndex !== -1) {
                        messages[msgIndex].seen = true;
                    }
                });

                renderChatMessages(chatBox, messages, friendAvatar);
            }
        } catch (err) {
            console.error("Error in markMessagesAsSeen:", err);
        }
    }

    document.querySelector(".submit-friend")?.addEventListener("click", () => {
        try {
            const username = document.querySelector(".friend-input")?.value.trim();
            sendFriendRequest(username);
        } catch (error) {
            console.error("Error handling submit friend request click:", error);
        }
    });

    // Profile elements
    const profilePic = document.querySelector(".profile-pic");
    const profilePopup = document.getElementById("profile-popup");
    const closeProfile = document.getElementById("close-profile");
    const profilePreview = document.getElementById("profile-preview");
    const profileUpload = document.getElementById("profile-upload");
    const bioInput = document.getElementById("bio");
    const saveProfileBtn = document.getElementById("save-profile");
    const logoutBtn = document.getElementById("logout");
    const profileUsername = document.getElementById("profile-username");

    const usernamePopup = document.getElementById("username-popup");
    const changeUsernameBtn = document.getElementById("change-username-btn");
    const closeUsername = document.getElementById("close-username");
    const cancelUsername = document.getElementById("cancel-username");
    const saveUsernameBtn = document.getElementById("save-username");
    const newUsernameInput = document.getElementById("new-username");

    // SVG icons for buttons
    if (closeProfile) {
        closeProfile.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
    }

    if (saveProfileBtn) {
        saveProfileBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            Save Profile
        `;
    }

    if (changeUsernameBtn) {
        changeUsernameBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Change Username
        `;
    }

    if (closeUsername) {
        closeUsername.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
    }

    if (cancelUsername) {
        cancelUsername.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            Cancel
        `;
    }

    if (saveUsernameBtn) {
        saveUsernameBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
                <path d="M20 6L9 17l-5 5"></path>
            </svg>
            Save Username
        `;
    }

    if (logoutBtn) {
        logoutBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Logout
        `;
    }

    // Bio character count and clear button
    const maxBioLength = 150;
    const bioCharCount = document.getElementById("bio-char-count");
    const clearBioBtn = document.getElementById("clear-bio");

    if (bioInput && !bioCharCount) {
        const charCount = document.createElement('span');
        charCount.id = 'bio-char-count';
        charCount.className = 'char-count';
        bioInput.parentNode.appendChild(charCount);
    }

    if (bioInput && !clearBioBtn) {
        const clearBtn = document.createElement('button');
        clearBtn.id = 'clear-bio';
        clearBtn.className = 'clear-bio-btn';
        clearBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
            </svg>
            Clear
        `;
        bioInput.parentNode.appendChild(clearBtn);
    }

    const bioCharCountEl = document.getElementById("bio-char-count");
    const clearBioBtnEl = document.getElementById("clear-bio");

    if (bioInput && bioCharCountEl) {
        bioCharCountEl.textContent = bioInput.value.length;

        bioInput.addEventListener('input', () => {
            const currentLength = bioInput.value.length;
            bioCharCountEl.textContent = currentLength;

            if (currentLength > maxBioLength * 0.9) {
                bioCharCountEl.style.color = 'var(--accent)';
            } else {
                bioCharCountEl.style.color = 'var(--text-secondary)';
            }

            bioInput.style.height = 'auto';
            bioInput.style.height = Math.min(bioInput.scrollHeight, 200) + 'px';
        });

        if (clearBioBtnEl) {
            clearBioBtnEl.addEventListener('click', () => {
                bioInput.value = '';
                bioCharCountEl.textContent = '0';
                bioInput.style.height = 'auto';
                bioInput.focus();
            });
        }

        bioInput.addEventListener('keydown', (e) => {
            const allowedKeys = [
                'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
                'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
            ];

            if (!allowedKeys.includes(e.key) &&
                bioInput.value.length >= maxBioLength &&
                !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
            }
        });

        bioInput.addEventListener('paste', (e) => {
            const paste = (e.clipboardData || window.clipboardData).getData('text');
            if (bioInput.value.length + paste.length > maxBioLength) {
                e.preventDefault();
            }
        });
    }

    // Username character count
    const maxNameLength = 20;
    const nameCharCount = document.getElementById("name-char-count");

    if (newUsernameInput && !nameCharCount) {
        const charCount = document.createElement('span');
        charCount.id = 'name-char-count';
        charCount.className = 'char-count';
        newUsernameInput.parentNode.appendChild(charCount);
    }

    const nameCharCountEl = document.getElementById("name-char-count");

    if (newUsernameInput && nameCharCountEl) {
        nameCharCountEl.textContent = newUsernameInput.value.length;

        newUsernameInput.addEventListener('input', () => {
            const currentLength = newUsernameInput.value.length;
            nameCharCountEl.textContent = currentLength;

            if (currentLength > maxNameLength * 0.9) {
                nameCharCountEl.style.color = 'var(--accent)';
            } else {
                nameCharCountEl.style.color = 'var(--text-secondary)';
            }
        });

        newUsernameInput.addEventListener('keydown', (e) => {
            const allowedKeys = [
                'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
                'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
            ];

            if (!allowedKeys.includes(e.key) &&
                newUsernameInput.value.length >= maxNameLength &&
                !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
            }
        });

        newUsernameInput.addEventListener('paste', (e) => {
            const paste = (e.clipboardData || window.clipboardData).getData('text');
            if (newUsernameInput.value.length + paste.length > maxNameLength) {
                e.preventDefault();
            }
        });
    }

    function createLoader() {
        const loader = document.createElement('div');
        loader.className = 'btn-loader';
        loader.innerHTML = `
            <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
            </svg>
            <span>Saving...</span>
        `;
        return loader;
    }

    profilePic?.addEventListener("click", async () => {
        try {
            if (!profilePopup) return;
            showModal("profile-popup");

            try {
                const { data: profile } = await client
                    .from("user_profiles")
                    .select("profile_image_url, bio, user_name")
                    .eq("user_id", state.currentUserId)
                    .limit(1)
                    .maybeSingle();

                profilePreview.src = profile?.profile_image_url || DEFAULT_PROFILE_IMG;
                bioInput.value = profile?.bio || "";
                profileUsername.textContent = profile?.user_name || "Unknown User";
                newUsernameInput.value = profile?.user_name || "";

                if (bioCharCountEl) bioCharCountEl.textContent = bioInput.value.length;
                if (nameCharCountEl) nameCharCountEl.textContent = newUsernameInput.value.length;
            } catch (err) {
                console.error("Error loading profile:", err);
                showToast("Failed to load profile details.", "error");
            }
        } catch (error) {
            console.error("Error handling profile pic click:", error);
        }
    });

    closeProfile?.addEventListener("click", () => {
        try {
            hideModal("profile-popup");
        } catch (error) {
            console.error("Error handling close profile click:", error);
        }
    });

    profileUpload?.addEventListener("change", (e) => {
        try {
            const file = e.target.files && e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    profilePreview.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            }
        } catch (error) {
            console.error("Error handling profile upload change:", error);
        }
    });

    saveProfileBtn?.addEventListener("click", async () => {
        try {
            const originalContent = saveProfileBtn.innerHTML;

            saveProfileBtn.disabled = true;
            saveProfileBtn.innerHTML = '';
            saveProfileBtn.appendChild(createLoader());

            try {
                let imageUrl = profilePreview?.src || DEFAULT_PROFILE_IMG;
                const bio = bioInput?.value.trim() || "";

                const file = profileUpload?.files[0];
                if (file) {
                    const fileName = `${state.currentUserId}_${Date.now()}_${file.name}`;
                    const { data } = await client.storage
                        .from('avatars')
                        .upload(fileName, file, {
                            cacheControl: '3600',
                            upsert: false
                        });

                    const { data: publicUrlData } = client.storage.from('avatars').getPublicUrl(data.path);
                    imageUrl = publicUrlData.publicUrl;
                }

                await client
                    .from("user_profiles")
                    .update({ profile_image_url: imageUrl, bio })
                    .eq("user_id", state.currentUserId);

                saveProfileBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                        <path d="M20 6L9 17l-5 5"></path>
                    </svg>
                    Saved!
                `;

                showToast("Profile updated successfully!", "success");
                showTopRightPopup("Profile updated successfully!", "success");

                setTimeout(() => {
                    saveProfileBtn.disabled = false;
                    saveProfileBtn.innerHTML = originalContent;
                    hideModal("profile-popup");
                }, 1500);

                fetchCurrentUserAvatar();
                fetchFriends();
            } catch (err) {
                console.error("Error updating profile:", err);
                showToast(`Failed to update profile: ${err.message || err}`, "error");

                saveProfileBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    Error
                `;

                setTimeout(() => {
                    saveProfileBtn.disabled = false;
                    saveProfileBtn.innerHTML = originalContent;
                }, 2000);
            }
        } catch (error) {
            console.error("Error handling save profile click:", error);
        }
    });

    logoutBtn?.addEventListener("click", async () => {
        try {
            showConfirmPopup(
                "Are you sure you want to logout?",
                async () => {
                    showLoading("Logging out...");
                    try {
                        await setUserOnlineStatus(false);
                        await client.auth.signOut();
                        showToast("Logged out!", "info");
                        showTopRightPopup("Logged out successfully!", "info");
                        window.location.href = "signup.html";
                    } catch (err) {
                        console.error("Logout error:", err);
                        showToast("Logout failed.", "error");
                    } finally {
                        hideLoading();
                    }
                },
                () => {
                }
            );
        } catch (error) {
            console.error("Error handling logout click:", error);
        }
    });

    changeUsernameBtn?.addEventListener("click", () => {
        try {
            hideModal("profile-popup");
            showModal("username-popup");
        } catch (error) {
            console.error("Error handling change username click:", error);
        }
    });

    closeUsername?.addEventListener("click", () => {
        try {
            hideModal("username-popup");
        } catch (error) {
            console.error("Error handling close username click:", error);
        }
    });
    cancelUsername?.addEventListener("click", () => {
        try {
            hideModal("username-popup");
        } catch (error) {
            console.error("Error handling cancel username click:", error);
        }
    });

    saveUsernameBtn?.addEventListener("click", async () => {
        try {
            const newUsername = newUsernameInput?.value.trim();
            if (!newUsername) {
                showToast("Username cannot be empty!", "error");
                return;
            }

            const originalContent = saveUsernameBtn.innerHTML;

            saveUsernameBtn.disabled = true;
            saveUsernameBtn.innerHTML = '';
            saveUsernameBtn.appendChild(createLoader());

            try {
                await client
                    .from("user_profiles")
                    .update({ user_name: newUsername })
                    .eq("user_id", state.currentUserId);

                saveUsernameBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                        <path d="M20 6L9 17l-5 5"></path>
                    </svg>
                    Saved!
                `;

                showToast("Username updated!", "success");
                showTopRightPopup("Username updated successfully!", "success");
                profileUsername.textContent = newUsername;

                setTimeout(() => {
                    saveUsernameBtn.disabled = false;
                    saveUsernameBtn.innerHTML = originalContent;
                    hideModal("username-popup");
                }, 1500);

                fetchFriends();
            } catch (err) {
                console.error("Error updating username:", err);
                showToast(`Failed to update username: ${err.message || err}`, "error");

                saveUsernameBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    Error
                `;

                setTimeout(() => {
                    saveUsernameBtn.disabled = false;
                    saveUsernameBtn.innerHTML = originalContent;
                }, 2000);
            }
        } catch (error) {
            console.error("Error handling save username click:", error);
        }
    });

    function showConfirmPopup(message, onConfirm, onCancel) {
        try {
            const popup = document.getElementById("notification-popup");
            const messageEl = document.getElementById("popup-message");
            const closeBtn = document.getElementById("popup-close");

            if (!popup || !messageEl) return;

            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'modal-popup-footer';
            buttonsContainer.innerHTML = `
                <button id="popup-confirm" class="modal-btn-confirm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                        <path d="M20 6L9 17l-5 5"></path>
                    </svg>
                    Yes
                </button>
                <button id="popup-cancel" class="modal-btn-cancel">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    No
                </button>
            `;

            const existingButtons = popup.querySelector('.modal-popup-footer');
            if (existingButtons) {
                existingButtons.remove();
            }

            messageEl.textContent = message;
            popup.appendChild(buttonsContainer);
            popup.classList.remove("hidden", "error", "success", "info");
            popup.classList.add("show", "confirm");

            const confirmBtn = document.getElementById('popup-confirm');
            const cancelBtn = document.getElementById('popup-cancel');

            const handleClose = () => {
                hideModal("notification-popup");
                buttonsContainer.remove();
            };

            const newClose = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newClose, closeBtn);
            newClose.addEventListener('click', () => {
                handleClose();
                if (onCancel) onCancel();
            });

            confirmBtn.addEventListener('click', () => {
                handleClose();
                if (onConfirm) onConfirm();
            });

            cancelBtn.addEventListener('click', () => {
                handleClose();
                if (onCancel) onCancel();
            });
        } catch (error) {
            console.error("Error showing confirm popup:", error);
        }
    }

    function showUserModal(userId, userName, userAvatar) {
        try {
            const modal = document.getElementById("user-modal");
            if (!modal) return;

            document.getElementById("user-modal-avatar").src = userAvatar || DEFAULT_PROFILE_IMG;
            document.getElementById("user-modal-username").textContent = userName || "Unknown User";
            document.getElementById("user-modal-bio").textContent = "Loading bio...";
            document.getElementById("user-modal-status").textContent = "Checking status...";
            document.getElementById("user-modal-status").className = "user-modal-status";

            getUserProfile(userId).then(profile => {
                if (profile) {
                    document.getElementById("user-modal-bio").textContent = profile.bio || "No bio available.";
                    const statusElement = document.getElementById("user-modal-status");
                    statusElement.textContent = profile.is_online ? "Online" : "Offline";
                    statusElement.className = `user-modal-status ${profile.is_online ? 'online' : 'offline'}`;
                } else {
                    document.getElementById("user-modal-bio").textContent = "No bio available.";
                    const statusElement = document.getElementById("user-modal-status");
                    statusElement.textContent = "Offline";
                    statusElement.className = "user-modal-status offline";
                }
            }).catch(err => {
                console.error("Error fetching user profile:", err);
                document.getElementById("user-modal-bio").textContent = "Error loading bio.";
                const statusElement = document.getElementById("user-modal-status");
                statusElement.textContent = "Offline";
                statusElement.className = "user-modal-status offline";
            });

            showModal("user-modal");

            const closeModal = () => hideModal("user-modal");
            modal.querySelector(".user-modal-close").addEventListener("click", closeModal);
            modal.querySelector("#user-modal-close-btn").addEventListener("click", closeModal);

            modal.querySelector("#user-modal-message-btn").addEventListener("click", () => {
                closeModal();
                openSpecificChat(userId);
            });
        } catch (error) {
            console.error("Error showing user modal:", error);
        }
    }

    async function getUserProfile(userId) {
        try {
            const { data } = await client
                .from("user_profiles")
                .select("user_name, profile_image_url, bio, is_online")
                .eq("user_id", userId)
                .maybeSingle();

            return data;
        } catch (err) {
            console.error("Error fetching user profile:", err);
            return null;
        }
    }

    async function getUserProfileForChat(userId) {
        try {
            const { data } = await client
                .from("user_profiles")
                .select("user_name, profile_image_url")
                .eq("user_id", userId)
                .maybeSingle();

            return data;
        } catch (err) {
            console.error("Unexpected error in getUserProfile:", err);
            return null;
        }
    }

    async function openSpecificChat(userId, profile = null) {
        try {
            if (!state.currentUserId) {
                const user = await getCurrentUser();
                if (!user) {
                    showToast("You must be logged in to open a chat", "error");
                    return;
                }
            }

            if (state.currentOpenChatId === userId) {
                return;
            }

            let userProfile = profile;
            if (!userProfile) {
                userProfile = await getUserProfileForChat(userId);
                if (!userProfile) {
                    showToast("User not found", "error");
                    return;
                }
            }

            openChat(userId, userProfile.user_name, userProfile.profile_image_url);
        } catch (error) {
            console.error("Error opening specific chat:", error);
        }
    }

    function generateChatLink(friendId) {
        try {
            const baseUrl = window.location.origin + window.location.pathname;
            return `${baseUrl}?chat=${friendId}`;
        } catch (error) {
            console.error("Error generating chat link:", error);
            return "#";
        }
    }

    function openChatFromUrl() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const friendId = urlParams.get('chat');

            if (friendId && state.currentUserId) {
                client.from("user_profiles")
                    .select("user_name, profile_image_url")
                    .eq("user_id", friendId)
                    .maybeSingle()
                    .then(({ data }) => {
                        if (data) {
                            openSpecificChat(friendId, data);
                        }
                    });
            }
        } catch (error) {
            console.error("Error opening chat from URL:", error);
        }
    }

    window.openChatWithUser = async function (userId) {
        try {
            if (!state.currentUserId) return;

            const { data: profile } = await client
                .from("user_profiles")
                .select("user_name, profile_image_url")
                .eq("user_id", userId)
                .maybeSingle();

            if (profile) {
                openSpecificChat(userId, profile);
            } else {
                showToast("User not found", "error");
            }
        } catch (err) {
            console.error("Error opening chat with user:", err);
            showToast("Failed to open chat", "error");
        }
    };

    async function fetchRecentChats() {
        try {
            const { data: friends } = await client
                .from("friends")
                .select("*")
                .or(`user1_id.eq.${state.currentUserId},user2_id.eq.${state.currentUserId}`);

            if (!friends || friends.length === 0) {
                renderRecentChats([]);
                return;
            }

            const friendIds = [...new Set(friends.map(f =>
                f.user1_id === state.currentUserId ? f.user2_id : f.user1_id
            ))];

            const { data: profiles } = await client
                .from("user_profiles")
                .select("user_id, user_name, profile_image_url, is_online")
                .in("user_id", friendIds);

            const recentChatsPromises = friendIds.map(async (friendId) => {
                let profile, user_name, avatar_url, is_online;

                profile = profiles?.find(p => p.user_id === friendId);
                user_name = profile?.user_name || "Unknown";
                avatar_url = profile?.profile_image_url || DEFAULT_PROFILE_IMG;
                is_online = profile?.is_online || false;

                const { data: lastMessage } = await client
                    .from("messages")
                    .select("content, created_at")
                    .or(`and(sender_id.eq.${state.currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${state.currentUserId})`)
                    .is('deleted_at', null)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                return {
                    user_id: friendId,
                    user_name,
                    avatar_url,
                    is_online,
                    last_message: lastMessage?.content || "No messages yet",
                    last_message_time: lastMessage?.created_at || null
                };
            });

            const recentChats = await Promise.all(recentChatsPromises);

            recentChats.sort((a, b) => {
                if (!a.last_message_time) return 1;
                if (!b.last_message_time) return -1;
                return new Date(b.last_message_time) - new Date(a.last_message_time);
            });

            renderRecentChats(recentChats);
        } catch (err) {
            console.error("Error fetching recent chats:", err);
            renderRecentChats([]);
        }
    }

    function renderRecentChats(chats) {
        try {
            const recentChatsContainer = document.getElementById('recent-chats');
            if (!recentChatsContainer) return;

            recentChatsContainer.innerHTML = '';

            if (chats.length === 0) {
                recentChatsContainer.innerHTML = '<p class="no-recent-chats">No recent chats</p>';
                return;
            }

            chats.forEach(chat => {
                const chatElement = document.createElement('div');
                chatElement.className = 'recent-chat';

                const timeStr = chat.last_message_time
                    ? new Date(chat.last_message_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : '';

                chatElement.innerHTML = `
                    <div class="recent-chat-avatar">
                        <img src="${chat.avatar_url || DEFAULT_PROFILE_IMG}" alt="${chat.user_name}">
                        ${chat.is_online ? '<span class="online-dot"></span>' : ''}
                    </div>
                    <div class="recent-chat-info">
                        <div class="recent-chat-name">${chat.user_name}</div>
                        <div class="recent-chat-message">${chat.last_message}</div>
                    </div>
                    <div class="recent-chat-time">${timeStr}</div>
                `;

                chatElement.addEventListener('click', () => {
                    openSpecificChat(chat.user_id, {
                        user_name: chat.user_name,
                        profile_image_url: chat.avatar_url
                    });
                });

                recentChatsContainer.appendChild(chatElement);
            });
        } catch (error) {
            console.error("Error rendering recent chats:", error);
        }
    }

    document.querySelector(".addFriends")?.addEventListener("click", () => {
        try {
            showModal("friendModal");
        } catch (error) {
            console.error("Error handling add friends click:", error);
        }
    });

    document.querySelector("#friendModal .close")?.addEventListener("click", () => {
        try {
            hideModal("friendModal");
        } catch (error) {
            console.error("Error handling close friend modal click:", error);
        }
    });

    document.querySelector("#friend-requests-popup .popup-close")?.addEventListener("click", () => {
        try {
            document.getElementById("friend-requests-popup").classList.remove("show");
        } catch (error) {
            console.error("Error handling close friend requests popup click:", error);
        }
    });

    // Setup subscription with retry mechanism
    async function setupSubscriptionWithRetry(channelName, setupFn, maxRetries = 3) {
        let retries = 0;
        
        while (retries < maxRetries) {
            try {
                const channel = client.channel(channelName);
                await setupFn(channel);
                state.activeChannels.add(channel);
                return channel;
            } catch (error) {
                retries++;
                console.error(`Subscription attempt ${retries} failed:`, error);
                
                if (retries >= maxRetries) {
                    showToast("Failed to establish real-time connection", "error");
                    throw error;
                }
                
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
            }
        }
    }

    async function openChat(friendId, friendName, friendAvatar, fromNotification = false) {
        try {
            state.currentOpenChatId = friendId;

            const chatContainer = document.querySelector("div.chat-area-child");
            const defaultScreen = document.querySelector(".default");
            const sidebar = document.querySelector(".sidebar");
            const messageCon = document.getElementById("message-notification");

            if (!chatContainer || !defaultScreen) {
                console.error("Missing necessary HTML elements for chat.");
                return;
            }

            defaultScreen.style.display = "none";
            chatContainer.style.display = "flex";

            const chatHeaderName = chatContainer.querySelector("#chat-header-name");
            const chatHeaderImg = chatContainer.querySelector(".chat-header img");
            if (chatHeaderName) chatHeaderName.textContent = friendName || "Unknown";
            if (chatHeaderImg) chatHeaderImg.src = friendAvatar || DEFAULT_PROFILE_IMG;

            const chatHeader = chatContainer.querySelector(".chat-header img");
            if (chatHeader) {
                const newChatHeader = chatHeader.cloneNode(true);
                chatHeader.parentNode.replaceChild(newChatHeader, chatHeader);
                newChatHeader.addEventListener("click", () => {
                    showUserModal(friendId, friendName, friendAvatar);
                });
            }

            if (window.innerWidth <= 768 || fromNotification) {
                if (sidebar) sidebar.style.display = "none";
                if (messageCon) messageCon.style.display = "none";
                chatContainer.style.display = "flex";
                defaultScreen.style.display = 'none';
            } else {
                if (messageCon) messageCon.style.display = "flex";
                chatContainer.style.display = "flex";
            }

            showLoading("Loading chat...");

            const emojiBtn = chatContainer.querySelector("#emoji-btn");
            const emojiPicker = chatContainer.querySelector("#emoji-picker");
            const input = chatContainer.querySelector("input");
            const sendBtn = chatContainer.querySelector(".sendBtn");
            const chatBox = chatContainer.querySelector(".messages");
            const typingIndicator = chatContainer.querySelector("#typing-indicator");

            if (!input || !sendBtn || !chatBox) {
                throw new Error("Missing chat controls (input/send button/messages container)");
            }

            function replaceElement(selector) {
                const el = chatContainer.querySelector(selector);
                if (!el) return null;
                const clone = el.cloneNode(true);
                el.parentNode.replaceChild(clone, el);
                return clone;
            }

            const emojiBtnSafe = emojiBtn ? replaceElement("#emoji-btn") : null;
            const emojiPickerSafe = emojiPicker ? replaceElement("#emoji-picker") : null;
            const inputSafe = replaceElement("input[type='text']") || input;
            const sendBtnSafe = replaceElement(".sendBtn") || sendBtn;

            if (emojiBtnSafe && emojiPickerSafe) {
                emojiBtnSafe.addEventListener("click", (e) => {
                    e.stopPropagation();
                    emojiPickerSafe.style.display =
                        emojiPickerSafe.style.display === "block" ? "none" : "block";
                });
                emojiPickerSafe.addEventListener("click", (e) => e.stopPropagation());
                window.addEventListener("click", () => {
                    if (emojiPickerSafe) emojiPickerSafe.style.display = "none";
                });
                emojiPickerSafe.addEventListener("emoji-click", (event) => {
                    inputSafe.value += event.detail.unicode;
                    inputSafe.focus();
                    sendBtnSafe.disabled = !inputSafe.value.trim();
                });
            }

            inputSafe.value = "";
            sendBtnSafe.disabled = true;

            const { data: profile } = await client
                .from("user_profiles")
                .select("is_online")
                .eq("user_id", friendId)
                .maybeSingle();

            typingIndicator.textContent = profile?.is_online ? "Online" : "Offline";

            const oldMessages = await fetchMessages(friendId);
            renderChatMessages(chatBox, oldMessages, friendAvatar);

            const setupChatSubscriptions = async () => {
                try {
                    const chatChannelName = `chat:${[state.currentUserId, friendId].sort().join(":")}`;
                    
                    const chatChannel = await setupSubscriptionWithRetry(chatChannelName, async (channel) => {
                        channel
                            .on('postgres_changes', {
                                event: 'INSERT',
                                schema: 'public',
                                table: 'messages',
                                filter: `sender_id=eq.${state.currentUserId}`
                            }, (payload) => {
                                const newMsg = payload.new;
                                if (state.processingMessageIds.has(newMsg.id)) return;
                                state.processingMessageIds.add(newMsg.id);

                                oldMessages.push(newMsg);
                                renderChatMessages(chatBox, oldMessages, friendAvatar);
                                updateLastMessage(friendId, newMsg.content, newMsg.created_at);

                                setTimeout(() => {
                                    state.processingMessageIds.delete(newMsg.id);
                                }, 1000);
                            })
                            .on('postgres_changes', {
                                event: 'INSERT',
                                schema: 'public',
                                table: 'messages',
                                filter: `sender_id=eq.${friendId}`
                            }, async (payload) => {
                                const newMsg = payload.new;
                                if (state.processingMessageIds.has(newMsg.id)) return;
                                state.processingMessageIds.add(newMsg.id);

                                oldMessages.push(newMsg);
                                renderChatMessages(chatBox, oldMessages, friendAvatar);
                                updateLastMessage(friendId, newMsg.content, newMsg.created_at);

                                if (newMsg.receiver_id === state.currentUserId) {
                                    try {
                                        await client
                                            .from("messages")
                                            .update({ seen: true })
                                            .eq("id", newMsg.id);

                                        const idx = oldMessages.findIndex(m => m.id === newMsg.id);
                                        if (idx !== -1) {
                                            oldMessages[idx].seen = true;
                                        }
                                        renderChatMessages(chatBox, oldMessages, friendAvatar);

                                        state.unseenCounts[newMsg.sender_id] = 0;
                                        updateUnseenBadge(newMsg.sender_id, 0);
                                        scheduleMessageDeletion(newMsg.id, friendId);
                                    } catch (err) {
                                        console.error("Error marking message as seen:", err);
                                    }
                                }

                                setTimeout(() => {
                                    state.processingMessageIds.delete(newMsg.id);
                                }, 1000);
                            })
                            .on('postgres_changes', {
                                event: 'UPDATE',
                                schema: 'public',
                                table: 'messages',
                                filter: `sender_id=eq.${state.currentUserId}`
                            }, (payload) => {
                                const updated = payload.new;

                                if (updated.deleted_at) {
                                    const idx = oldMessages.findIndex(m => m.id === updated.id);
                                    if (idx !== -1) {
                                        oldMessages.splice(idx, 1);
                                        renderChatMessages(chatBox, oldMessages, friendAvatar);
                                    }
                                    updateLastMessageInChatList(updated.sender_id);
                                    updateLastMessageInChatList(updated.receiver_id);

                                    if (state.currentOpenChatId !== updated.sender_id) {
                                        updateUnseenCountForFriend(updated.sender_id);
                                    }
                                    return;
                                }

                                const idx = oldMessages.findIndex(m => m.id === updated.id);
                                if (idx !== -1) {
                                    oldMessages[idx] = { ...oldMessages[idx], ...updated };
                                }

                                if (updated.sender_id === state.currentUserId && updated.seen === true) {
                                    updateMessageSeenStatus(chatBox, updated.id);
                                }
                            })
                            .on('postgres_changes', {
                                event: 'UPDATE',
                                schema: 'public',
                                table: 'messages',
                                filter: `sender_id=eq.${friendId}`
                            }, (payload) => {
                                const updated = payload.new;

                                if (updated.deleted_at) {
                                    const idx = oldMessages.findIndex(m => m.id === updated.id);
                                    if (idx !== -1) {
                                        oldMessages.splice(idx, 1);
                                        renderChatMessages(chatBox, oldMessages, friendAvatar);
                                    }
                                    updateLastMessageInChatList(updated.sender_id);
                                    updateLastMessageInChatList(updated.receiver_id);

                                    if (state.currentOpenChatId !== updated.sender_id) {
                                        updateUnseenCountForFriend(updated.sender_id);
                                    }
                                    return;
                                }

                                const idx = oldMessages.findIndex(m => m.id === updated.id);
                                if (idx !== -1) {
                                    oldMessages[idx] = { ...oldMessages[idx], ...updated };
                                }

                                if (updated.receiver_id === state.currentUserId && updated.seen === true) {
                                    state.unseenCounts[updated.sender_id] = 0;
                                    updateUnseenBadge(updated.sender_id, 0);
                                }
                            });
                    });

                    const typingChannelName = `typing:${[state.currentUserId, friendId].sort().join(":")}`;
                    
                    const typingChannel = await setupSubscriptionWithRetry(typingChannelName, async (channel) => {
                        channel
                            .on('broadcast', { event: 'typing' }, (payload) => {
                                if (payload.userId === friendId) {
                                    typingIndicator.textContent = `${payload.userName || "Friend"} is typing...`;
                                    setTimeout(async () => {
                                        try {
                                            const { data: profile } = await client
                                                .from("user_profiles")
                                                .select("is_online")
                                                .eq("user_id", friendId)
                                                .maybeSingle();
                                            typingIndicator.textContent = profile?.is_online ? "Online" : "Offline";
                                        } catch (err) {
                                            typingIndicator.textContent = "Offline";
                                        }
                                    }, 1500);
                                }
                            });
                    });

                    const statusChannelName = `user-status-${friendId}`;
                    
                    const statusChannel = await setupSubscriptionWithRetry(statusChannelName, async (channel) => {
                        channel
                            .on('postgres_changes', {
                                event: 'UPDATE',
                                schema: 'public',
                                table: 'user_profiles',
                                filter: `user_id=eq.${friendId}`
                            }, (payload) => {
                                console.log("Status update received:", payload);
                                const onlineTextElt = typingIndicator;
                                if (onlineTextElt) {
                                    const isOnline = payload.new?.is_online;
                                    onlineTextElt.textContent = isOnline ? "Online" : "Offline";
                                }
                            });
                    });

                    return { chatChannel, typingChannel, statusChannel };
                } catch (error) {
                    console.error("Error setting up chat subscriptions:", error);
                    return null;
                }
            };

            const { chatChannel, typingChannel, statusChannel } = await setupChatSubscriptions();

            await markMessagesAsSeen(friendId, chatBox, oldMessages, friendAvatar);
            updateUnseenBadge(friendId, 0);
            state.unseenCounts[friendId] = 0;

            inputSafe.addEventListener("input", () => {
                sendBtnSafe.disabled = !inputSafe.value.trim();
                try {
                    if (typingChannel) {
                        typingChannel.send({
                            type: "broadcast",
                            event: "typing",
                            payload: {
                                userId: state.currentUserId,
                                userName: "You",
                            },
                        });
                    }
                } catch (err) {
                    console.error('Something went wrong', err);
                }
            });

            async function handleSend() {
                const content = inputSafe.value.trim();
                if (!content) return;

                await sendMessage(friendId, content);
                inputSafe.value = "";
                sendBtnSafe.disabled = true;
            }

            sendBtnSafe.addEventListener("click", handleSend);
            inputSafe.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    handleSend();
                }
            });

            const backBtn = chatContainer.querySelector(".backBtn");
            if (backBtn) {
                const backClone = backBtn.cloneNode(true);
                backBtn.parentNode.replaceChild(backClone, backBtn);
                backClone.addEventListener("click", async () => {
                    state.currentOpenChatId = null;
                    await deleteSeenMessagesForChat(friendId);

                    document.getElementById('message-notification').classList.remove("hidden");
                    if (window.innerWidth <= 768) {
                        if (sidebar) sidebar.style.display = "flex";
                        if (messageCon) messageCon.style.display = "flex";
                        chatContainer.style.display = "none";
                        defaultScreen.style.display = "flex";
                    } else {
                        chatContainer.style.display = "none";
                        defaultScreen.style.display = "flex";
                    }

                    try {
                        if (chatChannel) await client.removeChannel(chatChannel);
                        if (typingChannel) await client.removeChannel(typingChannel);
                        if (statusChannel) await client.removeChannel(statusChannel);
                    } catch (err) {
                        console.warn("Error removing channels:", err);
                    }
                    fetchFriends();
                });
            }
        } catch (err) {
            console.error("Error opening chat:", err);
            showToast("Failed to open chat.", "error");
        } finally {
            hideLoading();
        }
    }

    async function fetchMessages(friendId) {
        if (!state.currentUserId || !friendId) return [];

        try {
            const { data, error } = await client
                .from("messages")
                .select("*")
                .or(`and(sender_id.eq.${state.currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${state.currentUserId})`)
                .is('deleted_at', null)
                .order("created_at", { ascending: true });
            
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("Error in fetchMessages:", err);
            showToast("Failed to load messages", "error");
            return [];
        }
    }

    function updateFriendUI(friendId) {
        try {
            let friendData = state.allFriends.get(friendId);
            if (!friendData) return;

            const chatLi = document.querySelector(`.chat[data-friend-id="${friendId}"]`);
            if (!chatLi) return;

            const avatarWrapper = chatLi.querySelector(".avatar-wrapper");
            if (avatarWrapper) {
                const existingDot = avatarWrapper.querySelector(".online-dot");
                if (existingDot) existingDot.remove();

                if (friendData.is_online) {
                    const onlineDot = document.createElement("span");
                    onlineDot.className = "online-dot";
                    avatarWrapper.appendChild(onlineDot);
                }
            }

            const avatarImg = chatLi.querySelector(".avatar-wrapper img");
            if (avatarImg && friendData.profile_image_url) {
                avatarImg.src = friendData.profile_image_url;
            }

            const nameEl = chatLi.querySelector("h4");
            if (nameEl && friendData.user_name) {
                nameEl.textContent = friendData.user_name;
            }

            if (state.currentOpenChatId === friendId) {
                const chatHeaderName = document.querySelector("#chat-header-name");
                const chatHeaderImg = document.querySelector(".chat-header img");
                const typingIndicator = document.querySelector("#typing-indicator");

                if (chatHeaderName && friendData.user_name) {
                    chatHeaderName.textContent = friendData.user_name;
                }

                if (chatHeaderImg && friendData.profile_image_url) {
                    chatHeaderImg.src = friendData.profile_image_url;
                }

                if (typingIndicator) {
                    typingIndicator.textContent = friendData.is_online ? "Online" : "Offline";
                }
            }
        } catch (error) {
            console.error("Error updating friend UI:", error);
        }
    }

    function handleNotificationRedirect() {
        try {
            if (!state.currentOpenChatId && state.notificationData.type === 'message' && state.notificationData.senderId) {
                client
                    .from("user_profiles")
                    .select("user_name, profile_image_url")
                    .eq("user_id", state.notificationData.senderId)
                    .maybeSingle()
                    .then(({ data }) => {
                        if (data) {
                            openChat(state.notificationData.senderId, data.user_name, data.profile_image_url, true);
                        }
                    });
            }

            state.notificationData = {};
        } catch (error) {
            console.error("Error handling notification redirect:", error);
        }
    }

    async function userExistsInPrivateUsersTable(userId) {
        try {
            const { data } = await client
                .from("private_users")
                .select("id")
                .eq("id", userId)
                .maybeSingle();

            return !!data;
        } catch (err) {
            console.error("Error in userExistsInPrivateUsersTable:", err);
            return false;
        }
    }

    // Initialize app
    async function initializeApp() {
        try {
            console.log("Starting application initialization...");

            // Get current user
            const { data: { user }, error: userError } = await client.auth.getUser();
            if (userError || !user) {
                showToast("User not logged in", "error");
                window.location.href = 'signup.html';
                return;
            }

            state.currentUserId = user.id;
            console.log("Current user ID:", state.currentUserId);

            // Ensure user exists in all necessary tables
            await ensureUserProfileExists(state.currentUserId);
            await ensureCurrentUserInPrivateUsersTable();

            // Set user online status
            await setUserOnlineStatus(true);

            // Set up periodic online status check
            setupOnlineStatusCheck();

            // Fetch initial data
            await fetchFriends();
            await fetchFriendRequests();

            // Set up real-time subscriptions
            await setupRealtimeSubscriptions();

            // Fetch recent chats
            await fetchRecentChats();

            // Check for admin request
            await checkAndShowAdminRequestPopup();

            // Handle notification redirects
            if (Object.keys(state.notificationData).length > 0) {
                handleNotificationRedirect();
            }

            openChatFromUrl();

            await requestNotificationPermission();

            console.log("App initialized successfully");
        } catch (error) {
            console.error("Error initializing app:", error);
            showToast("Failed to initialize application. Please refresh the page.", "error");
        }
    }

    // Setup real-time subscriptions
    async function setupRealtimeSubscriptions() {
        try {
            // Global messages channel
            await setupSubscriptionWithRetry('global-messages', async (channel) => {
                channel
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'messages',
                        filter: `receiver_id=eq.${state.currentUserId}`
                    }, async (payload) => {
                        const newMsg = payload.new;
                        if (!newMsg || !state.currentUserId) return;

                        const senderId = newMsg.sender_id;

                        if (state.currentOpenChatId !== senderId) {
                            updateUnseenCountForFriend(senderId);
                            updateLastMessage(senderId, newMsg.content, newMsg.created_at);

                            try {
                                const { data: senderProfile } = await client
                                    .from("user_profiles")
                                    .select("user_name, profile_image_url")
                                    .eq("user_id", senderId)
                                    .maybeSingle();

                                const senderName = senderProfile?.user_name || "New Message";
                                const senderAvatar = senderProfile?.profile_image_url || DEFAULT_PROFILE_IMG;

                                showTopRightPopup(`New message from ${senderName}`, "info", senderAvatar);

                                if (Notification.permission === "granted") {
                                    const notif = new Notification(senderName, {
                                        body: newMsg.content,
                                        icon: senderAvatar,
                                        data: { type: 'message', senderId, senderName }
                                    });

                                    notif.addEventListener('click', () => {
                                        window.focus();
                                        openSpecificChat(senderId);
                                        notif.close();
                                    });
                                }
                            } catch (err) {
                                console.warn("Error sending message notification:", err);
                            }
                        }
                    })
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'messages',
                        filter: `receiver_id=eq.${state.currentUserId}`
                    }, (payload) => {
                        const updatedMsg = payload.new;
                        if (!updatedMsg || !state.currentUserId) return;

                        if (updatedMsg.deleted_at) {
                            updateLastMessageInChatList(updatedMsg.sender_id);
                            updateLastMessageInChatList(updatedMsg.receiver_id);

                            if (state.currentOpenChatId !== updatedMsg.sender_id) {
                                updateUnseenCountForFriend(updatedMsg.sender_id);
                            }
                            return;
                        }

                        if (updatedMsg.receiver_id === state.currentUserId && updatedMsg.seen === true) {
                            const senderId = updatedMsg.sender_id;
                            if (state.currentOpenChatId !== senderId) {
                                updateUnseenCountForFriend(senderId);
                            }
                        }
                    });
            });

            // Friend requests channel
            await setupSubscriptionWithRetry(`friend-requests-${state.currentUserId}`, async (channel) => {
                channel
                    .on('postgres_changes', {
                        event: '*',
                        schema: 'public',
                        table: 'requests',
                        filter: `receiver_id=eq.${state.currentUserId}`
                    }, async (payload) => {
                        console.log("Friend request event received:", payload);
                        const { eventType, new: newRecord } = payload;

                        if (eventType === 'INSERT' && newRecord.status === "pending") {
                            try {
                                const { data: senderProfile } = await client
                                    .from("user_profiles")
                                    .select("user_name, profile_image_url")
                                    .eq("user_id", newRecord.sender_id)
                                    .maybeSingle();

                                const senderName = senderProfile?.user_name || "Someone";
                                const senderAvatar = senderProfile?.profile_image_url || DEFAULT_PROFILE_IMG;

                                showTopRightPopup(`${senderName} sent you a friend request`, "info", senderAvatar, () => {
                                    document.getElementById("friend-requests-popup").classList.add("show");
                                });

                                if (Notification.permission === "granted") {
                                    const notif = new Notification("Friend Request 👥", {
                                        body: `${senderName} sent you a request`,
                                        icon: senderAvatar,
                                        data: { type: 'friend_request', senderId: newRecord.sender_id }
                                    });

                                    notif.addEventListener('click', () => {
                                        window.focus();
                                        document.getElementById("friend-requests-popup").classList.add("show");
                                        notif.close();
                                    });
                                }
                            } catch (err) {
                                console.error("Error fetching sender profile for notification:", err);
                            }

                            fetchFriendRequests();
                        } else if (eventType === 'UPDATE') {
                            if (newRecord.status === "accepted") {
                                if (newRecord.sender_id === state.currentUserId) {
                                    showTopRightPopup("Your friend request was accepted!", "success");
                                } else {
                                    showTopRightPopup("You accepted a friend request!", "success");
                                }
                                fetchFriends();
                            } else if (newRecord.status === "rejected") {
                                if (newRecord.sender_id === state.currentUserId) {
                                    showTopRightPopup("Your friend request was rejected", "warning");
                                } else {
                                    showTopRightPopup("You rejected a friend request", "info");
                                }
                            }
                            fetchFriendRequests();
                        }
                    });
            });

            // Friends updates channel
            await setupSubscriptionWithRetry('friends-updates', async (channel) => {
                channel
                    .on('postgres_changes', {
                        event: '*',
                        schema: 'public',
                        table: 'friends'
                    }, (payload) => {
                        console.log("Friends update event received:", payload);
                        const { eventType, new: newRecord } = payload;

                        const isRelevant = newRecord && (
                            newRecord.user1_id === state.currentUserId ||
                            newRecord.user2_id === state.currentUserId
                        );

                        if (!isRelevant) return;

                        if (eventType === 'INSERT' || eventType === 'DELETE') {
                            fetchFriends();
                        }
                    });
            });

            // User profiles updates channel
            await setupSubscriptionWithRetry('user-profiles-updates', async (channel) => {
                channel
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'user_profiles'
                    }, (payload) => {
                        const { new: newRecord } = payload;

                        if (state.allFriends.has(newRecord.user_id)) {
                            state.allFriends.set(newRecord.user_id, {
                                ...state.allFriends.get(newRecord.user_id),
                                ...newRecord
                            });
                            updateFriendUI(newRecord.user_id);
                        }

                        if (newRecord.user_id === state.currentUserId) {
                            updateCurrentUserStatusUI(newRecord.is_online);
                            fetchCurrentUserAvatar();
                        }
                    });
            });

            console.log("All real-time subscriptions set up successfully");
        } catch (error) {
            console.error("Error setting up real-time subscriptions:", error);
            setTimeout(setupRealtimeSubscriptions, 5000);
        }
    }

    // Call initializeApp when DOM is loaded
    initializeApp();
});