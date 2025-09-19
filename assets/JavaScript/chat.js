// fixed-chat-client.js
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

        // remove previous click handlers by cloning the node
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

    // ---------------- URL / direct chat linking ----------------
    function setUrlForChat(friendId) {
        if (friendId) {
            window.location.hash = `chat?id=${friendId}`;
        } else {
            // clear hash without reload
            window.history.pushState("", document.title, window.location.pathname + window.location.search);
        }
    }

    async function checkUrlForChatId() {
        const hash = window.location.hash || "";
        const match = hash.match(/#chat\?id=(.*)/);
        if (match && match[1]) {
            const friendId = match[1];
            showLoading("Loading chat from URL...");
            try {
                const { data: userProfile, error } = await client
                    .from("user_profiles")
                    .select("user_name, profile_image_url")
                    .eq("user_id", friendId)
                    .maybeSingle();

                if (error) throw error;
                if (userProfile) {
                    await openChat(friendId, userProfile.user_name, userProfile.profile_image_url);
                } else {
                    showPopup("Chat user not found.", "error");
                }
            } catch (err) {
                console.error("Error loading chat from URL:", err.message || err);
                showPopup("Failed to load chat from URL.", "error");
            } finally {
                hideLoading();
            }
        }
    }

    // ---------------- Notifications ----------------
    async function requestNotificationPermission() {
        if (!("Notification" in window)) return;
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
    requestNotificationPermission();

    // ---------------- Current user avatar & identity ----------------
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

            let avatarUrl = './assets/icon/download.jpeg';
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
    let messages = [];
    let statusChannelRef = null;
    let unseenCounts = {}; // map friendId -> count

    // ------------- Get current user -------------
    async function getCurrentUser() {
        try {
            const { data: { user }, error } = await client.auth.getUser();
            if (error || !user) {
                showPopup("User not logged in", "error");
                // redirect to signup/login
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
            fetchFriends();
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
    window.addEventListener('beforeunload', () => setUserOnlineStatus(false));

    // ------------- Messages popup rendering -------------
    function renderMessages() {
        const messageList = document.getElementById("message-list");
        const unreadBadge = document.getElementById("unread-count");
        if (!messageList || !unreadBadge) return;

        messageList.innerHTML = "";
        if (!messages || messages.length === 0) {
            messageList.textContent = "No Requests";
        } else {
            messages.forEach((msg, index) => {
                const li = document.createElement("li");
                li.className = "message-item";
                li.innerHTML = `
                    <img src="${msg.avatar}" alt="User" class="msg-avatar" style="width:30px;height:30px;border-radius:50%;object-fit:cover;">
                    <div class="message-text">${msg.text}</div>
                    <div class="message-time">${msg.time}</div>
                    <div class="message-actions">
                        <button class="accept-btn">Accept</button>
                        <button class="reject-btn">Reject</button>
                    </div>
                `;
                const acceptBtn = li.querySelector(".accept-btn");
                const rejectBtn = li.querySelector(".reject-btn");
                acceptBtn?.addEventListener("click", async () => {
                    await acceptRequest(msg.requestId, msg.senderId);
                    messages.splice(index, 1);
                    renderMessages();
                });
                rejectBtn?.addEventListener("click", async () => {
                    await rejectRequest(msg.requestId);
                    messages.splice(index, 1);
                    renderMessages();
                });
                messageList.appendChild(li);
            });
        }

        unreadBadge.textContent = (messages && messages.length) ? messages.length : "0";
    }

    function addMessage(text, requestId, senderId, avatar) {
        if (!messages.some(m => m.requestId === requestId)) {
            messages.push({
                text,
                time: new Date().toLocaleTimeString(),
                requestId,
                senderId,
                avatar
            });
            renderMessages();
        }
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

            messages = [];
            if (requests && requests.length) {
                // fetch all sender profiles in parallel for performance
                const senderIds = Array.from(new Set(requests.map(r => r.sender_id)));
                const { data: profilesMap } = await client
                    .from("user_profiles")
                    .select("user_id, user_name, profile_image_url")
                    .in("user_id", senderIds);

                const profileById = {};
                (profilesMap || []).forEach(p => { profileById[p.user_id] = p; });

                for (const req of requests) {
                    const senderProfile = profileById[req.sender_id] || {};
                    const avatarUrl = senderProfile.profile_image_url || "./assets/icon/user.png";
                    const senderName = senderProfile.user_name || "Someone";

                    addMessage(
                        `${senderName} sent you a friend request`,
                        req.id,
                        req.sender_id,
                        avatarUrl
                    );

                    // lightweight notification (silent if not allowed)
                    try {
                        if (Notification.permission === "granted") {
                            new Notification("Friend Request 👥", { body: `${senderName} sent you a request` });
                        }
                    } catch (err) {
                        // ignore
                    }
                }
            } else {
                renderMessages();
            }
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

            // Build unique friendIds
            const friendIds = friends.map(f => (f.user1_id === currentUserId ? f.user2_id : f.user1_id));

            // fetch profiles for all friendIds
            const { data: profiles } = await client
                .from("user_profiles")
                .select("user_id, user_name, profile_image_url, is_online")
                .in("user_id", friendIds);

            const profilesById = {};
            (profiles || []).forEach(p => { profilesById[p.user_id] = p; });

            // fetch last message for each friend concurrently
            const friendDataPromises = friendIds.map(async (friendId) => {
                const profile = profilesById[friendId] || {};
                const friendName = profile.user_name || "Unknown";
                const avatarUrl = profile.profile_image_url || "./assets/icon/user.png";
                const isOnline = profile.is_online || false;

                const { data: lastMsgData } = await client
                    .from("messages")
                    .select("content, created_at, sender_id, receiver_id")
                    .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const lastMessageText = lastMsgData?.content || "No messages yet";
                const lastMessageTime = lastMsgData ? new Date(lastMsgData.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

                // unseen count
                let unseenCount = 0;
                try {
                    const { count, error: unseenError } = await client
                        .from("messages")
                        .select("*", { count: "exact", head: true })
                        .eq("sender_id", friendId)
                        .eq("receiver_id", currentUserId)
                        .eq("seen", false);

                    if (!unseenError) unseenCount = count || 0;
                } catch (err) {
                    console.warn("unseen count fetch failed:", err);
                }

                return { friendId, friendName, avatarUrl, isOnline, lastMessageText, lastMessageTime, unseenCount };
            });

            const friendData = await Promise.all(friendDataPromises);

            friendData.forEach(data => {
                const { friendId, friendName, avatarUrl, isOnline, lastMessageText, lastMessageTime, unseenCount } = data;

                const li = document.createElement("li");
                li.classList.add("chat");
                li.setAttribute("data-friend-id", friendId);
                li.innerHTML = `
                    <div class="avatar-wrapper" style="position:relative;">
                        <img src="${avatarUrl}" alt="User" style="object-fit: cover; border-radius:50%;">
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

        // avoid attaching multiple listeners
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
                // update last message UI locally (optimistic)
                updateLastMessage(friendId, content, new Date().toISOString());
            }
        } catch (err) {
            console.error("sendMessage error:", err);
            showPopup("Message failed to send. Please try again.", "error");
        }
    }

    async function logMessagesTable() {
        try {
            const { data, error } = await client
                .from("messages")
                .select("*")
                .order("created_at", { ascending: true });

            if (error) {
                console.error("Error fetching messages table:", error);
                return;
            }
            console.log("📌 Current messages table:", data);
        } catch (err) {
            console.error("Unexpected error logging messages table:", err);
        }
    }

    // ------------- Mark messages as seen -------------
    async function markMessagesAsSeen(friendId, chatBox, oldMessages, friendAvatar) {
        if (!currentUserId) return;
        try {
            const { data: unseenMessages, error: fetchError } = await client
                .from("messages")
                .select("*")
                .eq("receiver_id", currentUserId)
                .eq("sender_id", friendId)
                .eq("seen", false);

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
            }

            unseenMessages.forEach(msg => {
                const idx = oldMessages.findIndex(m => m.id === msg.id);
                if (idx !== -1) oldMessages[idx].seen = true;
            });

            renderChatMessages(chatBox, oldMessages, friendAvatar);
        } catch (err) {
            console.error("markMessagesAsSeen error:", err);
        }
    }

    // ------------- Fetch messages -------------
    async function fetchMessages(friendId) {
        try {
            const { data, error } = await client
                .from("messages")
                .select("*")
                .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
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
    async function subscribeToMessages(friendId, chatBox, oldMessages, friendAvatar, typingIndicator) {
        function upsertMessageAndRender(oldMessagesArr, msgObj) {
            const idx = oldMessagesArr.findIndex(m => m.id === msgObj.id);
            if (idx === -1) oldMessagesArr.push(msgObj);
            else oldMessagesArr[idx] = { ...oldMessagesArr[idx], ...msgObj };
            renderChatMessages(chatBox, oldMessagesArr, friendAvatar);
        }

        // simple cache for username lookups
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

        msgChannel.on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "messages" },
            async payload => {
                const newMsg = payload.new;
                const isRelevant =
                    (newMsg.sender_id === currentUserId && newMsg.receiver_id === friendId) ||
                    (newMsg.sender_id === friendId && newMsg.receiver_id === currentUserId);
                if (!isRelevant) return;

                // push/update
                upsertMessageAndRender(oldMessages, newMsg);

                if (newMsg.receiver_id === currentUserId) {
                    unseenCounts[newMsg.sender_id] = (unseenCounts[newMsg.sender_id] || 0) + 1;
                    updateUnseenBadge(newMsg.sender_id, unseenCounts[newMsg.sender_id]);

                    // optional desktop notification
                    try {
                        const senderName = await getUsername(newMsg.sender_id);
                        if (Notification.permission === "granted") {
                            new Notification(`${senderName}`, { body: newMsg.content });
                        }
                    } catch (err) { /* ignore */ }
                }
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
                upsertMessageAndRender(oldMessages, updated);

                if (updated.receiver_id === currentUserId && updated.seen === true) {
                    unseenCounts[updated.sender_id] = 0;
                    updateUnseenBadge(updated.sender_id, 0);
                }
            }
        );

        // typing broadcast channel
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

        // status channel for friend's online status (clean up previous)
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

        // subscribe all channels
        await msgChannel.subscribe();
        await typingChannel.subscribe();
        await statusChannelRef.subscribe();

        return { msgChannel, typingChannel, statusChannelRef };
    }

    // ------------- Open chat window -------------
    async function openChat(friendId, friendName, friendAvatar) {
        const chatContainer = document.querySelector("div.chat-area");
        const defaultScreen = document.querySelector('.default');
        const sidebar = document.querySelector('.sidebar');
        const messageCon = document.getElementById('message');

        if (!chatContainer || !defaultScreen) {
            console.error("Missing necessary HTML elements for chat.");
            return;
        }

        defaultScreen.style.display = 'none';
        chatContainer.style.display = 'flex';

        setUrlForChat(friendId);

        const chatHeaderName = chatContainer.querySelector('#chat-header-name');
        const chatHeaderImg = chatContainer.querySelector('.chat-header img');
        if (chatHeaderName) chatHeaderName.textContent = friendName || 'Unknown';
        if (chatHeaderImg) chatHeaderImg.src = friendAvatar || './assets/icon/user.png';

        // mobile fallback
        if (window.innerWidth <= 768 && sidebar && messageCon) {
            sidebar.style.display = 'flex';
            chatContainer.style.display = 'none';
            messageCon.style.display = 'flex';
        } else if (messageCon) {
            messageCon.style.display = 'none';
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

            // prevent stacking listeners: replace elements with clones (clears old listeners)
            function replaceElement(elSelectorWithin) {
                const el = chatContainer.querySelector(elSelectorWithin);
                if (!el) return null;
                const clone = el.cloneNode(true);
                el.parentNode.replaceChild(clone, el);
                return clone;
            }

            const emojiBtnSafe = emojiBtn ? replaceElement("#emoji-btn") : null;
            const emojiPickerSafe = emojiPicker ? replaceElement("#emoji-picker") : null;
            const inputSafe = replaceElement("input") || input; // fallback
            const sendBtnSafe = replaceElement(".sendBtn") || sendBtn;

            // emoji handling
            if (emojiBtnSafe && emojiPickerSafe) {
                emojiBtnSafe.addEventListener("click", (e) => {
                    e.stopPropagation();
                    emojiPickerSafe.style.display = emojiPickerSafe.style.display === "none" || !emojiPickerSafe.style.display ? "block" : "none";
                });
                emojiPickerSafe.addEventListener("click", (e) => e.stopPropagation());
                window.addEventListener('click', () => {
                    if (emojiPickerSafe) emojiPickerSafe.style.display = 'none';
                });
                emojiPickerSafe.addEventListener("emoji-click", event => {
                    inputSafe.value += event.detail.unicode;
                    inputSafe.focus();
                    sendBtnSafe.disabled = !inputSafe.value.trim();
                });
            }

            inputSafe.value = "";
            sendBtnSafe.disabled = true;

            const oldMessages = await fetchMessages(friendId);
            renderChatMessages(chatBox, oldMessages, friendAvatar);

            const { msgChannel, typingChannel, statusChannelRef: statusChan } = await subscribeToMessages(friendId, chatBox, oldMessages, friendAvatar, typingIndicator);

            await markMessagesAsSeen(friendId, chatBox, oldMessages, friendAvatar);
            updateUnseenBadge(friendId, 0);
            unseenCounts[friendId] = 0;

            // handle typing broadcast - reuse typing channel topic
            const typingChannelName = `typing:${[currentUserId, friendId].sort().join(":")}`;

            inputSafe.addEventListener("input", () => {
                sendBtnSafe.disabled = !inputSafe.value.trim();
                // broadcast typing on the typing channel for this pair
                try {
                    client.channel(typingChannelName).send({
                        type: "broadcast",
                        event: "typing",
                        payload: {
                            userId: currentUserId,
                            userName: "You"
                        }
                    });
                } catch (err) {
                    // ignore
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
            inputSafe.addEventListener("keypress", e => {
                if (e.key === "Enter") handleSend();
            });

            // back button - cleanup subscriptions
            const backBtn = chatContainer.querySelector('.backBtn');
            if (backBtn) {
                const backClone = backBtn.cloneNode(true);
                backBtn.parentNode.replaceChild(backClone, backBtn);
                backClone.addEventListener('click', async () => {
                    if (sidebar) sidebar.style.display = 'flex';
                    chatContainer.style.display = 'none';
                    defaultScreen.style.display = 'flex';
                    setUrlForChat(null);

                    // remove channels
                    try {
                        if (msgChannel) await client.removeChannel(msgChannel);
                        if (typingChannel) await client.removeChannel(typingChannel);
                        if (statusChan) await client.removeChannel(statusChan);
                    } catch (err) {
                        console.warn("Error removing channels:", err);
                    }
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

        // Move chat to top of list (like WhatsApp)
        const chatList = chatLi.parentElement;
        if (chatList && chatList.firstChild !== chatLi) {
            chatList.prepend(chatLi);
        }
    }

    // ------------- Subscribe to global messages for unseen + last message updates -------------
    async function subscribeToGlobalMessages() {
        const globalChannel = client.channel("global-messages");

        globalChannel.on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "messages" },
            payload => {
                const newMsg = payload.new;
                if (!newMsg || !currentUserId) return;

                // Only handle messages sent to current user
                if (newMsg.receiver_id === currentUserId) {
                    const senderId = newMsg.sender_id;
                    unseenCounts[senderId] = (unseenCounts[senderId] || 0) + 1;
                    updateUnseenBadge(senderId, unseenCounts[senderId]);
                    updateLastMessage(senderId, newMsg.content, newMsg.created_at);
                }
            }
        );

        try {
            await globalChannel.subscribe();
        } catch (err) {
            console.warn("subscribeToGlobalMessages subscribe failed:", err);
        }
    }

    // ------------- PROFILE UI -------------
    const DEFAULT_PROFILE_IMG = "./assets/icon/default-user.png";

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

            profilePreview.src = profile?.profile_image_url || DEFAULT_PROFILE_IMG;
            bioInput.value = profile?.bio || "";
            profileUsername.textContent = profile?.user_name || "Unknown User";
        } catch (err) {
            console.error("Error loading profile:", err);
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
        try {
            const imageUrl = profilePreview?.src || DEFAULT_PROFILE_IMG;
            const bio = bioInput?.value.trim() || "";

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
            showPopup("Failed to update profile.", "error");
        }
    });

    logoutBtn?.addEventListener("click", async () => {
        try {
            await client.auth.signOut();
            showPopup("Logged out!", "info");
            window.location.href = "signup.html";
        } catch (err) {
            console.error("Logout error:", err);
            showPopup("Logout failed.", "error");
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
            showPopup("Failed to update username.", "error");
        }
    });

    // ------------- boot -------------
    const me = await getCurrentUser();
    if (me) {
        // initial loads
        await fetchFriends();
        await fetchFriendRequests();
        await subscribeToGlobalMessages();
        await checkUrlForChatId();
    }
});
