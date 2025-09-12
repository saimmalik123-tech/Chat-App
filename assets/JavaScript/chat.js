import { client } from "../../supabase.js";

document.addEventListener("DOMContentLoaded", async () => {

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

        // Set user online
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


    /* ------------------ Set User Online/Offline ------------------ */
    async function setUserOnlineStatus(isOnline) {
        if (!currentUserId) return;
        await client.from('user_profiles')
            .upsert({ user_id: currentUserId, is_online: isOnline }, { onConflict: 'user_id' });
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
    }

    /* ------------------ Fetch Friends / Chat List ------------------ */
    async function fetchFriends() {
        if (!currentUserId) return;

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
            const isOnline = userProfile?.is_online ? "Online" : "Offline";

            const { data: lastMsgData } = await client
                .from("messages")
                .select("*")
                .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            const lastMessageText = lastMsgData?.content || "Say hi! 👋";
            const lastMessageTime = lastMsgData
                ? new Date(lastMsgData.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            const li = document.createElement("li");
            li.classList.add("chat");
            li.setAttribute("data-friend-id", friendId);
            li.innerHTML = `
                <div class="avatar-wrapper" style="position:relative;">
                    <img src="${avatarUrl}" alt="User" style="object-fit: cover; border-radius:50%;">
                    ${userProfile?.is_online ? '<span class="online-dot"></span>' : ''}
                </div>
                <div>
                    <h4>${friendName}</h4>
                    <p class="last-message" title="${lastMessageText}">${lastMessageText}</p>
                </div>
                <span class="time">${lastMessageTime}</span>
            `;

            li.addEventListener("click", () => {
                openChat(friendId, friendName, avatarUrl);
                if (innerWidth <= 700) {
                    document.querySelector('#message').classList.add("hidden");
                }
            });
            chatList.appendChild(li);
        }
    }

    /* ------------------ Send Message ------------------ */
    async function sendMessage(friendId, content) {
        if (!content.trim()) return;

        const { error } = await client.from("messages").insert([{
            sender_id: currentUserId,
            receiver_id: friendId,
            content
        }]);
        if (error) console.error("Error sending message:", error.message);
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

    /* ------------------ Render Chat Messages ------------------ */
    function renderChatMessages(chatBox, msgs, friendAvatar) {
        chatBox.innerHTML = "";
        msgs.forEach(msg => {
            const isMe = msg.sender_id === currentUserId;
            const msgDiv = document.createElement("div");
            msgDiv.className = `message ${isMe ? "sent" : "received"}`;
            msgDiv.innerHTML = `
                ${!isMe ? `<img src="${friendAvatar}" class="msg-avatar" style="width:25px;height:25px;border-radius:50%;margin-right:6px;">` : ""}
                <span>${msg.content}</span>
            `;
            chatBox.appendChild(msgDiv);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Send Friend Request

    async function sendFriendRequest(username) {
        if (!username) return showPopup("Enter a username.");

        const { data: user, error: userError } = await client
            .from("user_profiles")
            .select("user_id")
            .eq("user_name", username)
            .maybeSingle();

        if (userError || !user) return showPopup("User not found.");

        const receiverId = user.user_id;

        const { error: requestError } = await client
            .from("requests")
            .insert([{ sender_id: currentUserId, receiver_id: receiverId, status: "pending" }]);

        if (requestError) return showPopup("Failed to send friend request: " + requestError.message);

        showPopup("Friend request sent!");
    }


    /* ------------------ Realtime Messages & Online Status ------------------ */

    function subscribeToMessages(friendId, chatBox, oldMessages, friendAvatar, typingIndicator) {

        // Realtime messages
        client.channel(`chat:${currentUserId}:${friendId}`)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, payload => {
                const newMsg = payload.new;
                if ((newMsg.sender_id === currentUserId && newMsg.receiver_id === friendId) ||
                    (newMsg.sender_id === friendId && newMsg.receiver_id === currentUserId)) {

                    oldMessages.push(newMsg);
                    renderChatMessages(chatBox, oldMessages, friendAvatar);
                }
            }).subscribe();

        client.channel(`typing:${currentUserId}:${friendId}`)
            .on("broadcast", { event: "typing" }, payload => {
                if (payload.userId === friendId) {
                    typingIndicator.textContent = `${payload.userName || "Friend"} is typing...`;
                    setTimeout(async () => {
                        // After typing, show online/offline
                        const { data: profile } = await client
                            .from('user_profiles')
                            .select('is_online')
                            .eq('user_id', friendId)
                            .maybeSingle();
                        typingIndicator.textContent = profile?.is_online ? "Online" : "Offline";
                    }, 1500);
                }
            }).subscribe();

        client.channel('user_status')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_profiles' }, payload => {
                const updatedUser = payload.new;
                if (updatedUser.user_id === friendId) {
                    typingIndicator.textContent = updatedUser.is_online ? "Online" : "Offline";
                }
            }).subscribe();
    }

    /* ------------------ Open Chat ------------------ */
    async function openChat(friendId, friendName, friendAvatar) {
        const chatContainer = document.querySelector(".chat-area");
        const sidebar = document.querySelector('.sidebar');
        if (!chatContainer) return;

        if (window.innerWidth <= 700) {
            sidebar.style.display = 'none';
            chatContainer.style.display = 'flex';
        }

        chatContainer.innerHTML = `
            <div class="chat-header">
                <button class="backBtn"><i class="fa-solid fa-backward"></i></button>
                <img src="${friendAvatar || './assets/icon/user.png'}" alt="User" style="object-fit:cover;">
                <div>
                    <h4>${friendName || 'Unknown'}</h4>
                    <p id="typing-indicator">Online</p>
                </div>
            </div>
            <div class="messages"></div>
            <div class="chat-input">
                <input type="text" placeholder="Type a message..." inputmode="none" >
                <button disabled class='sendBtn'>➤</button>
            </div>
        `;

        const chatBox = chatContainer.querySelector(".messages");
        const typingIndicator = chatContainer.querySelector("#typing-indicator");
        const input = chatContainer.querySelector("input");
        const sendBtn = chatContainer.querySelector(".sendBtn");

        const oldMessages = await fetchMessages(friendId);
        renderChatMessages(chatBox, oldMessages, friendAvatar);

        subscribeToMessages(friendId, chatBox, oldMessages, friendAvatar, typingIndicator);

        input.addEventListener("input", () => {
            sendBtn.disabled = !input.value.trim();
            client.channel(`typing:${currentUserId}:${friendId}`).send({
                type: "broadcast",
                event: "typing",
                payload: { userId: currentUserId, userName: "You" }
            });
        });

        async function handleSend() {
            const content = input.value.trim();
            if (!content) return;
            await sendMessage(friendId, content);
            input.value = "";
            sendBtn.disabled = true;
        }

        sendBtn.addEventListener("click", handleSend);
        input.addEventListener("keypress", e => { if (e.key === "Enter") handleSend(); });

        const backBtn = chatContainer.querySelector('.backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                sidebar.style.display = 'flex';
                chatContainer.style.display = 'none';
            });
        }
    }

    /* ------------------ Button Listener ------------------ */
    document.querySelector(".submit-friend")?.addEventListener("click", () => {
        const username = document.querySelector(".friend-input").value.trim();
        sendFriendRequest(username);
    });

    // Modal PopUp

    function showPopup(message, type = "info") {
        const popup = document.getElementById("popup");
        const msgBox = document.getElementById("popup-message");
        popup.className = `popup ${type}`; // add type (success, error, info)
        msgBox.textContent = message;
        popup.classList.remove("hidden");

        setTimeout(() => popup.classList.add("hidden"), 3000);
    }

    document.querySelector(".popup-close").addEventListener("click", () => {
        document.getElementById("popup").classList.add("hidden");
    });


    /* ------------------ Initial Load ------------------ */
    await getCurrentUser();
    fetchFriendRequests();
    fetchFriends();
});
