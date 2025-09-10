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
            alert("User not logged in");
            window.location.href = 'signup.html';
            return;
        }
        currentUserId = user.id;
        console.log("Current user ID:", currentUserId);

        // Set user online
        setUserOnlineStatus(true);
    }

    /* ------------------ Set User Online/Offline ------------------ */
    async function setUserOnlineStatus(isOnline) {
        if (!currentUserId) return;
        await client.from('user_profiles')
            .upsert({ user_id: currentUserId, is_online: isOnline }, { onConflict: 'user_id' });
    }
    window.addEventListener('beforeunload', () => setUserOnlineStatus(false));

    /* ------------------ Accept / Reject Friend Requests ------------------ */
    async function acceptRequest(requestId, senderId) {
        if (!requestId) return;

        const { error } = await client
            .from("requests")
            .update({ status: "accepted" })
            .eq("id", requestId);

        if (error) return console.error("Error accepting request:", error.message);

        const { error: friendError } = await client.from("friends").insert([
            { user1_id: currentUserId, user2_id: senderId }
        ]);
        if (friendError) console.error("Error adding friend:", friendError.message);

        alert("Friend request accepted!");
        fetchFriends(); // Refresh friend list
    }

    async function rejectRequest(requestId) {
        if (!requestId) return;

        const { error } = await client
            .from("requests")
            .update({ status: "rejected" })
            .eq("id", requestId);

        if (error) return console.error("Error rejecting request:", error.message);

        alert("Friend request rejected!");
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
                <input type="text" placeholder="Type a message...">
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
                </div>
            `;

            li.addEventListener("click", () => openChat(friendId, friendName, avatarUrl));
            chatList.appendChild(li);
        }
    }

    /* ------------------ Initial Load ------------------ */
    await getCurrentUser();
    fetchFriendRequests();
    fetchFriends();
});
