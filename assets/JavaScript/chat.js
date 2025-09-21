import { client } from "../../supabase.js";

document.addEventListener("DOMContentLoaded", async () => {
    // ---------------- Utility UI helpers ----------------
    function showPopup(message, type = "info") {
        const popup = document.getElementById("popup");
        const messageEl = document.getElementById("popup-message");
        const closeBtn = document.getElementById("popup-close");

        if (!popup || !messageEl) return;

        messageEl.textContent = message;
        popup.classList.remove("hidden", "error", "success", "info");
        popup.classList.add("show", String(type));

        if (closeBtn) {
            const newClose = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newClose, closeBtn);
            newClose.addEventListener('click', () => {
                popup.classList.add("hidden");
                popup.classList.remove('show');
            });
        }
    }

    function showLoading(message = 'Loading...') {
        const overlay = document.getElementById("loading-overlay");
        const msgEl = document.getElementById("loading-message");

        if (!overlay) {
            console.warn("⚠️ Missing #loading-overlay element");
            return;
        }

        if (msgEl) msgEl.textContent = message;
        overlay.classList.remove('hidden');
        overlay.style.display = "flex";
    }

    function hideLoading() {
        const overlay = document.getElementById("loading-overlay");
        if (!overlay) return;
        overlay.classList.add('hidden');
        overlay.style.display = "none";
    }

    // ---------------- Notifications ----------------
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
    await requestNotificationPermission(); // Request permission early

    // ---------------- Current user avatar & identity ----------------
    const DEFAULT_PROFILE_IMG = "./assets/icon/download.jpeg";

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

            let avatarUrl = DEFAULT_PROFILE_IMG;
            if (!profileError && profile?.profile_image_url) {
                avatarUrl = profile.profile_image_url;
            }
            profileImage.src = avatarUrl;
        } catch (err) {
            console.error("fetchCurrentUserAvatar error:", err);
        }
    }
    fetchCurrentUserAvatar();

    // ------------- state -------------
    let currentUserId = null;
    let friendRequests = [];
    let statusChannelRef = null;
    let unseenCounts = {}; // map friendId -> count
    let currentOpenChatId = null; // Track currently open chat
    let notificationData = {}; // Store notification data for redirect
    let deletionTimeouts = {}; // Track deletion timeouts for messages
    let processingMessageIds = new Set(); // Track messages being processed to avoid double handling

    // ------------- Get current user -------------
    async function getCurrentUser() {
        try {
            const { data: { user }, error } = await client.auth.getUser();
            if (error || !user) {
                showPopup("User not logged in", "error");
                window.location.href = 'signup.html';
                return null;
            }
            currentUserId = user.id;
            console.log("Current user ID:", currentUserId);
            await setUserOnlineStatus(true);
            return user;
        } catch (err) {
            console.error("getCurrentUser error:", err);
            showPopup("Failed to get current user.", "error");
            return null;
        }
    }

    // ------------- Friend Requests (accept/reject) -------------
    async function acceptRequest(requestId, senderId) {
        try {
            const { error: updateError } = await client
                .from("requests")
                .update({ status: "accepted" })
                .eq("id", requestId);

            if (updateError) {
                console.error("Error updating request:", updateError.message || updateError);
                return showPopup("Failed to accept request.", "error");
            }

            const { error: insertError } = await client
                .from("friends")
                .insert([{ user1_id: currentUserId, user2_id: senderId }]);

            if (insertError) {
                console.error("Error inserting into friends:", insertError.message || insertError);
                return showPopup("Failed to add friend.", "error");
            }

            showPopup("Friend request accepted!", "success");
            fetchFriendRequests(); // Refresh requests
            fetchFriends(); // Refresh friends list
        } catch (err) {
            console.error("Unexpected error:", err);
            showPopup("An error occurred while accepting request.", "error");
        }
    }

    async function rejectRequest(requestId) {
        try {
            const { error } = await client
                .from("requests")
                .update({ status: "rejected" })
                .eq("id", requestId);

            if (error) {
                console.error("Error rejecting request:", error.message || error);
                return showPopup("Failed to reject request.", "error");
            }

            showPopup("Friend request rejected!", "info");
            fetchFriendRequests(); // Refresh requests
        } catch (err) {
            console.error("Unexpected error rejecting request:", err);
            showPopup("Failed to reject friend request.", "error");
        }
    }

    // ------------- Online status -------------
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
        // Clear all deletion timeouts when page unloads
        Object.values(deletionTimeouts).forEach(timeoutId => clearTimeout(timeoutId));
    });

    // ------------- Friend Request popup rendering -------------
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
                        <button class="accept-btn">Accept</button>
                        <button class="reject-btn">Reject</button>
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

    // toggle message popup
    document.getElementById("message")?.addEventListener("click", () => {
        const popup = document.getElementById("message-popup");
        if (popup) popup.style.display = popup.style.display === "block" ? "none" : "block";
    });

    document.addEventListener("click", (e) => {
        const messageIcon = document.getElementById("message");
        const messagePopup = document.getElementById("message-popup");
        if (messageIcon && messagePopup && !messageIcon.contains(e.target) && !messagePopup.contains(e.target)) {
            messagePopup.style.display = "none";
        }
    });

    // ------------- Fetch friend requests -------------
    async function fetchFriendRequests() {
        if (!currentUserId) return;

        showLoading("Fetching friend requests...");

        try {
            const { data: requests, error } = await client
                .from("requests")
                .select("id, sender_id, status")
                .eq("receiver_id", currentUserId)
                .eq("status", "pending");

            if (error) throw error;

            friendRequests = [];
            if (requests && requests.length) {
                const senderIds = Array.from(new Set(requests.map(r => r.sender_id)));
                const { data: profilesMap } = await client
                    .from("user_profiles")
                    .select("user_id, user_name, profile_image_url")
                    .in("user_id", senderIds);

                const profileById = {};
                (profilesMap || []).forEach(p => { profileById[p.user_id] = p; });

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

                    // Send notification for new friend request
                    try {
                        if (Notification.permission === "granted") {
                            const notif = new Notification("Friend Request 👥", {
                                body: `${senderName} sent you a request`,
                                data: { type: 'friend_request', senderId: req.sender_id }
                            });

                            notif.addEventListener('click', () => {
                                window.focus();
                                notif.close();
                            });
                        }
                    } catch (err) {
                        console.warn("Error sending friend request notification:", err);
                    }
                }
            }
            renderFriendRequests();
        } catch (err) {
            console.error("Error fetching requests:", err);
            showPopup("Failed to fetch friend requests.", "error");
        } finally {
            hideLoading();
        }
    }

    // ------------- Unseen badge update -------------
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

    // ------------- Update unseen count for a friend from database -------------
    async function updateUnseenCountForFriend(friendId) {
        try {
            const { count, error } = await client
                .from("messages")
                .select("*", { count: "exact", head: true })
                .eq("sender_id", friendId)
                .eq("receiver_id", currentUserId)
                .eq("seen", false)
                .is('deleted_at', null); // Exclude deleted messages

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

    // ------------- Schedule message deletion -------------
    function scheduleMessageDeletion(messageId, friendId, delay = 30000) {
        // Clear any existing timeout for this message
        if (deletionTimeouts[messageId]) {
            clearTimeout(deletionTimeouts[messageId]);
        }

        // Set new timeout
        deletionTimeouts[messageId] = setTimeout(async () => {
            try {
                // Soft delete the message
                const { error } = await client
                    .from("messages")
                    .update({ deleted_at: new Date().toISOString() })
                    .eq("id", messageId);

                if (error) {
                    console.error("Error deleting message:", error);
                } else {
                    console.log(`Message ${messageId} deleted after timeout`);
                    // Update the last message in the chat list
                    updateLastMessageInChatList(friendId);
                }
            } catch (err) {
                console.error("Error in scheduled message deletion:", err);
            } finally {
                delete deletionTimeouts[messageId];
            }
        }, delay); // Default 30 seconds
    }

    // ------------- Delete seen messages for a chat -------------
    async function deleteSeenMessagesForChat(friendId) {
        if (!currentUserId) return;

        try {
            // Get all seen messages for this chat that haven't been deleted yet
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

            // Clear any pending timeouts for these messages
            seenMessages.forEach(msg => {
                if (deletionTimeouts[msg.id]) {
                    clearTimeout(deletionTimeouts[msg.id]);
                    delete deletionTimeouts[msg.id];
                }
            });

            // Soft delete all seen messages
            const messageIds = seenMessages.map(msg => msg.id);
            const { error: updateError } = await client
                .from("messages")
                .update({ deleted_at: new Date().toISOString() })
                .in('id', messageIds);

            if (updateError) {
                console.error("Error deleting seen messages for chat:", updateError);
            } else {
                console.log(`Deleted ${messageIds.length} seen messages for chat with ${friendId}`);
                // Update the last message in the chat list
                updateLastMessageInChatList(friendId);
            }
        } catch (err) {
            console.error("deleteSeenMessagesForChat error:", err);
        }
    }

    // ------------- Update last message in chat list -------------
    async function updateLastMessageInChatList(friendId) {
        try {
            // Get the latest non-deleted message for this chat
            const { data: lastMsgData } = await client
                .from("messages")
                .select("content, created_at, sender_id, receiver_id")
                .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
                .is('deleted_at', null) // Exclude deleted messages
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            const lastMessageText = lastMsgData?.content || "No messages yet";
            const lastMessageTime = lastMsgData ? new Date(lastMsgData.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

            // Update the chat list item
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

    // ------------- Fetch friends / chat list -------------
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

            const profilesById = {};
            (profiles || []).forEach(p => { profilesById[p.user_id] = p; });

            const friendDataPromises = friendIds.map(async (friendId) => {
                const profile = profilesById[friendId] || {};
                const friendName = profile.user_name || "Unknown";
                const avatarUrl = profile.profile_image_url || DEFAULT_PROFILE_IMG;
                const isOnline = profile.is_online || false;

                const { data: lastMsgData } = await client
                    .from("messages")
                    .select("content, created_at, sender_id, receiver_id")
                    .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
                    .is('deleted_at', null) // Exclude deleted messages
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
                        .is('deleted_at', null); // Exclude deleted messages

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
                    openChat(friendId, friendName, avatarUrl);
                    const chatArea = document.querySelector('.chat-area');
                    if (window.innerWidth <= 768) {
                        document.querySelector('#message')?.classList.add("hidden");
                        if (chatArea) chatArea.style.display = 'flex';
                    }
                });

                chatList.appendChild(li);
                unseenCounts[friendId] = unseenCount || 0;
            });

            enableFriendSearch();
        } catch (err) {
            console.error("Error fetching friends:", err);
            showPopup("Failed to load friends.", "error");
        } finally {
            hideLoading();
        }
    }

    // ------------- Friend search (debounced) -------------
    function enableFriendSearch() {
        const searchInput = document.getElementById("search-friends");
        const chatList = document.querySelector(".chat-list");
        if (!searchInput || !chatList) return;

        if (searchInput.dataset.hasListener) return;
        searchInput.dataset.hasListener = "true";

        let timer = null;
        searchInput.addEventListener("input", () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const query = searchInput.value.toLowerCase().trim();
                const chats = chatList.querySelectorAll(".chat");
                chats.forEach(chat => {
                    const nameEl = chat.querySelector("h4");
                    const name = nameEl ? nameEl.textContent.toLowerCase() : "";
                    chat.style.display = name.includes(query) ? "flex" : "none";
                });
            }, 120);
        });
    }

    // ------------- Send message -------------
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
                showPopup("Message failed to send. Please try again.", "error");
            } else {
                updateLastMessage(friendId, content, new Date().toISOString());
            }
        } catch (err) {
            console.error("sendMessage error:", err);
            showPopup("Message failed to send. Please try again.", "error");
        }
    }

    // ------------- Mark messages as seen and schedule deletion -------------
    async function markMessagesAsSeen(friendId, chatBox, oldMessages, friendAvatar) {
        if (!currentUserId) return;
        try {
            const { data: unseenMessages, error: fetchError } = await client
                .from("messages")
                .select("*")
                .eq("receiver_id", currentUserId)
                .eq("sender_id", friendId)
                .eq("seen", false)
                .is('deleted_at', null); // Exclude already deleted messages

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

                // Update the UI to show messages as seen
                unseenMessages.forEach(msg => {
                    const idx = oldMessages.findIndex(m => m.id === msg.id);
                    if (idx !== -1) oldMessages[idx].seen = true;

                    // Schedule deletion for this message after 30 seconds
                    scheduleMessageDeletion(msg.id, friendId);
                });
                renderChatMessages(chatBox, oldMessages, friendAvatar);
            }
        } catch (err) {
            console.error("markMessagesAsSeen error:", err);
        }
    }

    // ------------- Fetch messages (excluding deleted ones) -------------
    async function fetchMessages(friendId) {
        try {
            const { data, error } = await client
                .from("messages")
                .select("*")
                .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
                .is('deleted_at', null) // Exclude deleted messages
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
                    <span class="msg-text">${msg.content}</span>
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

    // ------------- Send friend request -------------
    async function sendFriendRequest(username) {
        if (!username) return showPopup("Enter a username.", "error");
        try {
            const { data: user, error: userError } = await client
                .from("user_profiles")
                .select("user_id")
                .eq("user_name", username)
                .maybeSingle();

            if (userError || !user) {
                return showPopup("User not found.", "error");
            }

            const receiverId = user.user_id;
            if (receiverId === currentUserId) {
                return showPopup("You cannot send a request to yourself.", "warning");
            }

            const { data: existing, error: existingError } = await client
                .from("requests")
                .select("id, status")
                .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${currentUserId})`)
                .maybeSingle();

            if (existingError) {
                console.error("Error checking existing request:", existingError);
                return showPopup("Something went wrong. Try again.", "error");
            }

            if (existing) {
                if (existing.status === "pending") return showPopup("You have already sent a request.", "info");
                if (existing.status === "accepted") return showPopup("You are already friends.", "info");
                if (existing.status === "rejected") return showPopup("This user rejected your request before.", "warning");
            }

            const { error: requestError } = await client
                .from("requests")
                .insert([{ sender_id: currentUserId, receiver_id: receiverId, status: "pending" }]);

            if (requestError) {
                console.error("Error sending friend request:", requestError);
                return showPopup("Failed to send friend request.", "error");
            }

            showPopup("Friend request sent successfully!", "success");
        } catch (err) {
            console.error("Unexpected error in sendFriendRequest:", err);
            showPopup("Unexpected error. Please try again.", "error");
        }
    }

    // ------------- Realtime: subscribeToMessages -------------
    function updateMessageSeenStatus(chatBox, messageId) {
        const chatMessage = chatBox.querySelector(`.message[data-message-id="${messageId}"] .seen-status`);
        if (chatMessage) {
            chatMessage.textContent = "✓✓";
        }
    }

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
                    .select("user_name")
                    .eq("user_id", userId)
                    .maybeSingle();

                if (error) throw error;
                const username = data?.user_name || "Someone";
                userCache[userId] = username;
                return username;
            } catch (err) {
                console.error("Error fetching username:", err);
                return "Someone";
            }
        }

        const channelTopic = `chat:${[currentUserId, friendId].sort().join(":")}`;
        const msgChannel = client.channel(channelTopic);

        // Listen for new messages
        msgChannel.on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "messages" },
            async payload => {
                const newMsg = payload.new;
                const isRelevant =
                    (newMsg.sender_id === currentUserId && newMsg.receiver_id === friendId) ||
                    (newMsg.sender_id === friendId && newMsg.receiver_id === currentUserId);
                if (!isRelevant) return;

                // Add to processing set to prevent double handling
                if (processingMessageIds.has(newMsg.id)) {
                    return;
                }
                processingMessageIds.add(newMsg.id);

                upsertMessageAndRender(oldMessages, newMsg);

                // Update the last message in the chat list
                updateLastMessage(friendId, newMsg.content, newMsg.created_at);

                // Only handle unseen count if this is a received message
                if (newMsg.receiver_id === currentUserId) {
                    // If this chat is currently open, mark as seen immediately
                    if (currentOpenChatId === friendId) {
                        try {
                            await client
                                .from("messages")
                                .update({ seen: true })
                                .eq("id", newMsg.id);

                            // Update local message state
                            const idx = oldMessages.findIndex(m => m.id === newMsg.id);
                            if (idx !== -1) {
                                oldMessages[idx].seen = true;
                            }
                            renderChatMessages(chatBox, oldMessages, friendAvatar);

                            // Update unseen count in real-time
                            unseenCounts[newMsg.sender_id] = 0;
                            updateUnseenBadge(newMsg.sender_id, 0);

                            // Schedule deletion for this message after 30 seconds
                            scheduleMessageDeletion(newMsg.id, friendId);
                        } catch (err) {
                            console.error("Error marking message as seen:", err);
                        }
                    } else {
                        // Only increment unseen count if chat is not open
                        // Use the new function to get accurate count from database
                        await updateUnseenCountForFriend(friendId);

                        // Show notification
                        try {
                            const senderName = await getUsername(newMsg.sender_id);
                            if (Notification.permission === "granted") {
                                const notif = new Notification(`${senderName}`, {
                                    body: newMsg.content,
                                    data: { type: 'message', senderId: newMsg.sender_id, senderName }
                                });

                                notif.addEventListener('click', () => {
                                    window.focus();
                                    // Store notification data for redirect
                                    notificationData = {
                                        type: 'message',
                                        senderId: newMsg.sender_id,
                                        senderName
                                    };
                                    // Redirect to dashboard
                                    window.location.href = '#dashboard';
                                    notif.close();
                                });
                            }
                        } catch (err) { /* ignore */ }
                    }
                }

                // Remove from processing set after handling
                setTimeout(() => {
                    processingMessageIds.delete(newMsg.id);
                }, 1000);
            }
        );

        // Listen for message updates (including deletions)
        msgChannel.on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "messages" },
            payload => {
                const updated = payload.new;
                const isRelevant =
                    (updated.sender_id === currentUserId && updated.receiver_id === friendId) ||
                    (updated.sender_id === friendId && updated.receiver_id === currentUserId);
                if (!isRelevant) return;

                // Handle message deletion
                if (updated.deleted_at) {
                    // Only remove from UI if current user is the receiver
                    if (updated.receiver_id === currentUserId) {
                        const idx = oldMessages.findIndex(m => m.id === updated.id);
                        if (idx !== -1) {
                            oldMessages.splice(idx, 1);
                            renderChatMessages(chatBox, oldMessages, friendAvatar);
                        }
                    }
                    // Update the last message in the chat list
                    updateLastMessageInChatList(friendId);
                    return;
                }

                // Handle seen status updates
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

    // ------------- Open chat window -------------
    async function openChat(friendId, friendName, friendAvatar, fromNotification = false) {
        // Set the currently open chat
        currentOpenChatId = friendId;

        const chatContainer = document.querySelector("div.chat-area");
        const defaultScreen = document.querySelector(".default");
        const sidebar = document.querySelector(".sidebar");
        const messageCon = document.getElementById("message");

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

        // For mobile view, adjust UI
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
                    // Reset the currently open chat
                    currentOpenChatId = null;

                    // Delete all seen messages for this chat immediately when leaving
                    await deleteSeenMessagesForChat(friendId);

                    document.getElementById('message').classList.remove('hidden');
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
                    fetchFriends(); // Re-fetch friends to update last messages/unseen counts
                });
            }
        } catch (err) {
            console.error("Error opening chat:", err);
            showPopup("Failed to open chat.", "error");
        } finally {
            hideLoading();
        }
    }

    // ------------- Buttons listeners -------------
    document.querySelector(".submit-friend")?.addEventListener("click", () => {
        const username = document.querySelector(".friend-input")?.value.trim();
        sendFriendRequest(username);
    });

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

    // ------------- Subscribe to global messages for unseen + last message updates -------------
    async function subscribeToGlobalMessages() {
        if (!window._globalMessageChannel) {
            window._globalMessageChannel = client.channel("global-messages");

            window._globalMessageChannel.on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "messages" },
                payload => {
                    const newMsg = payload.new;
                    if (!newMsg || !currentUserId) return;

                    if (newMsg.receiver_id === currentUserId) {
                        const senderId = newMsg.sender_id;

                        // Only update if this chat is not currently open
                        if (currentOpenChatId !== senderId) {
                            // Use the new function to get accurate count from database
                            updateUnseenCountForFriend(senderId);
                            updateLastMessage(senderId, newMsg.content, newMsg.created_at);

                            // Show notification
                            (async () => {
                                try {
                                    if (Notification.permission === "granted") {
                                        const { data: senderProfile, error } = await client
                                            .from("user_profiles")
                                            .select("user_name")
                                            .eq("user_id", senderId)
                                            .maybeSingle();

                                        const senderName = senderProfile?.user_name || "New Message";
                                        const notif = new Notification(senderName, {
                                            body: newMsg.content,
                                            data: { type: 'message', senderId, senderName }
                                        });

                                        notif.addEventListener('click', () => {
                                            window.focus();
                                            // Store notification data for redirect
                                            notificationData = {
                                                type: 'message',
                                                senderId,
                                                senderName
                                            };
                                            // Redirect to dashboard
                                            window.location.href = '#dashboard';
                                            notif.close();
                                        });
                                    }
                                } catch (err) {
                                    console.warn("Error sending message notification:", err);
                                }
                            })();
                        }
                    }
                }
            );

            // Add UPDATE event handler for seen status and deletions
            window._globalMessageChannel.on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "messages" },
                payload => {
                    const updatedMsg = payload.new;
                    if (!updatedMsg || !currentUserId) return;

                    // Handle message deletion
                    if (updatedMsg.deleted_at) {
                        // Update the last message in the chat list
                        updateLastMessageInChatList(updatedMsg.sender_id);
                        updateLastMessageInChatList(updatedMsg.receiver_id);

                        // Only update if this chat is not currently open
                        if (currentOpenChatId !== updatedMsg.sender_id) {
                            // Use the new function to get accurate count from database
                            updateUnseenCountForFriend(updatedMsg.sender_id);
                        }
                        return;
                    }

                    // Handle seen status updates
                    if (updatedMsg.receiver_id === currentUserId && updatedMsg.seen === true) {
                        const senderId = updatedMsg.sender_id;

                        // Only update if this chat is not currently open
                        if (currentOpenChatId !== senderId) {
                            // Use the new function to get accurate count from database
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

    // ------------- Subscribe to friend requests updates -------------
    async function subscribeToFriendRequests() {
        if (!window._friendRequestChannel) {
            window._friendRequestChannel = client.channel("friend-requests");

            window._friendRequestChannel.on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "requests" },
                payload => {
                    const newRequest = payload.new;
                    if (!newRequest || !currentUserId) return;

                    // Only handle requests sent to current user
                    if (newRequest.receiver_id === currentUserId && newRequest.status === "pending") {
                        // Refresh friend requests
                        fetchFriendRequests();
                    }
                }
            );

            window._friendRequestChannel.on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "requests" },
                payload => {
                    const updatedRequest = payload.new;
                    if (!updatedRequest || !currentUserId) return;

                    // Only handle requests involving current user
                    if ((updatedRequest.receiver_id === currentUserId || updatedRequest.sender_id === currentUserId) &&
                        (updatedRequest.status === "accepted" || updatedRequest.status === "rejected")) {
                        // Refresh friend requests and friends list
                        fetchFriendRequests();
                        fetchFriends();
                    }
                }
            );

            try {
                await window._friendRequestChannel.subscribe();
                console.log("Subscribed to friend-requests channel.");
            } catch (err) {
                console.warn("subscribeToFriendRequests subscribe failed:", err);
            }
        }
    }

    // ------------- Handle notification redirects -------------
    function handleNotificationRedirect() {
        if (notificationData.type === 'message' && notificationData.senderId) {
            // Get friend details
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

        // Reset notification data
        notificationData = {};
    }

    // ------------- PROFILE UI -------------
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
            newUsernameInput.value = profile?.user_name || ""; // Pre-fill username for editing
        } catch (err) {
            console.error("Error loading profile:", err);
            showPopup("Failed to load profile details.", "error");
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
        showLoading("Saving profile...");
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

            showPopup("Profile updated successfully!", "success");
            profilePopup?.classList.add("hidden");
            fetchCurrentUserAvatar();
            fetchFriends(); // refresh friend avatars
        } catch (err) {
            console.error("Error updating profile:", err);
            showPopup(`Failed to update profile: ${err.message || err}`, "error");
        } finally {
            hideLoading();
        }
    });

    logoutBtn?.addEventListener("click", async () => {
        showLoading("Logging out...");
        try {
            await setUserOnlineStatus(false);
            await client.auth.signOut();
            showPopup("Logged out!", "info");
            window.location.href = "signup.html";
        } catch (err) {
            console.error("Logout error:", err);
            showPopup("Logout failed.", "error");
        } finally {
            hideLoading();
        }
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
            showPopup("Username cannot be empty!", "error");
            return;
        }

        showLoading("Updating username...");
        try {
            const { error } = await client
                .from("user_profiles")
                .update({ user_name: newUsername })
                .eq("user_id", currentUserId);

            if (error) throw error;

            showPopup("Username updated!", "success");
            profileUsername.textContent = newUsername;
            usernamePopup?.classList.add("hidden");
            fetchFriends();
        } catch (err) {
            console.error("Error updating username:", err);
            showPopup(`Failed to update username: ${err.message || err}`, "error");
        } finally {
            hideLoading();
        }
    });

    // ------------- Initialize database schema if needed -------------
    async function initializeDatabaseSchema() {
        try {
            // Check if deleted_at column exists in messages table
            const { data: columns, error: columnsError } = await client
                .from("information_schema.columns")
                .select("column_name")
                .eq("table_name", "messages")
                .eq("column_name", "deleted_at");

            if (columnsError) {
                console.error("Error checking for deleted_at column:", columnsError);
                return;
            }

            // If deleted_at column doesn't exist, add it
            if (!columns || columns.length === 0) {
                console.log("Adding deleted_at column to messages table...");
                const { error: alterError } = await client.rpc('exec_sql', {
                    sql: "ALTER TABLE messages ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;"
                });

                if (alterError) {
                    console.error("Error adding deleted_at column:", alterError);
                } else {
                    console.log("Successfully added deleted_at column");
                }
            }
        } catch (err) {
            console.error("Error initializing database schema:", err);
        }
    }

    // ------------- boot -------------
    const me = await getCurrentUser();
    if (me) {
        // Initialize database schema if needed
        await initializeDatabaseSchema();

        await fetchFriends();
        await fetchFriendRequests();
        await subscribeToGlobalMessages();
        await subscribeToFriendRequests();

        if (Object.keys(notificationData).length > 0) {
            handleNotificationRedirect();
        }
    }
});