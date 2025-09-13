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
    let statusChannelRef = null;


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

    function updateUnseenBadge(friendId, count) {
        const badge = document.querySelector(`.chat[data-friend-id="${friendId}"] .non-seen-msg`);
        if (badge) {
            badge.textContent = count > 0 ? count : '';
        } else if (count > 0) {
            // if badge doesn't exist, create it
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
                <img src="${avatarUrl}" alt="User" style="object-fit: cover; border-radius:50%;">
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

            msgDiv.innerHTML = `
            ${!isMe ? `<img src="${friendAvatar}" class="msg-avatar" style="width:25px;height:25px;border-radius:50%;margin-right:6px;">` : ""}
            <span>${msg.content}</span>
        `;

            if (isMe) {
                msgDiv.innerHTML += `<small class="seen-status">${msg.seen ? "✓✓" : "✓"}</small>`;
            }

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


    /* ---------------- RealTime Update ---------------- */
    async function subscribeToMessages(friendId, chatBox, oldMessages, friendAvatar, typingIndicator) {
        function upsertMessageAndRender(oldMessages, msgObj, chatBox, friendAvatar) {
            const idx = oldMessages.findIndex(m => m.id === msgObj.id);
            if (idx === -1) oldMessages.push(msgObj);
            else oldMessages[idx] = { ...oldMessages[idx], ...msgObj };
            renderChatMessages(chatBox, oldMessages, friendAvatar);
        }

        /* ---------------- Messages Channel ---------------- */
        const msgChannel = client.channel(`chat:${currentUserId}:${friendId}`);
        msgChannel.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async payload => {
            const newMsg = payload.new;
            const isRelevant =
                (newMsg.sender_id === currentUserId && newMsg.receiver_id === friendId) ||
                (newMsg.sender_id === friendId && newMsg.receiver_id === currentUserId);
            if (!isRelevant) return;

            oldMessages.push(newMsg);
            renderChatMessages(chatBox, oldMessages, friendAvatar);

            // auto mark as seen if I received it
            if (newMsg.receiver_id === currentUserId && newMsg.sender_id === friendId) {
                try {
                    await client.from("messages").update({ seen: true }).eq("id", newMsg.id);
                } catch (err) {
                    console.error("Error marking seen:", err.message);
                }
            }
        });

        msgChannel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, payload => {
            const updated = payload.new;
            const isRelevant =
                (updated.sender_id === currentUserId && updated.receiver_id === friendId) ||
                (updated.sender_id === friendId && updated.receiver_id === currentUserId);
            if (!isRelevant) return;

            upsertMessageAndRender(oldMessages, updated, chatBox, friendAvatar);
        });

        /* ---------------- Typing Channel ---------------- */
        const typingChannel = client.channel(`typing:${currentUserId}:${friendId}`)
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
            await client.removeChannel(statusChannelRef); // ✅ properly cleanup previous
        }

        statusChannelRef = client.channel("user_status")
            .on("postgres_changes",
                { event: "UPDATE", schema: "public", table: "user_profiles" },
                payload => {
                    if (payload.new.user_id === friendId) {
                        typingIndicator.textContent = payload.new.is_online ? "Online" : "Offline";
                    }
                }
            );

        /* ---------------- Subscribe ---------------- */
        await msgChannel.subscribe();
        await typingChannel.subscribe();
        await statusChannelRef.subscribe();

        // return channels so you can cleanup later if needed
        return { msgChannel, typingChannel, statusChannelRef };
    }

    /* ------------------ Open Chat (complete with realtime + calls) ------------------ */
