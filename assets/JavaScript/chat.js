import { client } from "../../supabase.js";

document.addEventListener("DOMContentLoaded", async () => {
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

        let avatarUrl = './assets/icon/download.jpeg'; // fallback
        if (!profileError && profile?.profile_image_url) avatarUrl = profile.profile_image_url;

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
            return;
        }
        currentUserId = user.id;
        console.log("Current user ID:", currentUserId);
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

    function addMessage(text, requestId, senderId) {
        if (!messages.some(m => m.requestId === requestId)) {
            messages.push({ text, time: new Date().toLocaleTimeString(), requestId, senderId });
            renderMessages();
        }
    }

    document.getElementById("message")?.addEventListener("click", () => {
        const popup = document.getElementById("message-popup");
        if (popup) {
            popup.style.display = popup.style.display === "block" ? "none" : "block";
        }
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
            .select("id, sender_id, status, user_profiles!requests_sender_id_fkey(user_name)")
            .eq("receiver_id", currentUserId)
            .eq("status", "pending");

        if (error) {
            console.error("Error fetching requests:", error.message);
            return;
        }

        messages = []; // reset old messages

        if (requests) {
            requests.forEach(req => {
                addMessage(
                    `${req.user_profiles?.user_name || "Unknown"} sent you a friend request`,
                    req.id,
                    req.sender_id
                );
            });
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

            const { data: profile } = await client
                .from("user_profiles")
                .select("user_name, avatar_url")
                .eq("user_id", friendId)
                .maybeSingle();

            const li = document.createElement("li");
            li.classList.add("chat");
            li.innerHTML = `
            <img src="${profile?.avatar_url || './assets/icon/user.png'}" alt="User">
            <div>
                <h4>${profile?.user_name || 'Unknown'}</h4>
                <p>Say hi! 👋</p>
            </div>
            <span class="time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        `;

            li.addEventListener("click", () => openChat(li, friendId, profile?.user_name));
            chatList.appendChild(li);
        }
    }

    /* ------------------ Send Friend Request ------------------ */
    async function sendFriendRequest(username) {
        if (!username) return alert("Enter a username");

        const { data: userData } = await client
            .from("user_profiles")
            .select("user_id,user_name")
            .eq("user_name", username)
            .maybeSingle();

        if (!userData) return alert("User not found");
        if (userData.user_id === currentUserId) return alert("Cannot send request to yourself");

        const { data: existing } = await client
            .from("requests")
            .select("*")
            .or(
                `and(sender_id.eq.${currentUserId},receiver_id.eq.${userData.user_id}),` +
                `and(sender_id.eq.${userData.user_id},receiver_id.eq.${currentUserId})`
            )
            .maybeSingle();

        if (existing) return alert("Request already exists!");

        await client.from("requests").insert([{
            sender_id: currentUserId,
            receiver_id: userData.user_id,
            status: "pending"
        }]);

        alert(`Friend request sent to ${userData.user_name}!`);
        fetchFriendRequests();
    }

    /* ------------------ Accept / Reject ------------------ */
    async function acceptRequest(requestId, senderId) {
        await client.from("requests").update({ status: "accepted" }).eq("id", requestId);
        await client.from("friends").insert([{ user1_id: currentUserId, user2_id: senderId }]);
        fetchFriends();
    }

    async function rejectRequest(requestId) {
        await client.from("requests").update({ status: "rejected" }).eq("id", requestId);
    }

    /* ------------------ Open Chat ------------------ */
    function openChat(li, friendId, friendName) {
        const chatContainer = document.querySelector(".chat-area");
        const sidebar = document.querySelector('.sidebar');
        const chatArea = document.querySelector('.chat-area');
        const chatLi = document.querySelectorAll('.chat');
        if (!chatContainer) return;

        chatLi.forEach(chat => {
            chat.addEventListener('click', () => {
                chatContainer.innerHTML = `
        <div class="chat-header">
            <button class="backBtn"><i class="fa-solid fa-backward"></i></button>
            <img src="${li.querySelector('img')?.src || ''}" alt="User">
            <div>
                <h4>${friendName || 'Unknown'}</h4>
                <p>Online</p>
            </div>
        </div>
        <div class="messages">
            <div class="message received">Hello ${friendName || 'User'}! 👋</div>
        </div>
        <div class="chat-input">
            <input type="text" placeholder="Type a message...">
            <button>➤</button>
        </div>
    `;

                const backBtn = chatContainer.querySelector('.backBtn');
                if (backBtn) {
                    backBtn.addEventListener('click', () => {
                        sidebar.style.display = 'flex';
                        chatArea.style.display = 'none';
                    });
                }
            });
        });
    }

    /* ------------------ Button Listener ------------------ */
    document.querySelector(".submit-friend")?.addEventListener("click", () => {
        const username = document.querySelector(".friend-input").value.trim();
        sendFriendRequest(username);
    });

    /* ------------------ Initial Load ------------------ */
    await getCurrentUser();
    fetchFriendRequests();
    fetchFriends();
});
