import { client } from "../../supabase.js";

document.addEventListener("DOMContentLoaded", async () => {

    function showPopup(message) {
        const popup = document.getElementById("popup");
        const messageEl = document.getElementById("popup-message");
        const closeBtn = document.getElementById("popup-close");

        if (!popup || !messageEl) return;

        messageEl.textContent = message;
        popup.classList.add('show')
        popup.classList.remove("hidden");
        popup.classList.remove("error", "success", "info");
        popup.classList.add(type);

        closeBtn?.addEventListener('click', () => {
            popup.classList.add("hidden");
        });
    }

    function showLoading(message = 'Loading...') {
        const overlay = document.getElementById("loading-overlay");
        const msgEl = document.getElementById("loading-message");
        overlay.classList.remove('hidden');
        if (msgEl) msgEl.textContent = message;
        if (overlay) overlay.style.display = "flex";
    }

    function hideLoading() {
        const overlay = document.getElementById("loading-overlay");
        if (overlay) overlay.classList.add('hidden');
    }


    /* ------------------ URL and Direct Chat Linking ------------------ */
    // This function adds or removes the friend's ID from the URL hash.
    function setUrlForChat(friendId) {
        if (friendId) {
            window.location.hash = `chat?id=${friendId}`;
        } else {
            // Clear the hash without reloading the page
            window.history.pushState("", document.title, window.location.pathname + window.location.search);
        }
    }

    // This function checks the URL on page load and opens a chat if an ID is present.
    async function checkUrlForChatId() {
        const hash = window.location.hash;
        const match = hash.match(/#chat\?id=(.*)/);
        if (match && match[1]) {
            const friendId = match[1];
            showLoading("Loading chat from URL...");
            const { data: userProfile } = await client
                .from("user_profiles")
                .select("user_name, profile_image_url")
                .eq("user_id", friendId)
                .maybeSingle();

            if (userProfile) {
                await openChat(friendId, userProfile.user_name, userProfile.profile_image_url);
            }
            hideLoading();
        }
    }


    async function requestNotificationPermission() {
        if (!("Notification" in window)) return;

        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            console.log("Notifications blocked by user.");
        } else {
            console.log("Notifications enabled ✅");
        }
    }
    requestNotificationPermission();


    /* ------------------ Current User Avatar ------------------ */
    async function fetchCurrentUserAvatar(profileImageSelector = '.profile-pic') {
        const profileImage = document.querySelector(profileImageSelector);
        if (!profileImage) return;

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
    }
    fetchCurrentUserAvatar();

    let currentUserId = null;
    let messages = [];
    let statusChannelRef = null;
    let unseenCounts = {};


    /* ------------------ Get Current User ------------------ */
    async function getCurrentUser() {
        const { data: { user }, error } = await client.auth.getUser();
        if (error || !user) {
            showPopup("User not logged in", "error");
            window.location.href = 'signup.html';
            return;
        }
        currentUserId = user.id;
        console.log("Current user ID:", currentUserId);

        setUserOnlineStatus(true);
    }

    /* ------------------ Accept Friend Request ------------------ */
    async function acceptRequest(requestId, senderId) {
        try {
            const { error: updateError } = await client
                .from("requests")
                .update({ status: "accepted" })
                .eq("id", requestId);

            if (updateError) {
                console.error("Error updating request:", updateError.message);
                return showPopup("Failed to accept request.");
            }

            const { error: insertError } = await client
                .from("friends")
                .insert([{ user1_id: currentUserId, user2_id: senderId }]);

            if (insertError) {
                console.error("Error inserting into friends:", insertError.message);
                return showPopup("Failed to add friend.");
            }

            showPopup("Friend request accepted!", "success");
            fetchFriends();

        } catch (err) {
            console.error("Unexpected error:", err.message);
        }
    }

    // Reject Friend Rquest

    async function rejectRequest(requestId) {
        try {
            const { error } = await client
                .from("requests")
                .update({ status: "rejected" })
                .eq("id", requestId);

            if (error) {
                console.error("Error rejecting request:", error.message);
                return showPopup("Failed to reject request.", "error");
            }

            showPopup("Friend request rejected!", "info");
        } catch (err) {
            console.error("Unexpected error rejecting request:", err.message);
        }
    }


    /* ------------------ Set User Online/Offline ------------------ */
    async function setUserOnlineStatus(isOnline) {
        if (!currentUserId) return;
        try {
            await client.from('user_profiles')
                .upsert({ user_id: currentUserId, is_online: isOnline }, { onConflict: 'user_id' });
        } catch (err) {
            console.error("Error updating online status:", err.message);
        }
    }

    window.addEventListener('beforeunload', () => setUserOnlineStatus(false));

    /* ------------------ Messages Popup ------------------ */
    function renderMessages() {
        const messageList = document.getElementById("message-list");
        const unreadBadge = document.getElementById("unread-count");
        if (!messageList || !unreadBadge) return;

        messageList.innerHTML = "";
        if (messages.length === 0) {
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
                li.querySelector(".accept-btn").addEventListener("click", async () => {
                    await acceptRequest(msg.requestId, msg.senderId);
                    messages.splice(index, 1);
                    renderMessages();
                });
                li.querySelector(".reject-btn").addEventListener("click", async () => {
                    await rejectRequest(msg.requestId);
                    messages.splice(index, 1);
                    renderMessages();
                });
                messageList.appendChild(li);
            });
        }

        unreadBadge.textContent = messages.length;
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

    /* ------------------ Toggle Message Popup ------------------ */
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

    /* ------------------ Fetch Friend Requests ------------------ */
    async function fetchFriendRequests() {
        if (!currentUserId) return;

        showLoading("Fetching friend requests...");

        try {
            const { data: requests, error } = await client
                .from("requests")
                .select("id, sender_id, status, private_users!requests_sender_id_fkey(name)")
                .eq("receiver_id", currentUserId)
                .eq("status", "pending");

            if (error) throw error;

            messages = [];
            if (requests) {
                for (const req of requests) {
                    const { data: senderProfile } = await client
                        .from("user_profiles")
                        .select("profile_image_url")
                        .eq("user_id", req.sender_id)
                        .maybeSingle();

                    const avatarUrl = senderProfile?.profile_image_url || "./assets/icon/user.png";

                    addMessage(
                        `${req.private_users?.name || "Unknown"} sent you a friend request`,
                        req.id,
                        req.sender_id,
                        avatarUrl
                    );
                    showNotification("Friend Request 👥", `${req.private_users?.name || "Someone"} sent you a request`);
                }
            }
        } catch (err) {
            console.error("Error fetching requests:", err.message);
            showPopup("Failed to fetch friend requests.");
        } finally {
            hideLoading();
        }
    }


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
            badge.style.display = "none";
        }
    }

    /* ------------------ Fetch Friends / Chat List ------------------ */
    async function fetchFriends() {
        if (!currentUserId) return;

        showLoading("Fetching friends...");

        try {
            const { data: friends, error } = await client
                .from("friends")
                .select("*")
                .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`);

            if (error) throw error;

            const chatList = document.querySelector(".chat-list");
            if (!chatList) return;
            chatList.innerHTML = "";

            // Use Promise.all to fetch data concurrently for better performance
            const friendPromises = friends.map(async (f) => {
                const friendId = f.user1_id === currentUserId ? f.user2_id : f.user1_id;

                // Get profile data
                const { data: userProfile } = await client
                    .from("user_profiles")
                    .select("user_name, profile_image_url, is_online")
                    .eq("user_id", friendId)
                    .maybeSingle();

                const friendName = userProfile?.user_name || "Unknown";
                const avatarUrl = userProfile?.profile_image_url || "./assets/icon/user.png";

                // Fetch last message
                const { data: lastMsgData } = await client
                    .from("messages")
                    .select("*")
                    .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}), and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const lastMessageText = lastMsgData?.content || "No messages yet";
                const lastMessageTime = lastMsgData
                    ? new Date(lastMsgData.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "";

                // Fetch unseen messages
                const { count: unseenCount, error: unseenError } = await client
                    .from("messages")
                    .select("*", { count: "exact", head: true })
                    .eq("sender_id", friendId)
                    .eq("receiver_id", currentUserId)
                    .eq("seen", false);

                if (unseenError) console.error("Error fetching unseen messages:", unseenError);

                return {
                    friendId,
                    friendName,
                    avatarUrl,
                    isOnline: userProfile?.is_online,
                    lastMessageText,
                    lastMessageTime,
                    unseenCount
                };
            });

            // Wait for all promises to resolve
            const friendData = await Promise.all(friendPromises);

            // Now render the UI with the complete data
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
                <div>
                    <h4>${friendName}</h4>
                    <p class="last-message" title="${lastMessageText}">${lastMessageText}</p>
                </div>
                <span class="time">${lastMessageTime}</span>
                ${unseenCount > 0 ? `<p class="non-seen-msg">${unseenCount}</p>` : ''}
            `;

                li.addEventListener("click", () => {
                    openChat(friendId, friendName, avatarUrl);
                    if (innerWidth <= 768) {
                        document.querySelector('#message').classList.add("hidden");
                    }
                });

                chatList.appendChild(li);
            });

            enableFriendSearch();

        } catch (err) {
            console.error("Error fetching friends:", err.message);
            showPopup("Failed to load friends.");
        } finally {
            hideLoading();
        }
    }
    /* ------------------ Friend Search ------------------ */
    function enableFriendSearch() {
        const searchInput = document.getElementById("search-friends");
        const chatList = document.querySelector(".chat-list");

        if (!searchInput || !chatList) return;

        searchInput.addEventListener("input", () => {
            const query = searchInput.value.toLowerCase().trim();
            const chats = chatList.querySelectorAll(".chat");

            chats.forEach(chat => {
                const nameEl = chat.querySelector("h4");
                const name = nameEl ? nameEl.textContent.toLowerCase() : "";

                if (name.includes(query)) {
                    chat.style.display = "flex"; // show match
                } else {
                    chat.style.display = "none"; // hide non-match
                }
            });
        });
    }


    /* ------------------ Send Message ------------------ */
    async function sendMessage(friendId, content) {
        if (!content.trim()) return;

        const { error } = await client.from("messages").insert([{
            sender_id: currentUserId,
            receiver_id: friendId,
            content
        }]);

        if (error) {
            console.error("Error sending message:", error.message);
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
                console.error("Error fetching messages table:", error.message);
                return;
            }
            console.log("📌 Current messages table:", data);
        } catch (err) {
            console.error("Unexpected error logging messages table:", err.message);
        }
    }


    /* ------------------ Mark Messages as Seen ------------------ */
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
                console.error("Error fetching unseen messages:", fetchError.message);
                return;
            }

            if (!unseenMessages || unseenMessages.length === 0) {
                console.log(`No unseen messages from ${friendId}`);
                return;
            }

            const { error: updateError } = await client
                .from("messages")
                .update({ seen: true })
                .eq("receiver_id", currentUserId)
                .eq("sender_id", friendId)
                .eq("seen", false);

            if (updateError) {
                console.error("Error marking messages as seen:", updateError.message);
            } else {
                console.log(`Messages from ${friendId} marked as seen ✓✓`);
            }

            unseenMessages.forEach(msg => {
                const idx = oldMessages.findIndex(m => m.id === msg.id);
                if (idx !== -1) oldMessages[idx].seen = true;
            });

            renderChatMessages(chatBox, oldMessages, friendAvatar);

        } catch (err) {
            console.error("Unexpected error marking messages as seen:", err.message);
        }
    }

    /* ------------------ Fetch Messages ------------------ */
    async function fetchMessages(friendId) {
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
    }

    function renderChatMessages(chatBox, msgs, friendAvatar) {
        chatBox.innerHTML = "";
        msgs.forEach(msg => {
            const isMe = msg.sender_id === currentUserId;
            const msgDiv = document.createElement("div");
            msgDiv.className = `message ${isMe ? "sent" : "received"}`;

            const timeStr = new Date(msg.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            });

            msgDiv.innerHTML = `
            ${!isMe
                    ? `<img src="${friendAvatar}" class="msg-avatar" style="width:25px;height:25px;border-radius:50%;margin-right:6px;">`
                    : ""}
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

    // Send Friend Request

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
                console.error("Error checking existing request:", existingError.message);
                return showPopup("Something went wrong. Try again.", "error");
            }

            if (existing) {
                if (existing.status === "pending") {
                    return showPopup("You have already sent a request.", "info");
                }
                if (existing.status === "accepted") {
                    return showPopup("You are already friends.", "info");
                }
                if (existing.status === "rejected") {
                    return showPopup("This user rejected your request before.", "warning");
                }
            }

            const { error: requestError } = await client
                .from("requests")
                .insert([{ sender_id: currentUserId, receiver_id: receiverId, status: "pending" }]);

            if (requestError) {
                console.error("Error sending friend request:", requestError.message);
                return showPopup("Failed to send friend request.", "error");
            }

            showPopup("Friend request sent successfully!", "success");

        } catch (err) {
            console.error("Unexpected error in sendFriendRequest:", err.message);
            showPopup("Unexpected error. Please try again.", "error");
        }
    }


    /* ---------------- RealTime Update ---------------- */
    async function subscribeToMessages(friendId, chatBox, oldMessages, friendAvatar, typingIndicator) {
        function upsertMessageAndRender(oldMessages, msgObj, chatBox, friendAvatar) {
            const idx = oldMessages.findIndex(m => m.id === msgObj.id);
            if (idx === -1) oldMessages.push(msgObj);
            else oldMessages[idx] = { ...oldMessages[idx], ...msgObj };
            renderChatMessages(chatBox, oldMessages, friendAvatar);
        }

        /* ---------------- Messages Channel ---------------- */
        const msgChannel = client.channel(`chat:${[currentUserId, friendId].sort().join(":")}`);
        msgChannel.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async payload => {
            const newMsg = payload.new;
            const isRelevant =
                (newMsg.sender_id === currentUserId && newMsg.receiver_id === friendId) ||
                (newMsg.sender_id === friendId && newMsg.receiver_id === currentUserId);
            if (!isRelevant) return;

            oldMessages.push(newMsg);
            renderChatMessages(chatBox, oldMessages, friendAvatar);

            if (newMsg.receiver_id === currentUserId) {
                const prev = unseenCounts[newMsg.sender_id] || 0;
                unseenCounts[newMsg.sender_id] = prev + 1;
                updateUnseenBadge(newMsg.sender_id, unseenCounts[newMsg.sender_id]);

                showNotification("New Message 💬", newMsg.content, "./assets/icon/user.png", "dashboard.html" + newMsg.sender_id);
            }
        });

        msgChannel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, payload => {
            const updated = payload.new;
            const isRelevant =
                (updated.sender_id === currentUserId && updated.receiver_id === friendId) ||
                (updated.sender_id === friendId && updated.receiver_id === currentUserId);
            if (!isRelevant) return;

            upsertMessageAndRender(oldMessages, updated, chatBox, friendAvatar);

            if (updated.receiver_id === currentUserId && updated.seen === true) {
                unseenCounts[updated.sender_id] = 0;
                updateUnseenBadge(updated.sender_id, 0);
            }
        });

        /* ---------------- Typing Channel ---------------- */
        const typingChannelName = `typing:${[currentUserId, friendId].sort().join(":")}`;
        const typingChannel = client.channel(typingChannelName)
            .on("broadcast", { event: "typing" }, payload => {
                if (payload.userId === friendId) {
                    typingIndicator.textContent = `${payload.userName || "Friend"} is typing...`;
                    setTimeout(async () => {
                        const { data: profile } = await client
                            .from("user_profiles")
                            .select("is_online")
                            .eq("user_id", friendId)
                            .maybeSingle();
                        typingIndicator.textContent = profile?.is_online ? "Online" : "Offline";
                    }, 1500);
                }
            });

        /* ---------------- Status Channel ---------------- */
        if (statusChannelRef) {
            await client.removeChannel(statusChannelRef); // cleanup previous
        }

        statusChannelRef = client.channel("user_status")
            .on("postgres_changes",
                {
                    event: "*", // INSERT + UPDATE + DELETE
                    schema: "public",
                    table: "user_profiles",
                    filter: `user_id=eq.${friendId}`
                },
                payload => {
                    typingIndicator.textContent = payload.new?.is_online ? "Online" : "Offline";
                }
            );

        /* ---------------- Subscribe ---------------- */
        await msgChannel.subscribe();
        await typingChannel.subscribe();
        await statusChannelRef.subscribe();

        // return channels so you can cleanup later if needed
        return { msgChannel, typingChannel, statusChannelRef };
    }

    /* ------------------ Open Chat ------------------ */
    // Updated to call setUrlForChat()
    async function openChat(friendId, friendName, friendAvatar) {
        const chatContainer = document.querySelector(".chat-area");
        const sidebar = document.querySelector('.sidebar');
        if (!chatContainer) return;

        // Set the URL to reflect the open chat
        setUrlForChat(friendId);

        if (window.innerWidth <= 768) {
            sidebar.style.display = 'none';
            chatContainer.style.display = 'flex';
        }

        showLoading("Loading chat...");

        try {
            chatContainer.innerHTML = `
        <div class="chat-header">
            <button class="backBtn"><i class="fa-solid fa-backward"></i></button>
            <img src="${friendAvatar || './assets/icon/user.png'}" alt="User" style="object-fit:cover;">
            <div>
                <h4>${friendName || 'Unknown'}</h4>
                <p id="typing-indicator">Offline</p>
            </div>
        </div>
        <div class="messages"></div>
        <div class="chat-input">
            <i class="fa-regular fa-face-smile" id='emoji-btn'></i>
            <input id='input' type="text" placeholder="Type a message..." inputmode="text">
            <button disabled class='sendBtn'>➤</button>
            <emoji-picker id="emoji-picker" style="position:absolute; bottom:50px; left:0; display:none; z-index:1000;"></emoji-picker>
        </div>
        `;

            const emojiBtn = chatContainer.querySelector("#emoji-btn");
            const emojiPicker = chatContainer.querySelector("#emoji-picker");
            const input = chatContainer.querySelector("input");
            const sendBtn = chatContainer.querySelector(".sendBtn");
            const chatBox = chatContainer.querySelector(".messages");
            const typingIndicator = chatContainer.querySelector("#typing-indicator");

            input.addEventListener("focus", () => {
                setTimeout(() => {
                    chatBox.scrollTop = chatBox.scrollHeight;
                }, 300);
            });

            /* ---------------- Emoji Picker ---------------- */
            emojiBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                emojiPicker.style.display = emojiPicker.style.display === "none" ? "block" : "none";
            });

            emojiPicker.addEventListener("click", (e) => e.stopPropagation());
            window.addEventListener('click', () => { emojiPicker.style.display = 'none'; });

            emojiPicker.addEventListener("emoji-click", event => {
                input.value += event.detail.unicode;
                input.focus();
                sendBtn.disabled = !input.value.trim();
            });

            /* ---------------- Messages + Realtime ---------------- */
            const oldMessages = await fetchMessages(friendId);
            renderChatMessages(chatBox, oldMessages, friendAvatar);

            // subscribe with fixed function (uses shared typing channel + status)
            const { msgChannel, typingChannel, statusChannelRef: statusChan } =
                await subscribeToMessages(friendId, chatBox, oldMessages, friendAvatar, typingIndicator);

            await markMessagesAsSeen(friendId, chatBox, oldMessages, friendAvatar);
            updateUnseenBadge(friendId, 0);

            /* ---------------- Typing Broadcast ---------------- */
            const typingChannelName = `typing:${[currentUserId, friendId].sort().join(":")}`;
            input.addEventListener("input", () => {
                sendBtn.disabled = !input.value.trim();
                client.channel(typingChannelName).send({
                    type: "broadcast",
                    event: "typing",
                    payload: { userId: currentUserId, userName: "You" }
                });
            });

            /* ---------------- Send Button ---------------- */
            async function handleSend() {
                const content = input.value.trim();
                if (!content) return;
                await sendMessage(friendId, content);
                input.value = "";
                sendBtn.disabled = true;
            }

            sendBtn.addEventListener("click", handleSend);
            input.addEventListener("keypress", e => { if (e.key === "Enter") handleSend(); });

            /* ---------------- Back Button ---------------- */
            const backBtn = chatContainer.querySelector('.backBtn');
            if (backBtn) {
                backBtn.addEventListener('click', async () => {
                    sidebar.style.display = 'flex';
                    chatContainer.style.display = 'none';

                    // Clear the URL hash when going back
                    setUrlForChat(null);

                    if (msgChannel) await client.removeChannel(msgChannel);
                    if (typingChannel) await client.removeChannel(typingChannel);
                    if (statusChan) await client.removeChannel(statusChan);
                });
            }
        } catch (err) {
            console.error("Error opening chat:", err.message);
            showPopup("Failed to open chat.");
        } finally {
            hideLoading();
        }
    }



    /* ------------------ Button Listener ------------------ */
    document.querySelector(".submit-friend")?.addEventListener("click", () => {
        const username = document.querySelector(".friend-input").value.trim();
        sendFriendRequest(username);
    });

    function updateLastMessage(friendId, content, createdAt) {
        const chatLi = document.querySelector(`.chat[data-friend-id="${friendId}"]`);
        if (!chatLi) return;

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

        // Move chat to top of list (like WhatsApp)
        const chatList = chatLi.parentElement;
        chatList.prepend(chatLi);
    }


    async function subscribeToGlobalMessages() {
        const globalChannel = client.channel("global-messages");

        /* ------------------ Listen for New Messages ------------------ */
        globalChannel.on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "messages" },
            payload => {
                const newMsg = payload.new;

                // Only handle new messages that are sent to the current user
                if (newMsg.receiver_id === currentUserId) {
                    // Update unseen message count for the friend who sent the message
                    const senderId = newMsg.sender_id;
                    unseenCounts[senderId] = (unseenCounts[senderId] || 0) + 1;
                    updateUnseenBadge(senderId, unseenCounts[senderId]);

                    // Update the last message text in the friend list
                    updateLastMessage(senderId, newMsg.content, newMsg.created_at);

                    // Show a notification
                    showNotification(
                        "New Message 💬",
                        newMsg.content,
                        "./assets/icon/user.png",
                        "dashboard.html" + newMsg.sender_id
                    );
                }
            }
        ).subscribe();
    }

    // function showPopup(message) {
    //     const popup = document.getElementById("popup");
    //     const messageEl = document.getElementById("popup-message");
    //     const closeBtn = document.getElementById("popup-close");

    //     if (!popup || !messageEl) return;

    //     messageEl.textContent = message;
    //     popup.classList.remove("hidden");

    //     closeBtn?.addEventListener('click', () => {
    //         popup.classList.add("hidden")
    //     });
    // }

    // function showLoading(message = "Loading...") {
    //     const overlay = document.getElementById("loading-overlay");
    //     const msgEl = document.getElementById("loading-message");
    //     if (msgEl) msgEl.textContent = message;
    //     if (overlay) overlay.style.display = "flex";
    // }

    // function hideLoading() {
    //     const overlay = document.getElementById("loading-overlay");
    //     if (overlay) overlay.style.display = "none";
    // }

    // profile 

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

    /* ------------------ Open Profile Popup ------------------ */
    profilePic?.addEventListener("click", async () => {
        profilePopup.classList.remove("hidden");

        const { data: profile } = await client
            .from("user_profiles")
            .select("profile_image_url, bio, user_name")
            .eq("user_id", currentUserId)
            .limit(1)
            .maybeSingle();

        profilePreview.src = profile?.profile_image_url || DEFAULT_PROFILE_IMG;
        bioInput.value = profile?.bio || "";
        profileUsername.textContent = profile?.user_name || "Unknown User";
        console.log(profile.user_name)
    });

    /* ------------------ Close Profile Popup ------------------ */
    closeProfile?.addEventListener("click", () => {
        profilePopup.classList.add("hidden");
    });

    /* ------------------ Preview new image ------------------ */
    profileUpload?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                profilePreview.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    /* ------------------ Save Profile ------------------ */
    saveProfileBtn?.addEventListener("click", async () => {
        try {
            let imageUrl = profilePreview.src || DEFAULT_PROFILE_IMG;
            const bio = bioInput.value.trim();

            const { error } = await client
                .from("user_profiles")
                .update({ profile_image_url: imageUrl, bio })
                .eq("user_id", currentUserId);

            if (error) throw error;

            showPopup("Profile updated successfully!", "success");
            profilePopup.classList.add("hidden");

            fetchCurrentUserAvatar();
        } catch (err) {
            console.error("Error updating profile:", err.message);
            showPopup("Failed to update profile.", "error");
        }
    });

    /* ------------------ Logout ------------------ */
    logoutBtn?.addEventListener("click", async () => {
        await client.auth.signOut();
        showPopup("Logged out!", "info");
        window.location.href = "signup.html";
    });

    /* ------------------ Change Username Modal ------------------ */
    changeUsernameBtn?.addEventListener("click", () => {
        profilePopup.classList.add("hidden");
        usernamePopup.classList.remove("hidden");
    });

    closeUsername?.addEventListener("click", () => {
        usernamePopup.classList.add("hidden");
    });

    cancelUsername?.addEventListener("click", () => {
        usernamePopup.classList.add("hidden");
    });

    saveUsernameBtn?.addEventListener("click", async () => {
        const newUsername = newUsernameInput.value.trim();
        if (!newUsername) {
            showPopup("Username cannot be empty!", "error");
            return;
        }

        try {
            const { error } = await client
                .from("user_profiles")
                .update({ username: newUsername })
                .eq("user_id", currentUserId);

            if (error) throw error;

            showPopup("Username updated!", "success");
            profileUsername.textContent = newUsername;
            usernamePopup.classList.add("hidden");
        } catch (err) {
            console.error("Error updating username:", err.message);
            showPopup("Failed to update username.", "error");
        }
    });

    getCurrentUser().then(() => {
        fetchFriends();
        fetchFriendRequests();
        subscribeToGlobalMessages();
        checkUrlForChatId();
    });
});