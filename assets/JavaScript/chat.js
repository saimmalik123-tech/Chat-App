import { client } from "../../supabase.js";

document.addEventListener("DOMContentLoaded", async () => {
    const AI_ASSISTANT_USERNAME = "AI_Assistant";
    const AI_ASSISTANT_BIO = "I'm your AI assistant! Feel free to ask me anything.";
    const AI_ASSISTANT_AVATAR = "./assets/icon/ai-avatar.png"; // Make sure to add this image
    const OPENROUTER_API_KEY = "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";
    // Fixed: Use a proper UUID format for the AI assistant ID
    const AI_ASSISTANT_ID = "00000000-0000-0000-0000-000000000001"; // Valid UUID for AI assistant

    const DEFAULT_PROFILE_IMG = "./assets/icon/download.jpeg";
    const ADMIN_USERNAME = "Saim_Malik88";
    const ADMIN_REQUEST_KEY = "adminRequestShown"; // localStorage key

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

    // Show modal with animation
    function showModal(modalId) {
        try {
            const modal = document.getElementById(modalId);
            if (!modal) {
                console.error(`Modal with ID ${modalId} not found`);
                return;
            }

            modal.classList.remove('hidden');
            // Force reflow
            modal.offsetHeight;
            modal.classList.add('show');
        } catch (error) {
            console.error("Error showing modal:", error);
        }
    }

    // Hide modal with animation
    function hideModal(modalId) {
        try {
            const modal = document.getElementById(modalId);
            if (!modal) {
                console.error(`Modal with ID ${modalId} not found`);
                return;
            }

            modal.classList.remove('show');
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 300); // Match animation duration
        } catch (error) {
            console.error("Error hiding modal:", error);
        }
    }

    // Show toast notification
    function showToast(message, type = "info") {
        try {
            const toast = document.getElementById("toast-notification");
            const messageEl = document.getElementById("toast-message");
            if (!toast || !messageEl) {
                console.error("Toast notification elements not found");
                return;
            }

            messageEl.textContent = message;
            toast.classList.remove("hidden", "success", "error", "info", "warning");
            toast.classList.add("show", type);

            const closeBtn = document.getElementById("toast-close");
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    toast.classList.remove("show");
                    setTimeout(() => toast.classList.add("hidden"), 300);
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

    // Show loading overlay
    function showLoading(message = 'Loading...') {
        try {
            const overlay = document.getElementById("loading-overlay");
            const msgEl = document.getElementById("loading-message");
            if (!overlay) {
                console.error("Loading overlay not found");
                return;
            }

            if (msgEl) msgEl.textContent = message;
            overlay.classList.remove('hidden');
            // Force reflow
            overlay.offsetHeight;
            overlay.classList.add('show');
        } catch (error) {
            console.error("Error showing loading overlay:", error);
        }
    }

    // Hide loading overlay
    function hideLoading() {
        try {
            const overlay = document.getElementById("loading-overlay");
            if (!overlay) {
                console.error("Loading overlay not found");
                return;
            }

            overlay.classList.remove('show');
            setTimeout(() => overlay.classList.add('hidden'), 300);
        } catch (error) {
            console.error("Error hiding loading overlay:", error);
        }
    }

    // Track active popups
    const activePopups = new Set();

    // Top-right popup function
    function showTopRightPopup(message, type = "info", image = null) {
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
        } catch (error) {
            console.error("Error showing top-right popup:", error);
        }
    }

    // Request notification permission
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

    // Function to show notification with fallback to in-app notification
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

        // Fallback to in-app notification
        showTopRightPopup(title, "info", options.icon);
        return null;
    }

    // Initialize notifications
    await requestNotificationPermission();

    // Fetch current user avatar
    async function fetchCurrentUserAvatar(profileImageSelector = '.profile-pic') {
        try {
            const profileImage = document.querySelector(profileImageSelector);
            if (!profileImage) return;

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

            // Initialize AI assistant BEFORE adding as friend
            await ensureAIAssistantExists();

            // Add AI assistant as friend for new users
            await addAIAssistantAsFriend();

            // Check if we need to show admin friend request popup
            await checkAndShowAdminRequestPopup();

            return user;
        } catch (err) {
            console.error("getCurrentUser error:", err);
            showToast("Failed to get current user.", "error");
            return null;
        }
    }

    // Check if user is already a friend
    async function isAlreadyFriend(userId) {
        if (!currentUserId || !userId) return false;

        try {
            const { data, error } = await client
                .from("friends")
                .select("*")
                .or(`and(user1_id.eq.${currentUserId},user2_id.eq.${userId}),and(user1_id.eq.${userId},user2_id.eq.${currentUserId})`)
                .maybeSingle();

            if (error) {
                console.error("Error checking friendship status:", error);
                return false;
            }

            return !!data;
        } catch (err) {
            console.error("Error in isAlreadyFriend:", err);
            return false;
        }
    }

    // Show admin friend request popup for new users
    async function checkAndShowAdminRequestPopup() {
        // Check if we've already shown the admin request popup
        if (localStorage.getItem(ADMIN_REQUEST_KEY) === 'true') return;

        try {
            // Check if user is new (less than 1 day old)
            const { data: { user }, error: userError } = await client.auth.getUser();
            if (userError || !user) return;

            const createdAt = new Date(user.created_at);
            const now = new Date();
            const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);

            if (hoursSinceCreation > 24) {
                localStorage.setItem(ADMIN_REQUEST_KEY, 'true');
                return;
            }

            // Check if already friends with admin
            const { data: adminProfile, error: adminError } = await client
                .from("user_profiles")
                .select("user_id")
                .eq("user_name", ADMIN_USERNAME)
                .maybeSingle();

            if (adminError || !adminProfile) {
                localStorage.setItem(ADMIN_REQUEST_KEY, 'true');
                return;
            }

            const isAdminFriend = await isAlreadyFriend(adminProfile.user_id);
            if (isAdminFriend) {
                localStorage.setItem(ADMIN_REQUEST_KEY, 'true');
                return;
            }

            // Show popup to send friend request to admin
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

    // Accept friend request
    async function acceptRequest(requestId, senderId) {
        try {
            // Check if already friends
            const alreadyFriends = await isAlreadyFriend(senderId);
            if (alreadyFriends) {
                showToast("You are already friends with this user.", "info");
                showTopRightPopup("You are already friends with this user.", "info");
                return;
            }

            // Update the request status to accepted
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

            // Fetch updated friend requests and friends lists
            await fetchFriendRequests();
            await fetchFriends();

            await openSpecificChat(senderId);

            await fetchRecentChats();

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
        try {
            const messageList = document.getElementById("friend-requests-list");
            const unreadBadge = document.getElementById("unread-count");
            if (!messageList || !unreadBadge) return;

            messageList.innerHTML = "";
            if (!friendRequests || friendRequests.length === 0) {
                const noRequestsItem = document.createElement("li");
                noRequestsItem.className = "no-requests";
                noRequestsItem.textContent = "No pending friend requests.";
                messageList.appendChild(noRequestsItem);
            } else {
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
        } catch (error) {
            console.error("Error rendering friend requests:", error);
        }
    }

    // Message notification click handler
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

    // Close message popup when clicking outside
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
        try {
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
        } catch (error) {
            console.error("Error scheduling message deletion:", error);
        }
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

            // Use a Set to deduplicate friend IDs
            const friendIds = [...new Set(friends.map(f =>
                f.user1_id === currentUserId ? f.user2_id : f.user1_id
            ))];

            // Add AI assistant to friends list if not already there
            if (!friendIds.includes(AI_ASSISTANT_ID)) {
                friendIds.push(AI_ASSISTANT_ID);
            }

            // Fetch regular user profiles
            const { data: profiles } = await client
                .from("user_profiles")
                .select("user_id, user_name, profile_image_url, is_online")
                .in("user_id", friendIds.filter(id => id !== AI_ASSISTANT_ID));

            // Store all friends data for real-time updates
            allFriends.clear();
            (profiles || []).forEach(p => {
                allFriends.set(p.user_id, p);
            });

            // Add AI assistant to friends map
            allFriends.set(AI_ASSISTANT_ID, {
                user_id: AI_ASSISTANT_ID,
                user_name: AI_ASSISTANT_USERNAME,
                profile_image_url: AI_ASSISTANT_AVATAR,
                is_online: true
            });

            const friendDataPromises = friendIds.map(async (friendId) => {
                let profile = allFriends.get(friendId) || {};
                let friendName, avatarUrl, isOnline;

                if (friendId === AI_ASSISTANT_ID) {
                    // Special handling for AI assistant
                    friendName = AI_ASSISTANT_USERNAME;
                    avatarUrl = AI_ASSISTANT_AVATAR;
                    isOnline = true;
                } else {
                    friendName = profile.user_name || "Unknown";
                    avatarUrl = profile.profile_image_url || DEFAULT_PROFILE_IMG;
                    isOnline = profile.is_online || false;
                }

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

    // Send message
    async function sendMessage(friendId, content) {
        if (!content || !content.trim()) return;
        try {
            // For all users (including AI assistant), store the message in the database
            const { error } = await client.from("messages").insert([{
                sender_id: currentUserId,
                receiver_id: friendId,
                content
            }]);
            if (error) {
                console.error("Error sending message:", error);
                showToast("Message failed to send. Please try again.", "error");
            } else {
                // Only update the last message for this specific friend
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
            // Special handling for AI assistant
            if (friendId === AI_ASSISTANT_ID) {
                // For AI assistant, we'll fetch messages from the database
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
            }

            // For regular users
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
        try {
            // URL pattern to match http/https URLs
            const urlRegex = /(https?:\/\/[^\s]+)/g;

            // Replace URLs with anchor tags
            return text.replace(urlRegex, function (url) {
                // Create the anchor tag
                return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">${url}</a>`;
            });
        } catch (error) {
            console.error("Error linkifying text:", error);
            return text;
        }
    }

    // Render chat messages
    function renderChatMessages(chatBox, msgs, friendAvatar) {
        try {
            if (!chatBox) return;
            chatBox.innerHTML = "";

            // Add line timing animation
            const animationDelay = 50; // milliseconds between each message

            msgs.forEach((msg, index) => {
                const isMe = msg.sender_id === currentUserId;
                const msgDiv = document.createElement("div");
                msgDiv.className = `message ${isMe ? "sent" : "received"}`;
                msgDiv.setAttribute("data-message-id", msg.id);

                // Add animation delay for each message
                msgDiv.style.animationDelay = `${index * animationDelay}ms`;

                const timeStr = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                }) : "";

                // Create message bubble with linkified content
                const msgBubble = document.createElement("div");
                msgBubble.className = "msg-bubble";

                const msgText = document.createElement("span");
                msgText.className = "msg-text";
                // Use innerHTML instead of textContent to render HTML links
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

            // Scroll to bottom after all messages are rendered
            setTimeout(() => {
                chatBox.scrollTop = chatBox.scrollHeight;
            }, msgs.length * animationDelay);
        } catch (error) {
            console.error("Error rendering chat messages:", error);
        }
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

            // Check if already friends
            const alreadyFriends = await isAlreadyFriend(receiverId);
            if (alreadyFriends) {
                hideLoading();
                showToast(`You are already friends with ${username}`, "info");
                showTopRightPopup(`You are already friends with ${username}`, "info");
                return;
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
        try {
            const chatMessage = chatBox.querySelector(`.message[data-message-id="${messageId}"] .seen-status`);
            if (chatMessage) {
                chatMessage.textContent = "✓✓";
            }
        } catch (error) {
            console.error("Error updating message seen status:", error);
        }
    }

    // Update last message
    function updateLastMessage(friendId, content, createdAt) {
        try {
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
        } catch (error) {
            console.error("Error updating last message:", error);
        }
    }

    // Submit friend request
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
        try {
            if (!profilePopup) return;
            showModal("profile-popup");

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

    // Show confirm popup
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

    // User modal function
    function showUserModal(userId, userName, userAvatar) {
        try {
            const modal = document.getElementById("user-modal");
            if (!modal) return;

            // Set initial values
            document.getElementById("user-modal-avatar").src = userAvatar || DEFAULT_PROFILE_IMG;
            document.getElementById("user-modal-username").textContent = userName || "Unknown User";
            document.getElementById("user-modal-bio").textContent = "Loading bio...";
            document.getElementById("user-modal-status").textContent = "Checking status...";
            document.getElementById("user-modal-status").className = "user-modal-status";

            // Special case for AI assistant
            if (userId === AI_ASSISTANT_ID) {
                document.getElementById("user-modal-bio").textContent = AI_ASSISTANT_BIO;
                document.getElementById("user-modal-status").textContent = "Online";
                document.getElementById("user-modal-status").className = "user-modal-status online";
            } else {
                // Fetch and update profile data for regular users
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
            }

            // Show modal
            showModal("user-modal");

            // Add event listeners
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

    // Get user profile data
    async function getUserProfile(userId) {
        // Special case for AI assistant
        if (userId === AI_ASSISTANT_ID) {
            return {
                user_name: AI_ASSISTANT_USERNAME,
                profile_image_url: AI_ASSISTANT_AVATAR,
                bio: AI_ASSISTANT_BIO,
                is_online: true
            };
        }

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
    async function getUserProfileForChat(userId) {
        // Special case for AI assistant
        if (userId === AI_ASSISTANT_ID) {
            return {
                user_name: AI_ASSISTANT_USERNAME,
                profile_image_url: AI_ASSISTANT_AVATAR
            };
        }

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
        try {
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

    // Generate chat link
    function generateChatLink(friendId) {
        try {
            const baseUrl = window.location.origin + window.location.pathname;
            return `${baseUrl}?chat=${friendId}`;
        } catch (error) {
            console.error("Error generating chat link:", error);
            return "#";
        }
    }

    // Open chat from URL
    function openChatFromUrl() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const friendId = urlParams.get('chat');

            if (friendId && currentUserId) {
                if (friendId === AI_ASSISTANT_ID) {
                    openSpecificChat(friendId, {
                        user_name: AI_ASSISTANT_USERNAME,
                        profile_image_url: AI_ASSISTANT_AVATAR
                    });
                } else {
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
        } catch (error) {
            console.error("Error opening chat from URL:", error);
        }
    }

    // Global function to open chat with user
    window.openChatWithUser = async function (userId) {
        try {
            if (!currentUserId) return;

            if (userId === AI_ASSISTANT_ID) {
                openSpecificChat(userId, {
                    user_name: AI_ASSISTANT_USERNAME,
                    profile_image_url: AI_ASSISTANT_AVATAR
                });
                return;
            }

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
            console.error("Error opening chat with user:", err);
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

            // Use a Set to deduplicate friend IDs
            const friendIds = [...new Set(friends.map(f =>
                f.user1_id === currentUserId ? f.user2_id : f.user1_id
            ))];

            // Add AI assistant to friends list if not already there
            if (!friendIds.includes(AI_ASSISTANT_ID)) {
                friendIds.push(AI_ASSISTANT_ID);
            }

            // Fetch regular user profiles
            const { data: profiles, error: profilesError } = await client
                .from("user_profiles")
                .select("user_id, user_name, profile_image_url, is_online")
                .in("user_id", friendIds.filter(id => id !== AI_ASSISTANT_ID));

            if (profilesError) throw profilesError;

            const recentChatsPromises = friendIds.map(async (friendId) => {
                let profile, user_name, avatar_url, is_online;

                if (friendId === AI_ASSISTANT_ID) {
                    // Special handling for AI assistant
                    user_name = AI_ASSISTANT_USERNAME;
                    avatar_url = AI_ASSISTANT_AVATAR;
                    is_online = true;
                } else {
                    profile = profiles?.find(p => p.user_id === friendId);
                    user_name = profile?.user_name || "Unknown";
                    avatar_url = profile?.profile_image_url || DEFAULT_PROFILE_IMG;
                    is_online = profile?.is_online || false;
                }

                const { data: lastMessage } = await client
                    .from("messages")
                    .select("content, created_at")
                    .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
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

    // Render recent chats
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

    // Add friend button
    document.querySelector(".addFriends")?.addEventListener("click", () => {
        try {
            showModal("friendModal");
        } catch (error) {
            console.error("Error handling add friends click:", error);
        }
    });

    // Close friend modal
    document.querySelector("#friendModal .close")?.addEventListener("click", () => {
        try {
            hideModal("friendModal");
        } catch (error) {
            console.error("Error handling close friend modal click:", error);
        }
    });

    // Close friend requests popup
    document.querySelector("#friend-requests-popup .popup-close")?.addEventListener("click", () => {
        try {
            document.getElementById("friend-requests-popup").classList.remove("show");
        } catch (error) {
            console.error("Error handling close friend requests popup click:", error);
        }
    });

    // Initialize app
    try {
        const me = await getCurrentUser();
        if (me) {
            await initializeDatabaseSchema();
            await fetchFriends();
            await fetchFriendRequests();

            // Set up real-time subscriptions
            const setupRealtimeSubscriptions = async () => {
                try {
                    // Global messages subscription
                    const globalMessagesChannel = client.channel('global-messages');

                    globalMessagesChannel
                        .on('postgres_changes', {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'messages',
                            filter: `receiver_id=eq.${currentUserId}`
                        }, async (payload) => {
                            const newMsg = payload.new;
                            if (!newMsg || !currentUserId) return;

                            const senderId = newMsg.sender_id;

                            if (currentOpenChatId !== senderId) {
                                updateUnseenCountForFriend(senderId);
                                updateLastMessage(senderId, newMsg.content, newMsg.created_at);

                                try {
                                    let senderName, senderAvatar;

                                    if (senderId === AI_ASSISTANT_ID) {
                                        senderName = AI_ASSISTANT_USERNAME;
                                        senderAvatar = AI_ASSISTANT_AVATAR;
                                    } else {
                                        const { data: senderProfile } = await client
                                            .from("user_profiles")
                                            .select("user_name, profile_image_url")
                                            .eq("user_id", senderId)
                                            .maybeSingle();

                                        senderName = senderProfile?.user_name || "New Message";
                                        senderAvatar = senderProfile?.profile_image_url || DEFAULT_PROFILE_IMG;
                                    }

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
                            filter: `receiver_id=eq.${currentUserId}`
                        }, (payload) => {
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
                        })
                        .subscribe((status, err) => {
                            if (status === 'SUBSCRIBED') {
                                console.log('Successfully subscribed to global messages');
                            } else if (status === 'CHANNEL_ERROR') {
                                console.error('Error subscribing to global messages:', err);
                            }
                        });

                    // Friend requests subscription
                    const friendRequestsChannel = client.channel(`friend-requests-${currentUserId}`);

                    friendRequestsChannel
                        .on('postgres_changes', {
                            event: '*',
                            schema: 'public',
                            table: 'requests',
                            filter: `receiver_id=eq.${currentUserId}`
                        }, async (payload) => {
                            console.log("Friend request event received:", payload);
                            const { eventType, new: newRecord, old: oldRecord } = payload;

                            if (eventType === 'INSERT' && newRecord.status === "pending") {
                                console.log("New friend request received:", newRecord);

                                // Get sender details for notification
                                try {
                                    const { data: senderProfile } = await client
                                        .from("user_profiles")
                                        .select("user_name, profile_image_url")
                                        .eq("user_id", newRecord.sender_id)
                                        .maybeSingle();

                                    const senderName = senderProfile?.user_name || "Someone";
                                    const senderAvatar = senderProfile?.profile_image_url || DEFAULT_PROFILE_IMG;

                                    showTopRightPopup(`${senderName} sent you a friend request`, "info", senderAvatar);

                                    if (Notification.permission === "granted") {
                                        const notif = new Notification("Friend Request 👥", {
                                            body: `${senderName} sent you a request`,
                                            icon: senderAvatar,
                                            data: { type: 'friend_request', senderId: newRecord.sender_id }
                                        });

                                        notif.addEventListener('click', () => {
                                            window.focus();
                                            openSpecificChat(newRecord.sender_id);
                                            notif.close();
                                        });
                                    }
                                } catch (err) {
                                    console.error("Error fetching sender profile for notification:", err);
                                }

                                // Refresh friend requests list
                                fetchFriendRequests();
                            } else if (eventType === 'UPDATE') {
                                console.log("Friend request updated:", newRecord);

                                if (newRecord.status === "accepted") {
                                    // If this user accepted a request
                                    if (newRecord.sender_id === currentUserId) {
                                        showTopRightPopup("Your friend request was accepted!", "success");
                                    } else {
                                        // If this user received an accepted request
                                        showTopRightPopup("You accepted a friend request!", "success");
                                    }
                                    // Refresh friends list
                                    fetchFriends();
                                } else if (newRecord.status === "rejected") {
                                    if (newRecord.sender_id === currentUserId) {
                                        showTopRightPopup("Your friend request was rejected", "warning");
                                    } else {
                                        showTopRightPopup("You rejected a friend request", "info");
                                    }
                                }

                                // Refresh friend requests list
                                fetchFriendRequests();
                            } else if (eventType === 'DELETE') {
                                console.log("Friend request deleted:", oldRecord);
                                // Refresh friend requests list
                                fetchFriendRequests();
                            }
                        })
                        .subscribe((status, err) => {
                            if (status === 'SUBSCRIBED') {
                                console.log('Successfully subscribed to friend requests');
                                fetchFriendRequests();
                            } else if (status === 'CHANNEL_ERROR') {
                                console.error('Error subscribing to friend requests:', err);
                            }
                        });

                    // Friends updates subscription
                    const friendsUpdatesChannel = client.channel('friends-updates');

                    friendsUpdatesChannel
                        .on('postgres_changes', {
                            event: '*',
                            schema: 'public',
                            table: 'friends'
                        }, (payload) => {
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
                        })
                        .subscribe((status, err) => {
                            if (status === 'SUBSCRIBED') {
                                console.log('Successfully subscribed to friends updates');
                            } else if (status === 'CHANNEL_ERROR') {
                                console.error('Error subscribing to friends updates:', err);
                            }
                        });

                    // User profiles updates subscription
                    const userProfilesUpdatesChannel = client.channel('user-profiles-updates');

                    userProfilesUpdatesChannel
                        .on('postgres_changes', {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'user_profiles'
                        }, (payload) => {
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
                        })
                        .subscribe((status, err) => {
                            if (status === 'SUBSCRIBED') {
                                console.log('Successfully subscribed to user profiles updates');
                            } else if (status === 'CHANNEL_ERROR') {
                                console.error('Error subscribing to user profiles updates:', err);
                            }
                        });

                    console.log("All real-time subscriptions set up successfully");
                } catch (error) {
                    console.error("Error setting up real-time subscriptions:", error);
                    setTimeout(setupRealtimeSubscriptions, 5000);
                }
            };

            await setupRealtimeSubscriptions();
            await fetchRecentChats();

            if (Object.keys(notificationData).length > 0) {
                handleNotificationRedirect();
            }

            openChatFromUrl();
        }
    } catch (error) {
        console.error("Error initializing app:", error);
        showToast("Failed to initialize application. Please refresh the page.", "error");
    }

    // Open chat function
    async function openChat(friendId, friendName, friendAvatar, fromNotification = false) {
        try {
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

            // Set typing indicator based on friend type
            if (friendId === AI_ASSISTANT_ID) {
                typingIndicator.textContent = "Online";
            } else {
                const { data: profile } = await client
                    .from("user_profiles")
                    .select("is_online")
                    .eq("user_id", friendId)
                    .maybeSingle();

                typingIndicator.textContent = profile?.is_online ? "Online" : "Offline";
            }

            const oldMessages = await fetchMessages(friendId);
            renderChatMessages(chatBox, oldMessages, friendAvatar);

            // Set up real-time subscriptions for this chat
            const setupChatSubscriptions = async () => {
                try {
                    // Chat messages subscription
                    const chatChannelName = `chat:${[currentUserId, friendId].sort().join(":")}`;
                    const chatChannel = client.channel(chatChannelName);

                    chatChannel
                        .on('postgres_changes', {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'messages',
                            filter: `sender_id=eq.${currentUserId}`
                        }, (payload) => {
                            const newMsg = payload.new;
                            if (processingMessageIds.has(newMsg.id)) {
                                return;
                            }
                            processingMessageIds.add(newMsg.id);

                            // Add message to chat
                            oldMessages.push(newMsg);
                            renderChatMessages(chatBox, oldMessages, friendAvatar);
                            updateLastMessage(friendId, newMsg.content, newMsg.created_at);

                            setTimeout(() => {
                                processingMessageIds.delete(newMsg.id);
                            }, 1000);
                        })
                        .on('postgres_changes', {
                            event: 'INSERT',
                            schema: 'public',
                            table: 'messages',
                            filter: `sender_id=eq.${friendId}`
                        }, async (payload) => {
                            const newMsg = payload.new;
                            if (processingMessageIds.has(newMsg.id)) {
                                return;
                            }
                            processingMessageIds.add(newMsg.id);

                            // Add message to chat
                            oldMessages.push(newMsg);
                            renderChatMessages(chatBox, oldMessages, friendAvatar);
                            updateLastMessage(friendId, newMsg.content, newMsg.created_at);

                            if (newMsg.receiver_id === currentUserId) {
                                // Mark as seen
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
                            }

                            setTimeout(() => {
                                processingMessageIds.delete(newMsg.id);
                            }, 1000);
                        })
                        .on('postgres_changes', {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'messages',
                            filter: `sender_id=eq.${currentUserId}`
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

                                if (currentOpenChatId !== updated.sender_id) {
                                    updateUnseenCountForFriend(updated.sender_id);
                                }
                                return;
                            }

                            const idx = oldMessages.findIndex(m => m.id === updated.id);
                            if (idx !== -1) {
                                oldMessages[idx] = { ...oldMessages[idx], ...updated };
                            }

                            if (updated.receiver_id === currentUserId && updated.seen === true) {
                                unseenCounts[updated.sender_id] = 0;
                                updateUnseenBadge(updated.sender_id, 0);
                            }
                        })
                        .subscribe((status, err) => {
                            if (status === 'SUBSCRIBED') {
                                console.log(`Successfully subscribed to ${chatChannelName}`);
                            } else if (status === 'CHANNEL_ERROR') {
                                console.error(`Error subscribing to ${chatChannelName}:`, err);
                            }
                        });

                    // Typing indicator subscription
                    const typingChannelName = `typing:${[currentUserId, friendId].sort().join(":")}`;
                    const typingChannel = client.channel(typingChannelName);

                    typingChannel
                        .on('broadcast', { event: 'typing' }, (payload) => {
                            if (payload.userId === friendId) {
                                typingIndicator.textContent = `${payload.userName || "Friend"} is typing...`;
                                setTimeout(async () => {
                                    try {
                                        if (friendId === AI_ASSISTANT_ID) {
                                            typingIndicator.textContent = "Online";
                                        } else {
                                            const { data: profile } = await client
                                                .from("user_profiles")
                                                .select("is_online")
                                                .eq("user_id", friendId)
                                                .maybeSingle();
                                            typingIndicator.textContent = profile?.is_online ? "Online" : "Offline";
                                        }
                                    } catch (err) {
                                        typingIndicator.textContent = "Offline";
                                    }
                                }, 1500);
                            }
                        })
                        .subscribe((status, err) => {
                            if (status === 'SUBSCRIBED') {
                                console.log(`Successfully subscribed to ${typingChannelName}`);
                            } else if (status === 'CHANNEL_ERROR') {
                                console.error(`Error subscribing to ${typingChannelName}:`, err);
                            }
                        });

                    // User status subscription
                    const statusChannelName = `user-status-${friendId}`;
                    const statusChannel = client.channel(statusChannelName);

                    statusChannel
                        .on('postgres_changes', {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'user_profiles',
                            filter: `user_id=eq.${friendId}`
                        }, (payload) => {
                            const onlineTextElt = typingIndicator;
                            if (onlineTextElt) onlineTextElt.textContent = payload.new?.is_online ? "Online" : "Offline";
                        })
                        .subscribe((status, err) => {
                            if (status === 'SUBSCRIBED') {
                                console.log(`Successfully subscribed to ${statusChannelName}`);
                            } else if (status === 'CHANNEL_ERROR') {
                                console.error(`Error subscribing to ${statusChannelName}:`, err);
                            }
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
            unseenCounts[friendId] = 0;

            inputSafe.addEventListener("input", () => {
                sendBtnSafe.disabled = !inputSafe.value.trim();
                try {
                    if (typingChannel) {
                        typingChannel.send({
                            type: "broadcast",
                            event: "typing",
                            payload: {
                                userId: currentUserId,
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

                // Send the user's message
                await sendMessage(friendId, content);
                inputSafe.value = "";
                sendBtnSafe.disabled = true;

                // Check if this is a message to the AI assistant
                if (friendId === AI_ASSISTANT_ID) {
                    // Handle AI response
                    handleAIResponse(content, friendId);
                }
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

    // Update friend UI in real-time
    function updateFriendUI(friendId) {
        try {
            let friendData;

            if (friendId === AI_ASSISTANT_ID) {
                friendData = {
                    user_name: AI_ASSISTANT_USERNAME,
                    profile_image_url: AI_ASSISTANT_AVATAR,
                    is_online: true
                };
            } else {
                friendData = allFriends.get(friendId);
            }

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

    // Handle notification redirect
    function handleNotificationRedirect() {
        try {
            if (!currentOpenChatId && notificationData.type === 'message' && notificationData.senderId) {
                if (notificationData.senderId === AI_ASSISTANT_ID) {
                    openChat(notificationData.senderId, AI_ASSISTANT_USERNAME, AI_ASSISTANT_AVATAR, true);
                } else {
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
            }

            notificationData = {};
        } catch (error) {
            console.error("Error handling notification redirect:", error);
        }
    }

    // Add this function to ensure AI assistant exists
    async function ensureAIAssistantExists() {
        try {
            // First, check if AI assistant exists in private_users
            const { data: existingUser, error: userError } = await client
                .from("private_users")
                .select("id")
                .eq("id", AI_ASSISTANT_ID)
                .maybeSingle();

            if (userError) {
                console.error("Error checking private_users:", userError);
                return false;
            }

            // If AI assistant doesn't exist in private_users, create it
            if (!existingUser) {
                const { error: createUserError } = await client
                    .from("private_users")
                    .insert([{ id: AI_ASSISTANT_ID }]);

                if (createUserError) {
                    console.error("Error creating AI assistant in private_users:", createUserError);
                    return false;
                }
                console.log("AI assistant created in private_users");
            }

            // Now check and create/update the profile in user_profiles
            const { data: existingProfile, error: fetchError } = await client
                .from("user_profiles")
                .select("user_id")
                .eq("user_id", AI_ASSISTANT_ID)
                .maybeSingle();

            if (fetchError) {
                console.error("Error checking AI assistant profile:", fetchError);
                return false;
            }

            if (!existingProfile) {
                const { error: insertError } = await client
                    .from("user_profiles")
                    .insert({
                        user_id: AI_ASSISTANT_ID,
                        user_name: AI_ASSISTANT_USERNAME,
                        profile_image_url: AI_ASSISTANT_AVATAR,
                        bio: AI_ASSISTANT_BIO,
                        is_online: true
                    });

                if (insertError) {
                    console.error("Error creating AI assistant profile:", insertError);
                    return false;
                }
                console.log("AI assistant profile created successfully");
            } else {
                // Update the existing profile
                const { error: updateError } = await client
                    .from("user_profiles")
                    .update({
                        user_name: AI_ASSISTANT_USERNAME,
                        profile_image_url: AI_ASSISTANT_AVATAR,
                        bio: AI_ASSISTANT_BIO,
                        is_online: true
                    })
                    .eq("user_id", AI_ASSISTANT_ID);

                if (updateError) {
                    console.error("Error updating AI assistant profile:", updateError);
                    return false;
                }
                console.log("AI assistant profile updated successfully");
            }

            return true;
        } catch (err) {
            console.error("Error ensuring AI assistant exists:", err);
            return false;
        }
    }

    // Add this function to add AI assistant as a friend
    async function addAIAssistantAsFriend() {
        if (!currentUserId) return;

        try {
            // First ensure AI assistant exists in user_profiles
            const aiExists = await ensureAIAssistantExists();
            if (!aiExists) {
                console.error("Failed to ensure AI assistant exists");
                return;
            }

            // Check if already friends
            const alreadyFriends = await isAlreadyFriend(AI_ASSISTANT_ID);
            if (alreadyFriends) {
                console.log("AI assistant is already a friend");
                return;
            }

            // Add the AI assistant as a friend
            const { error } = await client
                .from("friends")
                .insert([{
                    user1_id: currentUserId,
                    user2_id: AI_ASSISTANT_ID
                }]);

            if (error) {
                console.error("Error adding AI assistant as friend:", error);
            } else {
                console.log("AI assistant added as friend");
                // Refresh the friends list
                fetchFriends();

                // Send a welcome message from the AI assistant
                setTimeout(async () => {
                    try {
                        await insertMessage(
                            AI_ASSISTANT_ID,
                            currentUserId,
                            "Hello! I'm your AI assistant. I'm here to help you with anything you need. How can I assist you today?"
                        );
                    } catch (err) {
                        console.error("Error sending welcome message:", err);
                    }
                }, 1000);
            }
        } catch (err) {
            console.error("Error in addAIAssistantAsFriend:", err);
        }
    }

    // Add this function to insert messages (used for AI responses)
    async function insertMessage(senderId, receiverId, content) {
        try {
            // Special handling for AI assistant messages
            if (senderId === AI_ASSISTANT_ID) {
                // First ensure AI assistant exists in user_profiles
                const aiExists = await ensureAIAssistantExists();
                if (!aiExists) {
                    console.error("Failed to ensure AI assistant exists");
                    return false;
                }

                const { error } = await client.from("messages").insert([{
                    sender_id: senderId,
                    receiver_id: receiverId,
                    content
                }]);

                if (error) {
                    console.error("Error inserting AI message:", error);
                    return false;
                }
                return true;
            }

            // Regular user messages
            const { error } = await client.from("messages").insert([{
                sender_id: senderId,
                receiver_id: receiverId,
                content
            }]);

            if (error) {
                console.error("Error inserting message:", error);
                return false;
            }
            return true;
        } catch (err) {
            console.error("insertMessage error:", err);
            return false;
        }
    }

    // Add this function to call OpenRouter API
    async function callOpenRouterAPI(message) {
        try {
            // Verify API key is present
            if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === "sk-or-v1-...") {
                throw new Error("Invalid OpenRouter API key");
            }

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": window.location.origin,
                    "X-Title": "Chat App"
                },
                body: JSON.stringify({
                    model: "openai/gpt-3.5-turbo",
                    messages: [
                        { role: "system", content: "You are a helpful AI assistant in a chat app. Keep your responses friendly, concise, and helpful." },
                        { role: "user", content: message }
                    ]
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("OpenRouter API error:", errorData);
                throw new Error(`OpenRouter API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error("Error calling OpenRouter API:", error);
            return "I'm sorry, I'm having trouble responding right now. Please try again later.";
        }
    }

    // Add this function to handle AI responses
    async function handleAIResponse(userMessage, friendId) {
        try {
            // Check if the friend is the AI assistant
            if (friendId === AI_ASSISTANT_ID) {
                // Show typing indicator
                const typingIndicator = document.querySelector("#typing-indicator");
                if (typingIndicator) {
                    typingIndicator.textContent = "AI is typing...";
                }

                // Call OpenRouter API
                const aiResponse = await callOpenRouterAPI(userMessage);

                // Insert AI response as a message
                const success = await insertMessage(AI_ASSISTANT_ID, currentUserId, aiResponse);

                if (success) {
                    // Reset typing indicator
                    if (typingIndicator) {
                        typingIndicator.textContent = "Online";
                    }
                } else {
                    console.error("Failed to insert AI response");
                    showToast("Failed to send AI response", "error");
                }
            }
        } catch (error) {
            console.error("Error handling AI response:", error);
            showToast("Error processing AI response", "error");
        }
    }
});