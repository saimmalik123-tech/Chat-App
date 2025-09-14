import { client } from "../../supabase.js";

document.addEventListener("DOMContentLoaded", async () => {

    /* ------------------ Current User Avatar ------------------ */
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

            let avatarUrl = './assets/icon/download.jpeg';
            if (!profileError && profile?.profile_image_url) {
                avatarUrl = profile.profile_image_url;
            }

            profileImage.src = avatarUrl;
        } catch (err) {
            console.error("fetchCurrentUserAvatar:", err);
        }
    }
    await fetchCurrentUserAvatar();

    let currentUserId = null;
    let messages = [];
    let activeChannels = {}; // store active channels per friendId for cleanup

    /* ------------------ Get Current User ------------------ */
    async function getCurrentUser() {
        try {
            const { data: { user }, error } = await client.auth.getUser();
            if (error || !user) {
                showPopup && showPopup("User not logged in", "error");
                window.location.href = 'signup.html';
                return false;
            }
            currentUserId = user.id;
            console.log("Current user ID:", currentUserId);

            await setUserOnlineStatus(true);
            return true;
        } catch (err) {
            console.error("getCurrentUser:", err);
            return false;
        }
    }

    /* ------------------ Accept / Reject Friend Request ------------------ */
    async function acceptRequest(requestId, senderId) {
        try {
            const { error: updateError } = await client
                .from("requests")
                .update({ status: "accepted" })
                .eq("id", requestId);

            if (updateError) {
                console.error("Error updating request:", updateError.message);
                return showPopup && showPopup("Failed to accept request.");
            }

            const { error: insertError } = await client
                .from("friends")
                .insert([{ user1_id: currentUserId, user2_id: senderId }]);

            if (insertError) {
                console.error("Error inserting into friends:", insertError.message);
                return showPopup && showPopup("Failed to add friend.");
            }

            showPopup && showPopup("Friend request accepted!", "success");
            fetchFriends();

        } catch (err) {
            console.error("Unexpected error:", err.message);
        }
    }

    async function rejectRequest(requestId) {
        try {
            const { error } = await client
                .from("requests")
                .update({ status: "rejected" })
                .eq("id", requestId);

            if (error) {
                console.error("Error rejecting request:", error.message);
                return showPopup && showPopup("Failed to reject request.", "error");
            }

            showPopup && showPopup("Friend request rejected!", "info");
            // optionally refresh requests
            fetchFriendRequests();
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

    /* ------------------ Messages Popup UI ------------------ */
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

        unreadBadge.textContent = messages.length || "";
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

        try {
            const { data: requests, error } = await client
                .from("requests")
                .select("id, sender_id, status, private_users!requests_sender_id_fkey(name)")
                .eq("receiver_id", currentUserId)
                .eq("status", "pending");

            if (error) {
                console.error("Error fetching requests:", error.message);
                return;
            }

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
                }
            }
        } catch (err) {
            console.error("fetchFriendRequests:", err);
        }
    }

    function updateUnseenBadge(friendId, count) {
        const badge = document.querySelector(`.chat[data-friend-id="${friendId}"] .non-seen-msg`);
        if (badge) {
            badge.textContent = count > 0 ? count : '';
        } else if (count > 0) {
            const chatLi = document.querySelector(`.chat[data-friend-id="${friendId}"]`);
            if (chatLi) {
                const p = document.createElement('p');
                p.className = 'non-seen-msg';
                p.textContent = count;
                chatLi.appendChild(p);
            }
        }
    }

    /* ------------------ Fetch Friends / Chat List ------------------ */
    async function fetchFriends() {
        if (!currentUserId) return;

        try {
            const { data: friends, error } = await client
                .from("friends")
                .select("*")
                .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`);

            if (error) {
                console.error("Error fetching friends:", error);
                return;
            }

            const chatList = document.querySelector(".chat-list");
            if (!chatList) return;
            chatList.innerHTML = "";

            for (const f of friends) {
                const friendId = f.user1_id === currentUserId ? f.user2_id : f.user1_id;

                const { data: userProfile } = await client
                    .from("user_profiles")
                    .select("user_name, profile_image_url, is_online")
                    .eq("user_id", friendId)
                    .maybeSingle();

                const friendName = userProfile?.user_name || "Unknown";
                const avatarUrl = userProfile?.profile_image_url || "./assets/icon/user.png";

                // Fetch last message
                const { data: lastMsgs } = await client
                    .from("messages")
                    .select("*")
                    .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
                    .order("created_at", { ascending: false })
                    .limit(1);

                const lastMsgData = lastMsgs?.[0];
                const lastMessageText = lastMsgData?.content || "Say hi! 👋";
                const lastMessageTime = lastMsgData
                    ? new Date(lastMsgData.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                const { count: unseenCount, error: unseenError } = await client
                    .from("messages")
                    .select("*", { count: "exact", head: true })
                    .eq("sender_id", friendId)
                    .eq("receiver_id", currentUserId)
                    .eq("seen", false);

                if (unseenError) console.error("Error fetching unseen messages:", unseenError);

                const li = document.createElement("li");
                li.classList.add("chat");
                li.setAttribute("data-friend-id", friendId);
                li.innerHTML = `
                <div class="avatar-wrapper" style="position:relative;">
                    <img src="${avatarUrl}" alt="User" style="object-fit: cover; border-radius:50%; width:48px; height:48px;">
                    ${userProfile?.is_online ? '<span class="online-dot"></span>' : ''}
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
                        document.querySelector('#message')?.classList.add("hidden");
                    }
                });

                chatList.appendChild(li);
            }
        } catch (err) {
            console.error("fetchFriends:", err);
        }
    }

    /* ------------------ Send Message ------------------ */
    async function sendMessage(friendId, content) {
        if (!content.trim()) return;

        try {
            const { error } = await client.from("messages").insert([{
                sender_id: currentUserId,
                receiver_id: friendId,
                content
            }]);
            if (error) console.error("Error sending message:", error.message);
        } catch (err) {
            console.error("sendMessage:", err);
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
                // nothing to do
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

            // update local oldMessages to reflect seen status
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
        if (!currentUserId) return [];
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
            console.error("fetchMessages:", err);
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

            msgDiv.innerHTML = `
            ${!isMe ? `<img src="${friendAvatar}" class="msg-avatar" style="width:25px;height:25px;border-radius:50%;margin-right:6px;">` : ""}
            <span class="msg-content">${escapeHtml(msg.content)}</span>
        `;

            if (isMe) {
                msgDiv.innerHTML += `<small class="seen-status">${msg.seen ? "✓✓" : "✓"}</small>`;
            }

            chatBox.appendChild(msgDiv);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // basic escaping to avoid potential HTML injection
    function escapeHtml(str = "") {
        return String(str).replace(/[&<>"']/g, (s) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[s]));
    }

    // Send Friend Request
    async function sendFriendRequest(username) {
        if (!username) return showPopup && showPopup("Enter a username.");

        try {
            const { data: user, error: userError } = await client
                .from("user_profiles")
                .select("user_id")
                .eq("user_name", username)
                .maybeSingle();

            if (userError || !user) return showPopup && showPopup("User not found.");

            const receiverId = user.user_id;

            const { error: requestError } = await client
                .from("requests")
                .insert([{ sender_id: currentUserId, receiver_id: receiverId, status: "pending" }]);

            if (requestError) return showPopup && showPopup("Failed to send friend request: " + requestError.message);

            showPopup && showPopup("Friend request sent!");
        } catch (err) {
            console.error("sendFriendRequest:", err);
        }
    }

    /* ---------------- RealTime Update ---------------- */
    async function subscribeToMessages(friendId, chatBox, oldMessages, friendAvatar, typingIndicator) {
        if (!currentUserId) return {};
        try {
            function upsertMessageAndRender(oldMessagesArr, msgObj) {
                const idx = oldMessagesArr.findIndex(m => m.id === msgObj.id);
                if (idx === -1) oldMessagesArr.push(msgObj);
                else oldMessagesArr[idx] = { ...oldMessagesArr[idx], ...msgObj };
                renderChatMessages(chatBox, oldMessagesArr, friendAvatar);
            }

            // Ensure we don't create duplicate channels for same friend
            if (activeChannels[friendId]) {
                // already subscribed
                return activeChannels[friendId];
            }

            /* ---------------- Messages Channel ---------------- */
            const msgChannelName = `chat:${[currentUserId, friendId].sort().join(":")}`;
            const msgChannel = client.channel(msgChannelName)
                .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async payload => {
                    const newMsg = payload.new;
                    const isRelevant =
                        (newMsg.sender_id === currentUserId && newMsg.receiver_id === friendId) ||
                        (newMsg.sender_id === friendId && newMsg.receiver_id === currentUserId);
                    if (!isRelevant) return;

                    // add and render
                    upsertMessageAndRender(oldMessages, newMsg);

                    // auto mark as seen if I received it
                    if (newMsg.receiver_id === currentUserId && newMsg.sender_id === friendId) {
                        try {
                            await client.from("messages").update({ seen: true }).eq("id", newMsg.id);
                        } catch (err) {
                            console.error("Error marking seen on new msg:", err.message);
                        }
                    }
                })
                .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, payload => {
                    const updated = payload.new;
                    const isRelevant =
                        (updated.sender_id === currentUserId && updated.receiver_id === friendId) ||
                        (updated.sender_id === friendId && updated.receiver_id === currentUserId);
                    if (!isRelevant) return;

                    upsertMessageAndRender(oldMessages, updated);
                });

            /* ---------------- Typing Channel ---------------- */
            const typingChannelName = `typing:${[currentUserId, friendId].sort().join(":")}`;
            const typingChannel = client.channel(typingChannelName)
                .on("broadcast", { event: "typing" }, payload => {
                    // only show typing if payload.userId is the friend (not me)
                    if (payload.userId === friendId) {
                        typingIndicator.textContent = `${payload.userName || "Friend"} is typing...`;
                        // revert to online/offline after short delay
                        setTimeout(async () => {
                            try {
                                const { data: profile } = await client
                                    .from("user_profiles")
                                    .select("is_online")
                                    .eq("user_id", friendId)
                                    .maybeSingle();
                                typingIndicator.textContent = profile?.is_online ? "Online" : "Offline";
                            } catch (err) {
                                console.error("typingIndicator fetch error:", err);
                            }
                        }, 1500);
                    }
                });

            /* ---------------- Status Channel ---------------- */
            const statusChannelName = `user_status:${friendId}`;
            const statusChannel = client.channel(statusChannelName)
                .on("postgres_changes",
                    {
                        event: "*",
                        schema: "public",
                        table: "user_profiles",
                        filter: `user_id=eq.${friendId}`
                    },
                    payload => {
                        typingIndicator.textContent = payload.new?.is_online ? "Online" : "Offline";
                    }
                );

            // Subscribe all channels (await ensures subscription established)
            await msgChannel.subscribe();
            await typingChannel.subscribe();
            await statusChannel.subscribe();

            // store channels for cleanup
            activeChannels[friendId] = { msgChannel, typingChannel, statusChannel };
            return activeChannels[friendId];

        } catch (err) {
            console.error("subscribeToMessages error:", err);
            return {};
        }
    }

    /* ------------------ Open Chat ------------------ */
    async function openChat(friendId, friendName, friendAvatar) {
        const chatContainer = document.querySelector(".chat-area");
        const sidebar = document.querySelector('.sidebar');
        if (!chatContainer) return;

        if (window.innerWidth <= 768 && sidebar) {
            sidebar.style.display = 'none';
            chatContainer.style.display = 'flex';
        }

        chatContainer.innerHTML = `
    <div class="chat-header">
        <button class="backBtn"><i class="fa-solid fa-backward"></i></button>
        <img src="${friendAvatar || './assets/icon/user.png'}" alt="User" style="object-fit:cover; width:48px; height:48px;">
        <div>
            <h4>${friendName || 'Unknown'}</h4>
            <p id="typing-indicator">Offline</p>
        </div>
    </div>
    <div class="messages"></div>
    <div class="chat-input" style="position:relative;">
        <i class="fa-regular fa-face-smile" id='emoji-btn' style="cursor:pointer"></i>
        <input id='input' type="text" placeholder="Type a message..." inputmode="text" autocomplete="off" />
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
        const backBtn = chatContainer.querySelector('.backBtn');

        // Guard
        if (!input || !sendBtn || !chatBox) return;

        /* ---------------- Emoji Picker ---------------- */
        const stopPropagation = (e) => e.stopPropagation();
        emojiBtn.addEventListener("click", (e) => { e.stopPropagation(); emojiPicker.style.display = emojiPicker.style.display === "none" ? "block" : "none"; });
        emojiPicker.addEventListener("click", stopPropagation);
        const outsideClickHandler = () => { emojiPicker.style.display = 'none'; };
        window.addEventListener('click', outsideClickHandler);

        emojiPicker.addEventListener("emoji-click", event => {
            input.value += event.detail?.unicode || "";
            input.focus();
            sendBtn.disabled = !input.value.trim();
        });

        /* ---------------- Messages + Realtime ---------------- */
        const oldMessages = await fetchMessages(friendId);
        renderChatMessages(chatBox, oldMessages, friendAvatar);

        // subscribe with stable channels
        const channels = await subscribeToMessages(friendId, chatBox, oldMessages, friendAvatar, typingIndicator);
        const msgChannel = channels?.msgChannel;
        const typingChannel = channels?.typingChannel;
        const statusChannel = channels?.statusChannel;

        // Mark unseen as seen after loading
        await markMessagesAsSeen(friendId, chatBox, oldMessages, friendAvatar);

        /* ---------------- Typing Broadcast (debounced) ---------------- */
        let typingTimeout = null;
        const typingDebounce = 1000; // ms

        const broadcastTyping = async () => {
            if (!typingChannel) return;
            try {
                // Use channel.send with type broadcast
                await typingChannel.send({
                    type: "broadcast",
                    event: "typing",
                    payload: { userId: currentUserId, userName: "You" }
                });
            } catch (err) {
                console.error("broadcastTyping error:", err);
            }
        };

        const onInput = () => {
            sendBtn.disabled = !input.value.trim();

            // debounce the typing broadcast to avoid spam
            if (typingTimeout) clearTimeout(typingTimeout);
            typingTimeout = setTimeout(broadcastTyping, typingDebounce);
        };

        input.addEventListener("input", onInput);

        /* ---------------- Send Button / Enter ---------------- */
        async function handleSend() {
            const content = input.value.trim();
            if (!content) return;
            // append locally instantly
            const tempMsg = {
                id: `temp-${Date.now()}`,
                sender_id: currentUserId,
                receiver_id: friendId,
                content,
                created_at: new Date().toISOString(),
                seen: false
            };
            oldMessages.push(tempMsg);
            renderChatMessages(chatBox, oldMessages, friendAvatar);
            chatBox.scrollTop = chatBox.scrollHeight;

            input.value = "";
            sendBtn.disabled = true;

            // send to server
            await sendMessage(friendId, content);

            // after sending, let realtime INSERT update the local item (replace temp id)
            // (The INSERT listener will insert the real message once DB saved)
        }

        sendBtn.addEventListener("click", handleSend);
        const onKeyPress = (e) => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } };
        input.addEventListener("keypress", onKeyPress);

        /* ---------------- Back Button & Cleanup ---------------- */
        const cleanup = async () => {
            // remove event listeners we attached
            input.removeEventListener("input", onInput);
            sendBtn.removeEventListener("click", handleSend);
            input.removeEventListener("keypress", onKeyPress);
            emojiPicker.removeEventListener("emoji-click", () => { });
            emojiPicker.removeEventListener("click", stopPropagation);
            emojiBtn.removeEventListener("click", () => { });
            window.removeEventListener('click', outsideClickHandler);

            // remove channels
            try {
                if (msgChannel) await client.removeChannel(msgChannel);
                if (typingChannel) await client.removeChannel(typingChannel);
                if (statusChannel) await client.removeChannel(statusChannel);
            } catch (err) {
                console.warn("Error while removing channels:", err);
            }

            // clear stored channel ref
            delete activeChannels[friendId];
        };

        if (backBtn) {
            backBtn.addEventListener('click', async () => {
                if (sidebar) sidebar.style.display = 'flex';
                chatContainer.style.display = 'none';
                await cleanup();
            });
        }
    }

    /* ------------------ Button Listener ------------------ */
    document.querySelector(".submit-friend")?.addEventListener("click", () => {
        const username = document.querySelector(".friend-input").value.trim();
        sendFriendRequest(username);
    });

    /* ------------------ Initial Load ------------------ */
    const ok = await getCurrentUser();
    if (ok) {
        await fetchFriendRequests();
        await fetchFriends();
    }

});