async function openChat(friendId, friendName, friendAvatar) {
    const chatContainer = document.querySelector(".chat-area");
    const sidebar = document.querySelector('.sidebar');
    if (!chatContainer) return;

    if (window.innerWidth <= 768) {
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
        <div class="call-actions">
            <button id="voiceCallBtn" title="Voice call"><i class="fa-solid fa-phone"></i></button>
            <button id="videoCallBtn" title="Video call"><i class="fa-solid fa-video"></i></button>
        </div>
    </div>
    <div class="messages"></div>

    <!-- Video Call UI -->
    <div class="video-call" style="display:none; position:fixed; inset:0; background:#000; flex-direction:column; justify-content:center; align-items:center; z-index:2000;">
        <video id="remoteVideo" autoplay playsinline style="width:90%; max-height:80%; border-radius:10px;"></video>
        <video id="localVideo" autoplay muted playsinline style="width:28%; max-width:240px; border:2px solid #fff; border-radius:10px; position:absolute; bottom:18px; right:18px; object-fit:cover;"></video>
        <button id="endCallBtn" style="margin-top:20px; background:red; color:white; border:none; padding:12px 18px; border-radius:50%; font-size:20px;">
            <i class="fa-solid fa-phone-slash"></i>
        </button>
    </div>

    <div class="chat-input" style="position:relative;">
        <i class="fa-regular fa-face-smile" id='emoji-btn'></i>
        <input id='input' type="text" placeholder="Type a message..." inputmode="text">
        <button disabled class='sendBtn'>➤</button>
        <emoji-picker id="emoji-picker" style="position:absolute; bottom:50px; left:0; display:none; z-index:1000;"></emoji-picker>
    </div>
    `;

    /* ---------------- DOM refs ---------------- */
    const emojiBtn = chatContainer.querySelector("#emoji-btn");
    const emojiPicker = chatContainer.querySelector("#emoji-picker");
    const input = chatContainer.querySelector("input");
    const sendBtn = chatContainer.querySelector(".sendBtn");
    const chatBox = chatContainer.querySelector(".messages");
    const typingIndicator = chatContainer.querySelector("#typing-indicator");
    const voiceCallBtn = chatContainer.querySelector("#voiceCallBtn");
    const videoCallBtn = chatContainer.querySelector("#videoCallBtn");
    const videoCallContainer = chatContainer.querySelector(".video-call");
    const localVideo = chatContainer.querySelector("#localVideo");
    const remoteVideo = chatContainer.querySelector("#remoteVideo");
    const endCallBtn = chatContainer.querySelector("#endCallBtn");

    /* ---------------- Emoji Picker ---------------- */
    emojiBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        emojiPicker.style.display = emojiPicker.style.display === "none" ? "block" : "none";
    });
    emojiPicker.addEventListener("click", (e) => e.stopPropagation());
    window.addEventListener('click', () => emojiPicker.style.display = 'none');
    emojiPicker.addEventListener("emoji-click", event => {
        input.value += event.detail.unicode;
        input.focus();
        sendBtn.disabled = !input.value.trim();
    });

    /* ---------------- Messages + Realtime ---------------- */
    const oldMessages = await fetchMessages(friendId);
    renderChatMessages(chatBox, oldMessages, friendAvatar);

    // subscribe to message/typing/status channels (your existing function)
    const { msgChannel, typingChannel, statusChannelRef: statusChan } =
        await subscribeToMessages(friendId, chatBox, oldMessages, friendAvatar, typingIndicator);

    await markMessagesAsSeen(friendId, chatBox, oldMessages, friendAvatar);

    /* ---------------- Typing Broadcast ---------------- */
    input.addEventListener("input", () => {
        sendBtn.disabled = !input.value.trim();
        client.channel(`typing:${currentUserId}:${friendId}`).send({
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

    /* ---------------- Back Button Cleanup ---------------- */
    const backBtn = chatContainer.querySelector('.backBtn');
    backBtn?.addEventListener('click', async () => {
        sidebar.style.display = 'flex';
        chatContainer.style.display = 'none';

        // remove channels created for this chat
        try { if (msgChannel) await client.removeChannel(msgChannel); } catch (e) {}
        try { if (typingChannel) await client.removeChannel(typingChannel); } catch (e) {}
        try { if (statusChan) await client.removeChannel(statusChan); } catch (e) {}

        // also remove callChannel if exists
        try { if (callChannelRef) await client.removeChannel(callChannelRef); } catch (e) {}
        // hang up if in call
        if (currentCall) await endCall(true);
    });

    /* ---------------- Call signaling & WebRTC (per-chat) ---------------- */
    // callChannelRef is used to remove subscription later
    let callChannelRef = null;

    // simple ringtone using WebAudio
    let ringtoneCtx = null, ringtoneOsc = null;
    function playRingtone() {
        try {
            if (ringtoneCtx) return;
            ringtoneCtx = new (window.AudioContext || window.webkitAudioContext)();
            ringtoneOsc = ringtoneCtx.createOscillator();
            const gain = ringtoneCtx.createGain();
            ringtoneOsc.type = 'sine';
            ringtoneOsc.frequency.value = 480;
            gain.gain.value = 0.02;
            ringtoneOsc.connect(gain);
            gain.connect(ringtoneCtx.destination);
            ringtoneOsc.start();
        } catch (err) { console.warn("Ringtone error", err); }
    }
    function stopRingtone() {
        try { if (ringtoneOsc) ringtoneOsc.stop(); if (ringtoneCtx) ringtoneCtx.close(); } catch (e) {}
        ringtoneOsc = null; ringtoneCtx = null;
    }

    // Peer connection state
    let pc = null;
    let localStream = null;
    let remoteStream = null;
    let pendingIce = [];
    let currentCall = null; // { peerId, direction, isVideo }

    // create and configure RTCPeerConnection
    function createPeerConnection(peerId) {
        const config = {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
                // add TURN here for reliability: { urls:"turn:TURN_HOST:3478", username:"u", credential:"p" }
            ]
        };
        const connection = new RTCPeerConnection(config);

        connection.onicecandidate = ev => {
            if (ev.candidate) {
                // send candidate via call_signals table
                client.from("call_signals").insert([{
                    from_id: currentUserId,
                    to_id: peerId,
                    type: "ice",
                    payload: ev.candidate
                }]).catch(e => console.error("send ice error", e));
            }
        };

        connection.ontrack = ev => {
            if (!remoteStream) remoteStream = new MediaStream();
            ev.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
            if (remoteVideo) remoteVideo.srcObject = remoteStream;
        };

        connection.onconnectionstatechange = () => {
            if (!connection) return;
            if (connection.connectionState === "failed" || connection.connectionState === "disconnected") {
                // end if failed
                endCall(true);
            }
        };

        return connection;
    }

    // helper: show incoming-call modal
    let incomingModal = null;
    function ensureIncomingModal() {
        if (incomingModal) return incomingModal;
        incomingModal = document.createElement("div");
        incomingModal.id = "incoming-call-modal";
        incomingModal.style = "position:fixed; inset:0; display:none; align-items:center; justify-content:center; z-index:3000;";
        incomingModal.innerHTML = `
            <div style="background:#fff;border-radius:12px;padding:18px;min-width:300px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.4)">
                <p id="incoming-text" style="font-weight:600;margin-bottom:12px;">Incoming call</p>
                <div style="display:flex;gap:12px;justify-content:center">
                    <button id="incoming-accept" style="background:#16a34a;color:#fff;padding:8px 14px;border-radius:8px;border:none;">Accept</button>
                    <button id="incoming-reject" style="background:#ef4444;color:#fff;padding:8px 14px;border-radius:8px;border:none;">Reject</button>
                </div>
            </div>
        `;
        document.body.appendChild(incomingModal);
        return incomingModal;
    }
    function showIncomingModal(nameOrId) {
        const modal = ensureIncomingModal();
        modal.style.display = "flex";
        modal.querySelector("#incoming-text").textContent = `${nameOrId} is calling...`;
        playRingtone();
    }
    function hideIncomingModal() {
        if (incomingModal) incomingModal.style.display = "none";
        stopRingtone();
    }

    // callChannel subscription that listens for rows where to_id === currentUserId
    // we filter client-side after receiving inserted rows
    async function subscribeCallSignals() {
        // cleanup old if any
        if (callChannelRef) {
            try { await client.removeChannel(callChannelRef); } catch (e) {}
            callChannelRef = null;
        }

        callChannelRef = client.channel(`call_signals_${currentUserId}_${friendId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_signals' }, payload => {
                const sig = payload.new;
                if (!sig) return;
                if (sig.to_id !== currentUserId) return; // only signals to me
                // Process only signals from this friend (ignore others while chat open)
                if (sig.from_id !== friendId) return;

                // handle types
                const type = sig.type;
                const payloadData = sig.payload;
                (async () => {
                    if (type === "offer") {
                        // incoming offer: show modal with accept/reject
                        currentCall = { peerId: friendId, direction: "incoming", isVideo: !!payloadData?.isVideo, offer: payloadData.offer || payloadData };
                        showIncomingModal(friendName || friendId);
                        // wire accept/reject buttons
                        const acceptBtn = incomingModal.querySelector("#incoming-accept");
                        const rejectBtn = incomingModal.querySelector("#incoming-reject");
                        acceptBtn.onclick = async () => {
                            hideIncomingModal();
                            await acceptIncomingCall(payloadData);
                        };
                        rejectBtn.onclick = async () => {
                            hideIncomingModal();
                            await client.from("call_signals").insert([{
                                from_id: currentUserId, to_id: friendId, type: "reject", payload: { reason: "user_rejected" }
                            }]);
                        };
                    } else if (type === "answer") {
                        // remote answered our outgoing call
                        if (pc && payloadData?.answer) {
                            try { await pc.setRemoteDescription(new RTCSessionDescription(payloadData.answer)); } catch (e) { console.error(e); }
                        }
                    } else if (type === "ice") {
                        // ICE candidate from remote
                        try {
                            const cand = new RTCIceCandidate(payloadData);
                            if (pc && pc.remoteDescription && pc.remoteDescription.type) {
                                await pc.addIceCandidate(cand);
                            } else {
                                pendingIce.push(cand);
                            }
                        } catch (e) { console.error("addIce error", e); }
                    } else if (type === "hangup") {
                        // remote ended
                        endCall(false);
                        alert("Call ended");
                    } else if (type === "reject") {
                        // remote rejected our outgoing call
                        stopRingtone();
                        endCall(false);
                        alert("Call rejected");
                    }
                })();
            }).subscribe();
    }

    // Accept incoming call: create pc, add tracks, setRemoteDesc with offer, create answer and send
    async function acceptIncomingCall(payloadData) {
        try {
            // stop any ringtone
            stopRingtone();

            pc = createPeerConnection(friendId);

            // obtain media according to incoming offer flag
            localStream = await navigator.mediaDevices.getUserMedia({ video: !!payloadData?.isVideo, audio: true });
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
            if (localVideo) localVideo.srcObject = localStream;

            // set remote description (offer)
            const offerDesc = payloadData.offer || payloadData;
            await pc.setRemoteDescription(new RTCSessionDescription(offerDesc));

            // add pending ICE if any
            if (pendingIce.length) {
                for (const c of pendingIce) { try { await pc.addIceCandidate(c); } catch (e) {} }
                pendingIce = [];
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // send answer row
            await client.from("call_signals").insert([{
                from_id: currentUserId,
                to_id: friendId,
                type: "answer",
                payload: { answer }
            }]);

            // show in-call UI
            showInCallUI();
        } catch (err) {
            console.error("acceptIncomingCall error", err);
            await client.from("call_signals").insert([{
                from_id: currentUserId,
                to_id: friendId,
                type: "hangup",
                payload: { reason: "error_accept" }
            }]);
            endCall(false);
        }
    }

    // Initiate outgoing call
    async function initiateOutgoingCall(isVideo) {
        if (currentCall) return alert("Already in a call");
        currentCall = { peerId: friendId, direction: "outgoing", isVideo };

        // prepare pc + media
        try {
            pc = createPeerConnection(friendId);

            localStream = await navigator.mediaDevices.getUserMedia({ video: !!isVideo, audio: true });
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
            if (localVideo) localVideo.srcObject = localStream;

            // create offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // send offer row with isVideo flag
            await client.from("call_signals").insert([{
                from_id: currentUserId,
                to_id: friendId,
                type: "offer",
                payload: { offer, isVideo }
            }]);

            // play ringing locally while waiting for answer
            playRingtone();

            // show in-call UI (outgoing)
            showInCallUI(true);
        } catch (err) {
            console.error("initiateOutgoingCall error", err);
            endCall(false);
        }
    }

    // End call locally; notify remote if notify === true
    async function endCall(notify = true) {
        stopRingtone();
        try {
            if (notify && currentCall && currentCall.peerId) {
                await client.from("call_signals").insert([{
                    from_id: currentUserId,
                    to_id: currentCall.peerId,
                    type: "hangup",
                    payload: {}
                }]);
            }
        } catch (e) { /* ignore */ }

        // cleanup streams + pc
        try { if (localStream) localStream.getTracks().forEach(t => t.stop()); } catch (e) {}
        try { if (remoteStream) remoteStream.getTracks().forEach(t => t.stop()); } catch (e) {}
        try { if (pc) pc.close(); } catch (e) {}
        pc = null; localStream = null; remoteStream = null; pendingIce = []; currentCall = null;

        // hide UI
        const v = document.querySelector(".video-call");
        if (v) v.style.display = "none";
        if (localVideo) localVideo.srcObject = null;
        if (remoteVideo) remoteVideo.srcObject = null;
    }

    // show in-call UI
    function showInCallUI(outgoing = false) {
        const v = document.querySelector(".video-call");
        if (v) v.style.display = "flex";
        if (localVideo && localStream) localVideo.srcObject = localStream;
        if (remoteVideo && remoteStream) remoteVideo.srcObject = remoteStream;
        stopRingtone();
    }

    // wire call controls
    endCallBtn.addEventListener("click", () => endCall(true));
    voiceCallBtn.addEventListener("click", () => {
        subscribeCallSignals().catch(e => console.error(e));
        initiateOutgoingCall(false);
    });
    videoCallBtn.addEventListener("click", () => {
        subscribeCallSignals().catch(e => console.error(e));
        initiateOutgoingCall(true);
    });

    // subscribe to call_signals for incoming signals from this friend (per-chat)
    await subscribeCallSignals();

    // expose endCall to outer scope if needed (optional)
    // window._endCall = endCall;
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
