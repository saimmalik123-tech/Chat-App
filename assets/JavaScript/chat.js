import { client } from "../../supabase.js";

// Load dashboard styles
// const link = document.createElement('link');
// link.rel = 'stylesheet';
// link.href = '../CSS/dashboard.css';
// document.head.appendChild(link);

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
    // User modal function
    function showUserModal(userId, userName, userAvatar) {
        let modal = document.getElementById("user-modal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "user-modal";
            modal.className = "user-modal";
            modal.innerHTML = `
                <div class="user-modal-backdrop"></div>
                <div class="user-modal-container">
                    <div class="user-modal-header">
                        <h2>User Profile</h2>
                        <span class="user-modal-close">&times;</span>
                    </div>
                    <div class="user-modal-body">
                        <div class="user-modal-avatar-section">
                            <img id="user-modal-avatar" class="user-modal-avatar" src="" alt="User Avatar">
                            <div id="user-modal-status" class="user-modal-status"></div>
                        </div>
                        <div class="user-modal-info">
                            <h3 id="user-modal-username" class="user-modal-username"></h3>
                            <p id="user-modal-bio" class="user-modal-bio"></p>
                            <div class="user-modal-actions">
                                <button id="user-modal-message-btn" class="user-modal-btn primary">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                    </svg>
                                    Message
                                </button>
                                <button id="user-modal-close-btn" class="user-modal-btn secondary">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const closeModal = () => modal.style.display = "none";
            modal.querySelector(".user-modal-close").addEventListener("click", closeModal);
            modal.querySelector("#user-modal-close-btn").addEventListener("click", closeModal);
            modal.querySelector(".user-modal-backdrop").addEventListener("click", closeModal);

            modal.querySelector("#user-modal-message-btn").addEventListener("click", () => {
                closeModal();
                openSpecificChat(userId);
            });
        }

        document.getElementById("user-modal-avatar").src = userAvatar || DEFAULT_PROFILE_IMG;
        document.getElementById("user-modal-username").textContent = userName || "Unknown User";

        getUserProfile(userId).then(profile => {
            if (profile) {
                document.getElementById("user-modal-bio").textContent = profile.bio || "No bio available.";
                const statusElement = document.getElementById("user-modal-status");
                statusElement.textContent = profile.is_online ? "Online" : "Offline";
                statusElement.className = `user-modal-status ${profile.is_online ? 'online' : 'offline'}`;
            }
        }).catch(() => {
            document.getElementById("user-modal-bio").textContent = "No bio available.";
            const statusElement = document.getElementById("user-modal-status");
            statusElement.textContent = "Offline";
            statusElement.className = "user-modal-status offline";
        });

        // Show modal
        modal.style.display = "flex";
    }

    // Get user profile data
    async function getUserProfile(userId) {
        try {
            const { data, error } = await client
                .from("user_profiles")
                .select("user_name, profile_image_url, bio, is_online")
                .eq("user_id", userId)
                .maybeSingle();

            if (error) throw error;
            return data;
        } catch (err) {
            console.error("Error fetching user profile:", err);
            return null;
        }
    }

    // Show popup notification
    function showPopup(message, type = "info") {
        const popup = document.getElementById("notification-popup");
        const messageEl = document.getElementById("popup-message");
        if (!popup || !messageEl) return;

        messageEl.textContent = message;
        popup.classList.remove("hidden", "error", "success", "info");
        popup.classList.add("show", String(type));

        const closeBtn = document.getElementById("popup-close");
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                popup.classList.add("hidden");
                popup.classList.remove('show');
            });
        }
    }

    // Show toast notification
    function showToast(message, type = "info") {
        const toast = document.getElementById("toast-notification");
        const messageEl = document.getElementById("toast-message");
        if (!toast || !messageEl) return;

        messageEl.textContent = message;
        toast.classList.remove("hidden", "success", "error", "info", "warning");
        toast.classList.add("show", String(type));

        const closeBtn = document.getElementById("toast-close");
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                toast.classList.add("hidden");
                toast.classList.remove('show');
            });
        }

        setTimeout(() => {
            toast.classList.add("hidden");
            toast.classList.remove('show');
        }, 3000);
    }

    // Show loading overlay
    function showLoading(message = 'Loading...') {
        const overlay = document.getElementById("loading-overlay");
        const msgEl = document.getElementById("loading-message");
        if (!overlay) return;

        if (msgEl) msgEl.textContent = message;
        overlay.classList.remove('hidden');
        overlay.style.display = "flex";
    }

    // Hide loading overlay
    function hideLoading() {
        const overlay = document.getElementById("loading-overlay");
        if (!overlay) return;
        overlay.classList.add('hidden');
        overlay.style.display = "none";
    }

    // Track active popups
    const activePopups = new Set();

    // Top-right popup function
    function showTopRightPopup(message, type = "info", image = null) {
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

        // Style popup
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

        // Add animation styles if not present
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

        // Close button event
        popup.querySelector(".popup-close").addEventListener("click", () => {
            popup.style.animation = "slideOut 0.3s ease-out forwards";
            setTimeout(() => {
                popup.remove();
                activePopups.delete(popupKey);
            }, 300);
        });

        // Auto remove after 5 seconds
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
    }

    // Request notification permission
    async function requestNotificationPermission() {
        if (!("Notification" in window)) {
            console.warn("Browser does not support notifications.");
            return;
        }
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                console.log("Notifications blocked by user.");
            } else {
                console.log("Notifications enabled ✅");
            }
        } catch (err) {
            console.warn("Notification permission error", err);
        }
    }
    await requestNotificationPermission();

    const DEFAULT_PROFILE_IMG = "./assets/icon/download.jpeg";

    // Fetch current user avatar
    async function fetchCurrentUserAvatar(profileImageSelector = '.profile-pic') {
        const profileImage = document.querySelector(profileImageSelector);
        if (!profileImage) return;

        try {
            const { data: { user }, error } = await client.auth.getUser();
            if (error || !user) return;

            const { data: profile, error: profileError } = await client
                .from("user_profiles")
                .select("profile_image_url")
                .eq("user_id", user.id)
                .maybeSingle();

            if (profileError) {
                console.error("Error fetching profile:", profileError);
                return;
            }

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

    // Global variables
    let currentUserId = null;
    let friendRequests = [];
    let statusChannelRef = null;
    let unseenCounts = {};
    let currentOpenChatId = null;
    let notificationData = {};
    let deletionTimeouts = {};
    let processingMessageIds = new Set();
    let allFriends = new Map(); // Store all friends data for real-time updates

    // Get current user
    async function getCurrentUser() {
        try {
            const { data: { user }, error } = await client.auth.getUser();
            if (error || !user) {
                showToast("User not logged in", "error");
                window.location.href = 'signup.html';
                return null;
            }
            currentUserId = user.id;
            console.log("Current user ID:", currentUserId);
            await setUserOnlineStatus(true);
            return user;
        } catch (err) {
            console.error("getCurrentUser error:", err);
            showToast("Failed to get current user.", "error");
            return null;
        }
    }

    // Accept friend request
    async function acceptRequest(requestId, senderId) {
        try {
            const { error: updateError } = await client
                .from("requests")
                .update({ status: "accepted" })
                .eq("id", requestId);

            if (updateError) {
                console.error("Error updating request:", updateError.message || updateError);
                return showToast("Failed to accept request.", "error");
            }

            const { error: insertError } = await client
                .from("friends")
                .insert([{ user1_id: currentUserId, user2_id: senderId }]);

            if (insertError) {
                console.error("Error inserting into friends:", insertError.message || insertError);
                return showToast("Failed to add friend.", "error");
            }

            showToast("Friend request accepted!", "success");
            showTopRightPopup("Friend request accepted!", "success");
            fetchFriendRequests();
            fetchFriends();
            openSpecificChat(senderId);
        } catch (err) {
            console.error("Unexpected error:", err);
            showToast("An error occurred while accepting request.", "error");
        }
    }

    // Reject friend request
    async function rejectRequest(requestId) {
        try {
            const { error } = await client
                .from("requests")
                .update({ status: "rejected" })
                .eq("id", requestId);

            if (error) {
                console.error("Error rejecting request:", error.message || error);
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

    // Set user online status
    async function setUserOnlineStatus(isOnline) {
        if (!currentUserId) return;
        try {
            await client.from('user_profiles')
                .upsert({ user_id: currentUserId, is_online: isOnline }, { onConflict: 'user_id' });
        } catch (err) {
            console.error("Error updating online status:", err);
        }
    }
    window.addEventListener('beforeunload', () => {
        setUserOnlineStatus(false);
        Object.values(deletionTimeouts).forEach(timeoutId => clearTimeout(timeoutId));
    });

    // Render friend requests
    function renderFriendRequests() {
        const messageList = document.getElementById("message-list");
        const unreadBadge = document.getElementById("unread-count");
        if (!messageList || !unreadBadge) return;

        messageList.innerHTML = "";
        if (!friendRequests || friendRequests.length === 0) {
            messageList.textContent = "No pending friend requests.";
            messageList.style.textAlign = "center";
        } else {
            messageList.style.textAlign = "left";
            friendRequests.forEach((req) => {
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

        unreadBadge.textContent = (friendRequests && friendRequests.length) ? friendRequests.length : "0";
    }

    // Message notification click handler
    document.getElementById("message-notification")?.addEventListener("click", () => {
        const popup = document.getElementById("message-popup");
        if (popup) popup.style.display = popup.style.display === "block" ? "none" : "block";
    });

    // Close message popup when clicking outside
    document.addEventListener("click", (e) => {
        const messageIcon = document.getElementById("message-notification");
        const messagePopup = document.getElementById("message-popup");
        if (messageIcon && messagePopup && !messageIcon.contains(e.target) && !messagePopup.contains(e.target)) {
            messagePopup.style.display = "none";
        }
    });

    // Fetch friend requests
    async function fetchFriendRequests() {
        if (!currentUserId) return;

        console.log("Fetching friend requests for user:", currentUserId);
        showLoading("Fetching friend requests...");

        try {
            const { data: requests, error } = await client
                .from("requests")
                .select("id, sender_id, status")
                .eq("receiver_id", currentUserId)
                .eq("status", "pending");

            if (error) {
                console.error("Error fetching friend requests:", error);
                throw error;
            }

            console.log("Friend requests data:", requests);
            friendRequests = [];

            if (requests && requests.length) {
                const senderIds = Array.from(new Set(requests.map(r => r.sender_id)));
                console.log("Sender IDs:", senderIds);

                const { data: profilesMap, error: profilesError } = await client
                    .from("user_profiles")
                    .select("user_id, user_name, profile_image_url")
                    .in("user_id", senderIds);

                if (profilesError) {
                    console.error("Error fetching sender profiles:", profilesError);
                    throw profilesError;
                }

                const profileById = {};
                (profilesMap || []).forEach(p => {
                    profileById[p.user_id] = p;
                    console.log(`Profile for ${p.user_id}:`, p);
                });

                for (const req of requests) {
                    const senderProfile = profileById[req.sender_id] || {};
                    const avatarUrl = senderProfile.profile_image_url || DEFAULT_PROFILE_IMG;
                    const senderName = senderProfile.user_name || "Someone";

                    friendRequests.push({
                        text: `${senderName} sent you a friend request`,
                        requestId: req.id,
                        senderId: req.sender_id,
                        avatar: avatarUrl
                    });

                    console.log(`Added friend request from ${senderName}`);

                    try {
                        if (Notification.permission === "granted") {
                            const notif = new Notification("Friend Request 👥", {
                                body: `${senderName} sent you a request`,
                                icon: avatarUrl,
                                data: { type: 'friend_request', senderId: req.senderId }
                            });

                            notif.addEventListener('click', () => {
                                window.focus();
                                openSpecificChat(req.senderId);
                                notif.close();
                            });
                        }
                        showTopRightPopup(`${senderName} sent you a friend request`, "info", avatarUrl);
                    } catch (err) {
                        console.warn("Error sending friend request notification:", err);
                    }
                }
            }

            console.log("Final friend requests list:", friendRequests);
            renderFriendRequests();
        } catch (err) {
            console.error("Error fetching requests:", err);
            showToast("Failed to fetch friend requests.", "error");
        } finally {
            hideLoading();
        }
    }

    // Update unseen badge
    function updateUnseenBadge(friendId, count) {
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
    }

    // Update unseen count for friend
    async function updateUnseenCountForFriend(friendId) {
        try {
            const { count, error } = await client
                .from("messages")
                .select("*", { count: "exact", head: true })
                .eq("sender_id", friendId)
                .eq("receiver_id", currentUserId)
                .eq("seen", false)
                .is('deleted_at', null);

            if (error) {
                console.error("Error updating unseen count:", error);
                return;
            }

            const unseenCount = count || 0;
            unseenCounts[friendId] = unseenCount;
            updateUnseenBadge(friendId, unseenCount);
        } catch (err) {
            console.error("updateUnseenCountForFriend error:", err);
        }
    }

    // Schedule message deletion
    function scheduleMessageDeletion(messageId, friendId, delay = 30000) {
        if (deletionTimeouts[messageId]) {
            clearTimeout(deletionTimeouts[messageId]);
        }

        deletionTimeouts[messageId] = setTimeout(async () => {
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
                delete deletionTimeouts[messageId];
            }
        }, delay);
    }

    // Delete seen messages for chat
    async function deleteSeenMessagesForChat(friendId) {
        if (!currentUserId) return;

        try {
            const { data: seenMessages, error: fetchError } = await client
                .from("messages")
                .select("id")
                .eq("receiver_id", currentUserId)
                .eq("sender_id", friendId)
                .eq("seen", true)
                .is('deleted_at', null);

            if (fetchError) {
                console.error("Error fetching seen messages for deletion:", fetchError);
                return;
            }

            if (!seenMessages || seenMessages.length === 0) {
                return;
            }

            seenMessages.forEach(msg => {
                if (deletionTimeouts[msg.id]) {
                    clearTimeout(deletionTimeouts[msg.id]);
                    delete deletionTimeouts[msg.id];
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

    // Update last message in chat list
    async function updateLastMessageInChatList(friendId) {
        try {
            const { data: lastMsgData } = await client
                .from("messages")
                .select("content, created_at, sender_id, receiver_id")
                .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
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

    // Fetch friends
    async function fetchFriends() {
        showLoading("Fetching friends...");
        if (!currentUserId) {
            hideLoading();
            return;
        }

        try {
            const { data: friends, error } = await client
                .from("friends")
                .select("*")
                .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`);

            if (error) throw error;

            const chatList = document.querySelector(".chat-list");
            if (!chatList) return;
            chatList.innerHTML = "";

            const friendIds = friends.map(f => (f.user1_id === currentUserId ? f.user2_id : f.user1_id));

            const { data: profiles } = await client
                .from("user_profiles")
                .select("user_id, user_name, profile_image_url, is_online")
                .in("user_id", friendIds);

            // Store all friends data for real-time updates
            allFriends.clear();
            (profiles || []).forEach(p => {
                allFriends.set(p.user_id, p);
            });

            const friendDataPromises = friendIds.map(async (friendId) => {
                const profile = allFriends.get(friendId) || {};
                const friendName = profile.user_name || "Unknown";
                const avatarUrl = profile.profile_image_url || DEFAULT_PROFILE_IMG;
                const isOnline = profile.is_online || false;

                const { data: lastMsgData } = await client
                    .from("messages")
                    .select("content, created_at, sender_id, receiver_id")
                    .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
                    .is('deleted_at', null)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const lastMessageText = lastMsgData?.content || "No messages yet";
                const lastMessageTime = lastMsgData ? new Date(lastMsgData.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

                let unseenCount = 0;
                try {
                    const { count, error: unseenError } = await client
                        .from("messages")
                        .select("*", { count: "exact", head: true })
                        .eq("sender_id", friendId)
                        .eq("receiver_id", currentUserId)
                        .eq("seen", false)
                        .is('deleted_at', null);

                    if (!unseenError) unseenCount = count || 0;
                } catch (err) {
                    console.warn("unseen count fetch failed:", err);
                }

                return { friendId, friendName, avatarUrl, isOnline, lastMessageText, lastMessageTime, unseenCount };
            });

            const friendData = await Promise.all(friendDataPromises);

            friendData.forEach(data => {
                const { friendId, friendName, avatarUrl, isOnline, lastMessageText, lastMessageTime, unseenCount } = data;

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
                unseenCounts[friendId] = unseenCount || 0;
            });

            enableFriendSearch();
        } catch (err) {
            console.error("Error fetching friends:", err);
            showToast("Failed to load friends.", "error");
        } finally {
            hideLoading();
        }
    }

    // Enable friend search
    function enableFriendSearch() {
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
    }

    // Send message
    async function sendMessage(friendId, content) {
        if (!content || !content.trim()) return;
        try {
            const { error } = await client.from("messages").insert([{
                sender_id: currentUserId,
                receiver_id: friendId,
                content
            }]);
            if (error) {
                console.error("Error sending message:", error);
                showToast("Message failed to send. Please try again.", "error");
            } else {
                updateLastMessage(friendId, content, new Date().toISOString());
            }
        } catch (err) {
            console.error("sendMessage error:", err);
            showToast("Message failed to send. Please try again.", "error");
        }
    }

    // Mark messages as seen
    async function markMessagesAsSeen(friendId, chatBox, oldMessages, friendAvatar) {
        if (!currentUserId) return;
        try {
            const { data: unseenMessages, error: fetchError } = await client
                .from("messages")
                .select("*")
                .eq("receiver_id", currentUserId)
                .eq("sender_id", friendId)
                .eq("seen", false)
                .is('deleted_at', null);

            if (fetchError) {
                console.error("Error fetching unseen messages:", fetchError);
                return;
            }

            if (!unseenMessages || unseenMessages.length === 0) {
                return;
            }

            const { error: updateError } = await client
                .from("messages")
                .update({ seen: true })
                .eq("receiver_id", currentUserId)
                .eq("sender_id", friendId)
                .eq("seen", false);

            if (updateError) {
                console.error("Error marking messages as seen:", updateError);
            } else {
                unseenCounts[friendId] = 0;
                updateUnseenBadge(friendId, 0);

                unseenMessages.forEach(msg => {
                    const idx = oldMessages.findIndex(m => m.id === msg.id);
                    if (idx !== -1) oldMessages[idx].seen = true;
                    scheduleMessageDeletion(msg.id, friendId);
                });
                renderChatMessages(chatBox, oldMessages, friendAvatar);
            }
        } catch (err) {
            console.error("markMessagesAsSeen error:", err);
        }
    }

    // Fetch messages
    async function fetchMessages(friendId) {
        try {
            const { data, error } = await client
                .from("messages")
                .select("*")
                .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
                .is('deleted_at', null)
                .order("created_at", { ascending: true });

            if (error) {
                console.error("Error fetching messages:", error);
                return [];
            }
            return data || [];
        } catch (err) {
            console.error("fetchMessages error:", err);
            return [];
        }
    }

    // Linkify function to make URLs clickable
    function linkify(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    }

    // Render chat messages
    function renderChatMessages(chatBox, msgs, friendAvatar) {
        if (!chatBox) return;
        chatBox.innerHTML = "";
        msgs.forEach(msg => {
            const isMe = msg.sender_id === currentUserId;
            const msgDiv = document.createElement("div");
            msgDiv.className = `message ${isMe ? "sent" : "received"}`;
            msgDiv.setAttribute("data-message-id", msg.id);

            const timeStr = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            }) : "";

            msgDiv.innerHTML = `
                ${!isMe ? `<img src="${friendAvatar}" class="msg-avatar" style="width:25px;height:25px;border-radius:50%;margin-right:6px;">` : ""}
                <div class="msg-bubble">
                    <span class="msg-text">${linkify(msg.content)}</span>
                    <div class="msg-meta">
                        <small class="msg-time">${timeStr}</small>
                        ${isMe ? `<small class="seen-status">${msg.seen ? "✓✓" : "✓"}</small>` : ""}
                    </div>
                </div>
            `;
            chatBox.appendChild(msgDiv);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Send friend request
    async function sendFriendRequest(username) {
        if (!username) return showToast("Enter a username.", "error");

        console.log("Sending friend request to:", username);
        showLoading("Sending friend request...");

        try {
            const { data: user, error: userError } = await client
                .from("user_profiles")
                .select("user_id")
                .eq("user_name", username)
                .maybeSingle();

            if (userError || !user) {
                console.error("User not found:", userError);
                hideLoading();
                return showToast("User not found.", "error");
            }

            const receiverId = user.user_id;
            console.log("Found user with ID:", receiverId);

            if (receiverId === currentUserId) {
                hideLoading();
                return showToast("You cannot send a request to yourself.", "warning");
            }

            const { data: existing, error: existingError } = await client
                .from("requests")
                .select("id, status")
                .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${currentUserId})`)
                .maybeSingle();

            if (existingError) {
                console.error("Error checking existing request:", existingError);
                hideLoading();
                return showToast("Something went wrong. Try again.", "error");
            }

            if (existing) {
                console.log("Existing request found:", existing);
                hideLoading();
                if (existing.status === "pending") {
                    showTopRightPopup(`You already have a pending request to ${username}`, "warning");
                    return showToast("You have already sent a request.", "info");
                }
                if (existing.status === "accepted") {
                    showTopRightPopup(`You are already friends with ${username}`, "info");
                    return showToast("You are already friends.", "info");
                }
                if (existing.status === "rejected") {
                    showTopRightPopup(`This user rejected your request before`, "warning");
                    return showToast("This user rejected your request before.", "warning");
                }
            }

            console.log("Creating new friend request...");
            const { data: newRequest, error: requestError } = await client
                .from("requests")
                .insert([{
                    sender_id: currentUserId,
                    receiver_id: receiverId,
                    status: "pending"
                }])
                .select()
                .single();

            if (requestError) {
                console.error("Error sending friend request:", requestError);
                hideLoading();
                return showToast("Failed to send friend request.", "error");
            }

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

    // Update message seen status
    function updateMessageSeenStatus(chatBox, messageId) {
        const chatMessage = chatBox.querySelector(`.message[data-message-id="${messageId}"] .seen-status`);
        if (chatMessage) {
            chatMessage.textContent = "✓✓";
        }
    }

    // Subscribe to messages
    async function subscribeToMessages(friendId, chatBox, oldMessages, friendAvatar, typingIndicator) {
        function upsertMessageAndRender(oldMessagesArr, msgObj) {
            const idx = oldMessagesArr.findIndex(m => m.id === msgObj.id);
            if (idx === -1) {
                oldMessagesArr.push(msgObj);
            } else {
                oldMessagesArr[idx] = { ...oldMessagesArr[idx], ...msgObj };
            }
            renderChatMessages(chatBox, oldMessagesArr, friendAvatar);
        }

        const userCache = {};
        async function getUsername(userId) {
            if (userCache[userId]) return userCache[userId];
            try {
                const { data, error } = await client
                    .from("user_profiles")
                    .select("user_name, profile_image_url")
                    .eq("user_id", userId)
                    .maybeSingle();

                if (error) throw error;
                const username = data?.user_name || "Someone";
                const avatarUrl = data?.profile_image_url || DEFAULT_PROFILE_IMG;
                userCache[userId] = { username, avatarUrl };
                return { username, avatarUrl };
            } catch (err) {
                console.error("Error fetching username:", err);
                return { username: "Someone", avatarUrl: DEFAULT_PROFILE_IMG };
            }
        }

        const channelTopic = `chat:${[currentUserId, friendId].sort().join(":")}`;
        const msgChannel = client.channel(channelTopic);

        msgChannel.on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "messages" },
            async payload => {
                const newMsg = payload.new;
                const isRelevant =
                    (newMsg.sender_id === currentUserId && newMsg.receiver_id === friendId) ||
                    (newMsg.sender_id === friendId && newMsg.receiver_id === currentUserId);
                if (!isRelevant) return;

                if (processingMessageIds.has(newMsg.id)) {
                    return;
                }
                processingMessageIds.add(newMsg.id);

                upsertMessageAndRender(oldMessages, newMsg);
                updateLastMessage(friendId, newMsg.content, newMsg.created_at);

                if (newMsg.receiver_id === currentUserId) {
                    if (currentOpenChatId === friendId) {
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

                            unseenCounts[newMsg.sender_id] = 0;
                            updateUnseenBadge(newMsg.sender_id, 0);
                            scheduleMessageDeletion(newMsg.id, friendId);
                        } catch (err) {
                            console.error("Error marking message as seen:", err);
                        }
                    } else {
                        await updateUnseenCountForFriend(friendId);

                        try {
                            const { username, avatarUrl } = await getUsername(newMsg.sender_id);
                            showTopRightPopup(`New message from ${username}`, "info", avatarUrl);

                            if (Notification.permission === "granted") {
                                const notif = new Notification(`${username}`, {
                                    body: newMsg.content,
                                    icon: avatarUrl,
                                    data: { type: 'message', senderId: newMsg.sender_id, senderName: username }
                                });

                                notif.addEventListener('click', () => {
                                    window.focus();
                                    openSpecificChat(newMsg.sender_id);
                                    notif.close();
                                });
                            }
                        } catch (err) { /* ignore */ }
                    }
                }

                setTimeout(() => {
                    processingMessageIds.delete(newMsg.id);
                }, 1000);
            }
        );

        msgChannel.on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "messages" },
            payload => {
                const updated = payload.new;
                const isRelevant =
                    (updated.sender_id === currentUserId && updated.receiver_id === friendId) ||
                    (updated.sender_id === friendId && updated.receiver_id === currentUserId);
                if (!isRelevant) return;

                if (updated.deleted_at) {
                    if (updated.receiver_id === currentUserId) {
                        const idx = oldMessages.findIndex(m => m.id === updated.id);
                        if (idx !== -1) {
                            oldMessages.splice(idx, 1);
                            renderChatMessages(chatBox, oldMessages, friendAvatar);
                        }
                    }
                    updateLastMessageInChatList(updated.sender_id);
                    updateLastMessageInChatList(updated.receiver_id);

                    if (currentOpenChatId !== updated.sender_id) {
                        updateUnseenCountForFriend(updated.sender_id);
                    }
                    return;
                }

                const idx = oldMessages.findIndex(m => m.id === updated.id);
                if (idx !== -1) {
                    oldMessages[idx] = { ...oldMessages[idx], ...updated };
                }

                if (updated.sender_id === currentUserId && updated.seen === true) {
                    updateMessageSeenStatus(chatBox, updated.id);
                }

                if (updated.receiver_id === currentUserId && updated.seen === true) {
                    unseenCounts[updated.sender_id] = 0;
                    updateUnseenBadge(updated.sender_id, 0);
                }
            }
        );

        const typingChannelName = `typing:${[currentUserId, friendId].sort().join(":")}`;
        const typingChannel = client.channel(typingChannelName)
            .on("broadcast", { event: "typing" }, payload => {
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

        if (statusChannelRef) {
            try { await client.removeChannel(statusChannelRef); } catch (err) { /* ignore */ }
            statusChannelRef = null;
        }

        statusChannelRef = client.channel("user_status")
            .on("postgres_changes", {
                event: "*",
                schema: "public",
                table: "user_profiles",
                filter: `user_id=eq.${friendId}`
            }, payload => {
                const onlineTextElt = typingIndicator;
                if (onlineTextElt) onlineTextElt.textContent = payload.new?.is_online ? "Online" : "Offline";
            });

        await msgChannel.subscribe();
        await typingChannel.subscribe();
        await statusChannelRef.subscribe();

        return { msgChannel, typingChannel, statusChannelRef };
    }

    // Open chat
    async function openChat(friendId, friendName, friendAvatar, fromNotification = false) {
        currentOpenChatId = friendId;

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

        // Add click event to chat header to show user modal
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

        try {
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

            const oldMessages = await fetchMessages(friendId);
            renderChatMessages(chatBox, oldMessages, friendAvatar);

            const { msgChannel, typingChannel, statusChannelRef: statusChan } =
                await subscribeToMessages(
                    friendId,
                    chatBox,
                    oldMessages,
                    friendAvatar,
                    typingIndicator
                );

            await markMessagesAsSeen(friendId, chatBox, oldMessages, friendAvatar);
            updateUnseenBadge(friendId, 0);
            unseenCounts[friendId] = 0;

            const typingChannelName = `typing:${[currentUserId, friendId]
                .sort()
                .join(":")}`;

            inputSafe.addEventListener("input", () => {
                sendBtnSafe.disabled = !inputSafe.value.trim();
                try {
                    client.channel(typingChannelName).send({
                        type: "broadcast",
                        event: "typing",
                        payload: {
                            userId: currentUserId,
                            userName: "You",
                        },
                    });
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
                    currentOpenChatId = null;
                    await deleteSeenMessagesForChat(friendId);

                    document.getElementById('message-notification').classList.remove('hidden');
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
                        if (msgChannel) await client.removeChannel(msgChannel);
                        if (typingChannel) await client.removeChannel(typingChannel);
                        if (statusChan) await client.removeChannel(statusChan);
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

    // Submit friend request
    document.querySelector(".submit-friend")?.addEventListener("click", () => {
        const username = document.querySelector(".friend-input")?.value.trim();
        sendFriendRequest(username);
    });

    // Update last message
    function updateLastMessage(friendId, content, createdAt) {
        const chatLi = document.querySelector(`.chat[data-friend-id="${friendId}"]`);
        if (!chatLi) return;

        const lastMessageEl = chatLi.querySelector(".last-message");
        const timeEl = chatLi.querySelector(".time");

        if (lastMessageEl) lastMessageEl.textContent = content;
        if (timeEl) {
            const timeStr = new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            timeEl.textContent = timeStr;
        }

        const chatList = chatLi.parentElement;
        if (chatList && chatList.firstChild !== chatLi) {
            chatList.prepend(chatLi);
        }
    }

    // Subscribe to global messages
    async function subscribeToGlobalMessages() {
        if (!window._globalMessageChannel) {
            window._globalMessageChannel = client.channel("global-messages");

            window._globalMessageChannel.on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "messages" },
                async payload => {
                    const newMsg = payload.new;
                    if (!newMsg || !currentUserId) return;

                    if (newMsg.receiver_id === currentUserId) {
                        const senderId = newMsg.sender_id;

                        if (currentOpenChatId !== senderId) {
                            updateUnseenCountForFriend(senderId);
                            updateLastMessage(senderId, newMsg.content, newMsg.created_at);

                            try {
                                const { data: senderProfile, error } = await client
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
                    }
                }
            );

            window._globalMessageChannel.on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "messages" },
                payload => {
                    const updatedMsg = payload.new;
                    if (!updatedMsg || !currentUserId) return;

                    if (updatedMsg.deleted_at) {
                        updateLastMessageInChatList(updatedMsg.sender_id);
                        updateLastMessageInChatList(updatedMsg.receiver_id);

                        if (currentOpenChatId !== updatedMsg.sender_id) {
                            updateUnseenCountForFriend(updatedMsg.sender_id);
                        }
                        return;
                    }

                    if (updatedMsg.receiver_id === currentUserId && updatedMsg.seen === true) {
                        const senderId = updatedMsg.sender_id;

                        if (currentOpenChatId !== senderId) {
                            updateUnseenCountForFriend(senderId);
                        }
                    }
                }
            );

            try {
                await window._globalMessageChannel.subscribe();
                console.log("Subscribed to global-messages channel.");
            } catch (err) {
                console.warn("subscribeToGlobalMessages subscribe failed:", err);
            }
        }
    }

    // Subscribe to friend requests
    async function subscribeToFriendRequests() {
        if (!window._friendRequestChannel) {
            const channelName = `friend-requests-${currentUserId}`;
            window._friendRequestChannel = client.channel(channelName);

            console.log("Setting up friend request subscription for user:", currentUserId);

            window._friendRequestChannel.on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "requests",
                    filter: `receiver_id=eq.${currentUserId}`
                },
                payload => {
                    console.log("Friend request event received:", payload);
                    const { eventType, new: newRecord } = payload;

                    if (eventType === 'INSERT' && newRecord.status === "pending") {
                        console.log("New friend request received:", newRecord);
                        showTopRightPopup("You have a new friend request!", "info");
                        fetchFriendRequests();
                    } else if (eventType === 'UPDATE') {
                        console.log("Friend request updated:", newRecord);
                        if (newRecord.status === "accepted") {
                            showTopRightPopup("Friend request accepted!", "success");
                            fetchFriends();
                        } else if (newRecord.status === "rejected") {
                            showTopRightPopup("Friend request rejected", "info");
                        }
                        fetchFriendRequests();
                    }
                }
            );

            try {
                await window._friendRequestChannel.subscribe((status) => {
                    console.log("Friend request subscription status:", status);
                    if (status === 'SUBSCRIBED') {
                        console.log("Successfully subscribed to friend requests");
                        fetchFriendRequests();
                    } else if (status === 'CHANNEL_ERROR') {
                        console.error("Error subscribing to friend requests");
                        setTimeout(() => subscribeToFriendRequests(), 5000);
                    }
                });
            } catch (err) {
                console.error("Error setting up friend request subscription:", err);
            }
        }
    }

    // Subscribe to friends updates
    async function subscribeToFriendsUpdates() {
        if (!window._friendsUpdatesChannel) {
            window._friendsUpdatesChannel = client.channel("friends-updates");

            window._friendsUpdatesChannel.on(
                "postgres_changes",
                { event: "*", schema: "public", table: "friends" },
                payload => {
                    console.log("Friends update event received:", payload);

                    const { eventType, new: newRecord, old: oldRecord } = payload;

                    // Check if this update is relevant to current user
                    const isRelevant = newRecord && (
                        newRecord.user1_id === currentUserId ||
                        newRecord.user2_id === currentUserId
                    ) || oldRecord && (
                        oldRecord.user1_id === currentUserId ||
                        oldRecord.user2_id === currentUserId
                    );

                    if (!isRelevant) return;

                    if (eventType === 'INSERT') {
                        // New friend added
                        console.log("New friend added:", newRecord);
                        fetchFriends();
                    } else if (eventType === 'DELETE') {
                        // Friend removed
                        console.log("Friend removed:", oldRecord);
                        fetchFriends();
                    }
                }
            );

            try {
                await window._friendsUpdatesChannel.subscribe();
                console.log("Subscribed to friends updates channel.");
            } catch (err) {
                console.warn("subscribeToFriendsUpdates subscribe failed:", err);
            }
        }
    }

    // Subscribe to user profiles updates
    async function subscribeToUserProfilesUpdates() {
        if (!window._userProfilesUpdatesChannel) {
            window._userProfilesUpdatesChannel = client.channel("user-profiles-updates");

            window._userProfilesUpdatesChannel.on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "user_profiles" },
                payload => {
                    console.log("User profile update event received:", payload);

                    const { new: newRecord } = payload;

                    // Update friend data in our cache if it's a friend
                    if (allFriends.has(newRecord.user_id)) {
                        allFriends.set(newRecord.user_id, {
                            ...allFriends.get(newRecord.user_id),
                            ...newRecord
                        });

                        // Update UI for this friend
                        updateFriendUI(newRecord.user_id);
                    }

                    // If current user's profile was updated, refresh avatar
                    if (newRecord.user_id === currentUserId) {
                        fetchCurrentUserAvatar();
                    }
                }
            );

            try {
                await window._userProfilesUpdatesChannel.subscribe();
                console.log("Subscribed to user profiles updates channel.");
            } catch (err) {
                console.warn("subscribeToUserProfilesUpdates subscribe failed:", err);
            }
        }
    }

    // Update friend UI in real-time
    function updateFriendUI(friendId) {
        const friendData = allFriends.get(friendId);
        if (!friendData) return;

        const chatLi = document.querySelector(`.chat[data-friend-id="${friendId}"]`);
        if (!chatLi) return;

        // Update online status
        const avatarWrapper = chatLi.querySelector(".avatar-wrapper");
        if (avatarWrapper) {
            // Remove existing online dot
            const existingDot = avatarWrapper.querySelector(".online-dot");
            if (existingDot) existingDot.remove();

            // Add online dot if friend is online
            if (friendData.is_online) {
                const onlineDot = document.createElement("span");
                onlineDot.className = "online-dot";
                avatarWrapper.appendChild(onlineDot);
            }
        }

        // Update profile image if changed
        const avatarImg = chatLi.querySelector(".avatar-wrapper img");
        if (avatarImg && friendData.profile_image_url) {
            avatarImg.src = friendData.profile_image_url;
        }

        // Update username if changed
        const nameEl = chatLi.querySelector("h4");
        if (nameEl && friendData.user_name) {
            nameEl.textContent = friendData.user_name;
        }

        // If this is the currently open chat, update the chat header as well
        if (currentOpenChatId === friendId) {
            const chatHeaderName = document.querySelector("#chat-header-name");
            const chatHeaderImg = document.querySelector(".chat-header img");

            if (chatHeaderName && friendData.user_name) {
                chatHeaderName.textContent = friendData.user_name;
            }

            if (chatHeaderImg && friendData.profile_image_url) {
                chatHeaderImg.src = friendData.profile_image_url;
            }
        }
    }

    // Handle notification redirect
    function handleNotificationRedirect() {
        if (!currentOpenChatId && notificationData.type === 'message' && notificationData.senderId) {
            client
                .from("user_profiles")
                .select("user_name, profile_image_url")
                .eq("user_id", notificationData.senderId)
                .maybeSingle()
                .then(({ data, error }) => {
                    if (!error && data) {
                        openChat(notificationData.senderId, data.user_name, data.profile_image_url, true);
                    }
                });
        }

        notificationData = {};
    }

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

    // Create loader
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

    // Profile pic click handler
    profilePic?.addEventListener("click", async () => {
        if (!profilePopup) return;
        profilePopup.classList.remove("hidden");

        try {
            const { data: profile, error } = await client
                .from("user_profiles")
                .select("profile_image_url, bio, user_name")
                .eq("user_id", currentUserId)
                .limit(1)
                .maybeSingle();

            if (error) throw error;

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
    });

    closeProfile?.addEventListener("click", () => {
        profilePopup?.classList.add("hidden");
    });

    profileUpload?.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                profilePreview.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    saveProfileBtn?.addEventListener("click", async () => {
        const originalContent = saveProfileBtn.innerHTML;

        saveProfileBtn.disabled = true;
        saveProfileBtn.innerHTML = '';
        saveProfileBtn.appendChild(createLoader());

        try {
            let imageUrl = profilePreview?.src || DEFAULT_PROFILE_IMG;
            const bio = bioInput?.value.trim() || "";

            const file = profileUpload?.files[0];
            if (file) {
                const fileName = `${currentUserId}_${Date.now()}_${file.name}`;
                const { data, error: uploadError } = await client.storage
                    .from('avatars')
                    .upload(fileName, file, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (uploadError) throw uploadError;

                const { data: publicUrlData } = client.storage.from('avatars').getPublicUrl(data.path);
                imageUrl = publicUrlData.publicUrl;
            }

            const { error } = await client
                .from("user_profiles")
                .update({ profile_image_url: imageUrl, bio })
                .eq("user_id", currentUserId);

            if (error) throw error;

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
                profilePopup?.classList.add("hidden");
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
    });

    logoutBtn?.addEventListener("click", async () => {
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
    });

    changeUsernameBtn?.addEventListener("click", () => {
        profilePopup?.classList.add("hidden");
        usernamePopup?.classList.remove("hidden");
    });

    closeUsername?.addEventListener("click", () => {
        usernamePopup?.classList.add("hidden");
    });
    cancelUsername?.addEventListener("click", () => {
        usernamePopup?.classList.add("hidden");
    });

    saveUsernameBtn?.addEventListener("click", async () => {
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
            const { error } = await client
                .from("user_profiles")
                .update({ user_name: newUsername })
                .eq("user_id", currentUserId);

            if (error) throw error;

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
                usernamePopup?.classList.add("hidden");
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
    });

    // Show confirm popup
    function showConfirmPopup(message, onConfirm, onCancel) {
        const popup = document.getElementById("notification-popup");
        const messageEl = document.getElementById("popup-message");
        const closeBtn = document.getElementById("popup-close");

        if (!popup || !messageEl) return;

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'modal-popup-buttons';
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

        const existingButtons = popup.querySelector('.modal-popup-buttons');
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
            popup.classList.add("hidden");
            popup.classList.remove('show');
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
    }

    // Initialize database schema
    async function initializeDatabaseSchema() {
        try {
            const { data, error } = await client
                .from("messages")
                .select("id")
                .limit(1)
                .is('deleted_at', null);

            if (error && error.message.includes("column \"deleted_at\" does not exist")) {
                console.log("deleted_at column does not exist, adding it...");

                try {
                    const { error: alterError } = await client.rpc('exec_sql', {
                        sql: "ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;"
                    });

                    if (alterError) {
                        console.error("Error adding deleted_at column:", alterError);
                    } else {
                        console.log("Successfully added deleted_at column");
                    }
                } catch (alterErr) {
                    console.error("Exception when adding deleted_at column:", alterErr);
                }
            }
        } catch (err) {
            console.error("Error initializing database schema:", err);
        }
    }

    // Get user profile for chat
    async function getUserProfile(userId) {
        try {
            const { data, error } = await client
                .from("user_profiles")
                .select("user_name, profile_image_url")
                .eq("user_id", userId)
                .maybeSingle();

            if (error) {
                console.error("Error fetching user profile:", error);
                return null;
            }

            return data;
        } catch (err) {
            console.error("Unexpected error in getUserProfile:", err);
            return null;
        }
    }

    // Open specific chat
    async function openSpecificChat(userId, profile = null) {
        if (!currentUserId) {
            const user = await getCurrentUser();
            if (!user) {
                showToast("You must be logged in to open a chat", "error");
                return;
            }
        }

        if (currentOpenChatId === userId) {
            return;
        }

        let userProfile = profile;
        if (!userProfile) {
            userProfile = await getUserProfile(userId);
            if (!userProfile) {
                showToast("User not found", "error");
                return;
            }
        }

        openChat(userId, userProfile.user_name, userProfile.profile_image_url);
    }

    // Generate chat link
    function generateChatLink(friendId) {
        const baseUrl = window.location.origin + window.location.pathname;
        return `${baseUrl}?chat=${friendId}`;
    }

    // Open chat from URL
    function openChatFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const friendId = urlParams.get('chat');

        if (friendId && currentUserId) {
            client.from("user_profiles")
                .select("user_name, profile_image_url")
                .eq("user_id", friendId)
                .maybeSingle()
                .then(({ data, error }) => {
                    if (!error && data) {
                        openSpecificChat(friendId, data);
                    }
                });
        }
    }

    // Global function to open chat with user
    window.openChatWithUser = async function (userId) {
        if (!currentUserId) return;

        try {
            const { data: profile, error } = await client
                .from("user_profiles")
                .select("user_name, profile_image_url")
                .eq("user_id", userId)
                .maybeSingle();

            if (error) throw error;

            if (profile) {
                openSpecificChat(userId, profile);
            } else {
                showToast("User not found", "error");
            }
        } catch (err) {
            console.error("Error opening chat:", err);
            showToast("Failed to open chat", "error");
        }
    };

    // Fetch recent chats
    async function fetchRecentChats() {
        try {
            const { data: friends, error: friendsError } = await client
                .from("friends")
                .select("*")
                .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`);

            if (friendsError) throw friendsError;

            if (!friends || friends.length === 0) {
                renderRecentChats([]);
                return;
            }

            const friendIds = friends.map(f =>
                f.user1_id === currentUserId ? f.user2_id : f.user1_id
            );

            const { data: profiles, error: profilesError } = await client
                .from("user_profiles")
                .select("user_id, user_name, profile_image_url, is_online")
                .in("user_id", friendIds);

            if (profilesError) throw profilesError;

            const recentChatsPromises = friendIds.map(async (friendId) => {
                const { data: lastMessage } = await client
                    .from("messages")
                    .select("content, created_at")
                    .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
                    .is('deleted_at', null)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const profile = profiles?.find(p => p.user_id === friendId);

                return {
                    user_id: friendId,
                    user_name: profile?.user_name || "Unknown",
                    avatar_url: profile?.profile_image_url || DEFAULT_PROFILE_IMG,
                    is_online: profile?.is_online || false,
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

    // Render recent chats
    function renderRecentChats(chats) {
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
    }

    // Initialize app
    const me = await getCurrentUser();
    if (me) {
        await initializeDatabaseSchema();
        await fetchFriends();
        await fetchFriendRequests();

        // Set up real-time subscriptions
        await subscribeToGlobalMessages();
        await subscribeToFriendRequests();
        await subscribeToFriendsUpdates();
        await subscribeToUserProfilesUpdates();

        await fetchRecentChats();

        if (Object.keys(notificationData).length > 0) {
            handleNotificationRedirect();
        }

        openChatFromUrl();

        setInterval(() => {
            if (window._friendRequestChannel && window._friendRequestChannel.state !== 'joined') {
                console.log("Reconnecting friend request subscription");
                subscribeToFriendRequests();
            }
            if (window._globalMessageChannel && window._globalMessageChannel.state !== 'joined') {
                console.log("Reconnecting global message subscription");
                subscribeToGlobalMessages();
            }
        }, 300); 
    }
});