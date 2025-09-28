import { client } from "../../supabase.js";

document.addEventListener("DOMContentLoaded", async () => {
    // Constants
    const DEFAULT_PROFILE_IMG = "./assets/icon/download.jpeg";
    const ADMIN_USERNAME = "Saim_Malik88";
    const ADMIN_REQUEST_KEY = "adminRequestShown";
    const MAX_BIO_LENGTH = 150;
    const MAX_USERNAME_LENGTH = 20;
    const MESSAGE_DELETION_DELAY = 30 * 1000;
    const RETRY_MAX_ATTEMPTS = 1;
    const RETRY_INITIAL_DELAY = 100;

    // AI Assistant Constants
    const AI_ASSISTANT_ID = '00000000-0000-0000-0000-000000000000';
    const AI_ASSISTANT_NAME = 'AI Assistant';
    const AI_ASSISTANT_AVATAR = './assets/icon/ai-avatar.jpg';
    const AI_ASSISTANT_BIO = 'I am an AI assistant powered by Gemini 2.0. Ask me anything!';
    const AI_WELCOME_MESSAGE = "Hello! I'm your AI assistant. How can I help you today?";
    const AI_ERROR_MESSAGE = "I'm sorry, I'm having trouble responding right now. Please try again later.";

    // Global state
    const state = {
        currentUserId: null,
        friendRequests: [],
        unseenCounts: {},
        currentOpenChatId: null,
        notificationData: {},
        deletionTimeouts: {},
        processingMessageIds: new Set(),
        allFriends: new Map(),
        channels: {
            globalMessages: null,
            friendRequests: null,
            friendsUpdates: null,
            userProfilesUpdates: null,
            chat: null,
            typing: null,
            status: null
        },
        statusInterval: null,
        messageQueue: new Map(),
        aiMessageProcessing: new Set() // Track AI messages being processed
    };

    // AI Assistant Module
    const aiAssistant = {
        initializeGeminiAPI() {
            this.apiKey = 'AIzaSyCVqoPntSjTMdrbkhaulp2jhE_i7vootUk';
            this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`;
            console.log("Gemini API initialized");
        },

        // Optimized to use Promise with timeout
        sendMessageToGemini(message) {
            return new Promise((resolve, reject) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    controller.abort();
                    reject(new Error('AI response timeout'));
                }, 8000); // Increased timeout

                fetch(this.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: message
                            }]
                        }]
                    }),
                    signal: controller.signal
                })
                    .then(response => {
                        clearTimeout(timeoutId);
                        if (!response.ok) throw new Error('Network response was not ok');
                        return response.json();
                    })
                    .then(data => {
                        if (data.candidates && data.candidates.length > 0) {
                            resolve(data.candidates[0].content.parts[0].text);
                        } else {
                            reject(new Error('No response from Gemini'));
                        }
                    })
                    .catch(error => {
                        clearTimeout(timeoutId);
                        console.error('Error calling Gemini API:', error);
                        reject(error);
                    });
            });
        },

        async ensureAIAssistantExists() {
            try {
                await database.ensureUsersTableExists();

                const { data: existingUser, error: userError } = await client
                    .from("users")
                    .select("id")
                    .eq("id", AI_ASSISTANT_ID)
                    .maybeSingle();

                if (userError) throw userError;

                if (!existingUser) {
                    const { error: insertError } = await client
                        .from("users")
                        .insert([{
                            id: AI_ASSISTANT_ID,
                            name: AI_ASSISTANT_NAME,
                            email: `${AI_ASSISTANT_ID}@assistant.com`
                        }]);

                    if (insertError) throw insertError;
                    console.log("AI Assistant user created");
                }

                const { data: existingProfile, error: profileError } = await client
                    .from("user_profiles")
                    .select("user_id")
                    .eq("user_id", AI_ASSISTANT_ID)
                    .maybeSingle();

                if (profileError) throw profileError;

                if (!existingProfile) {
                    const { error: profileInsertError } = await client
                        .from("user_profiles")
                        .insert([{
                            user_id: AI_ASSISTANT_ID,
                            user_name: AI_ASSISTANT_NAME,
                            profile_image_url: AI_ASSISTANT_AVATAR,
                            bio: AI_ASSISTANT_BIO,
                            is_online: true
                        }]);

                    if (profileInsertError) throw profileInsertError;
                    console.log("AI Assistant profile created");
                }
            } catch (error) {
                console.error("Error ensuring AI Assistant exists:", error);
                throw error;
            }
        },

        async addAIAssistantToFriendsList() {
            try {
                const { data: existingFriend, error: friendError } = await client
                    .from("friends")
                    .select("*")
                    .or(`and(user1_id.eq.${state.currentUserId},user2_id.eq.${AI_ASSISTANT_ID}),and(user1_id.eq.${AI_ASSISTANT_ID},user2_id.eq.${state.currentUserId})`)
                    .maybeSingle();

                if (friendError) throw friendError;

                if (!existingFriend) {
                    const { error: insertError } = await client
                        .from("friends")
                        .insert([{
                            user1_id: state.currentUserId,
                            user2_id: AI_ASSISTANT_ID
                        }]);

                    if (insertError) throw insertError;
                    console.log("AI Assistant added as friend");
                }
            } catch (error) {
                console.error("Error adding AI Assistant to friends list:", error);
                throw error;
            }
        },

        renderInFriendsList() {
            try {
                const chatList = document.querySelector(".chat-list");
                if (!chatList) return;

                const existingAI = chatList.querySelector(`.chat[data-friend-id="${AI_ASSISTANT_ID}"]`);
                if (existingAI) return;

                const aiLi = document.createElement("li");
                aiLi.classList.add("chat", "ai-assistant");
                aiLi.setAttribute("data-friend-id", AI_ASSISTANT_ID);
                aiLi.innerHTML = `
                    <div class="avatar-wrapper" style="position:relative;">
                        <img src="${AI_ASSISTANT_AVATAR}" alt="AI Assistant" style="object-fit: cover; border-radius:50%;">
                        <span class="online-dot"></span>
                    </div>
                    <div class="chat-meta">
                        <h4>${AI_ASSISTANT_NAME}</h4>
                        <p class="last-message">How can I help you?</p>
                    </div>
                    <span class="time">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                `;

                aiLi.addEventListener("click", () => {
                    aiAssistant.openAIChat();
                });

                chatList.insertBefore(aiLi, chatList.firstChild);
                state.allFriends.set(AI_ASSISTANT_ID, {
                    user_id: AI_ASSISTANT_ID,
                    user_name: AI_ASSISTANT_NAME,
                    profile_image_url: AI_ASSISTANT_AVATAR,
                    is_online: true
                });
            } catch (error) {
                console.error("Error rendering AI Assistant in friends list:", error);
            }
        },

        async openAIChat() {
            try {
                if (state.currentOpenChatId === AI_ASSISTANT_ID) return;

                state.currentOpenChatId = AI_ASSISTANT_ID;

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
                if (chatHeaderName) chatHeaderName.textContent = AI_ASSISTANT_NAME;
                if (chatHeaderImg) chatHeaderImg.src = AI_ASSISTANT_AVATAR;

                const chatHeader = chatContainer.querySelector(".chat-header img");
                if (chatHeader) {
                    const newChatHeader = chatHeader.cloneNode(true);
                    chatHeader.parentNode.replaceChild(newChatHeader, chatHeader);
                    newChatHeader.addEventListener("click", () => {
                        ui.showUserModal(AI_ASSISTANT_ID, AI_ASSISTANT_NAME, AI_ASSISTANT_AVATAR);
                    });
                }

                if (window.innerWidth <= 768) {
                    if (sidebar) sidebar.style.display = "none";
                    if (messageCon) messageCon.style.display = "none";
                    chatContainer.style.display = "flex";
                    defaultScreen.style.display = 'none';
                } else {
                    if (messageCon) messageCon.display = "flex";
                    chatContainer.style.display = "flex";
                }

                ui.showLoading("Loading AI chat...");

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

                typingIndicator.textContent = "Online";

                const oldMessages = await chat.fetchMessages(AI_ASSISTANT_ID);

                const unseenAIMessages = oldMessages.filter(msg =>
                    msg.sender_id === AI_ASSISTANT_ID &&
                    msg.receiver_id === state.currentUserId &&
                    !msg.seen
                );

                if (unseenAIMessages.length > 0) {
                    const unseenIds = unseenAIMessages.map(msg => msg.id);
                    await client
                        .from("messages")
                        .update({ seen: true })
                        .in("id", unseenIds);

                    unseenAIMessages.forEach(msg => {
                        const index = oldMessages.findIndex(m => m.id === msg.id);
                        if (index !== -1) {
                            oldMessages[index].seen = true;
                        }
                        utils.scheduleMessageDeletion(msg.id, AI_ASSISTANT_ID);
                    });

                    state.unseenCounts[AI_ASSISTANT_ID] = 0;
                    ui.updateUnseenBadge(AI_ASSISTANT_ID, 0);
                }

                ui.renderChatMessages(chatBox, oldMessages, AI_ASSISTANT_AVATAR);

                if (oldMessages.length === 0) {
                    const welcomeMsg = {
                        id: 'welcome-' + Date.now(),
                        sender_id: AI_ASSISTANT_ID,
                        receiver_id: state.currentUserId,
                        content: AI_WELCOME_MESSAGE,
                        created_at: new Date().toISOString(),
                        seen: false
                    };
                    oldMessages.push(welcomeMsg);
                    ui.renderChatMessages(chatBox, oldMessages, AI_ASSISTANT_AVATAR);

                    await utils.insertMessage(AI_ASSISTANT_ID, state.currentUserId, AI_WELCOME_MESSAGE);
                }

                // Setup real-time subscription for AI messages only
                const chatChannelName = `ai-chat:${state.currentUserId}`;
                state.channels.chat = client.channel(chatChannelName);

                state.channels.chat
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'messages',
                        filter: `and(sender_id.eq.${AI_ASSISTANT_ID},receiver_id.eq.${state.currentUserId})`
                    }, (payload) => {
                        const newMsg = payload.new;

                        // Skip if we're already processing this AI message
                        if (state.aiMessageProcessing.has(newMsg.id)) {
                            state.aiMessageProcessing.delete(newMsg.id);
                            return;
                        }

                        // Add to processing set to prevent duplicate handling
                        state.aiMessageProcessing.add(newMsg.id);

                        // Append the message to UI
                        ui.appendMessage(chatBox, newMsg, false);
                        ui.updateLastMessage(AI_ASSISTANT_ID, newMsg.content, newMsg.created_at);

                        // Mark as seen and schedule deletion
                        client
                            .from("messages")
                            .update({ seen: true })
                            .eq("id", newMsg.id)
                            .then(() => {
                                ui.updateMessageSeenStatus(chatBox, newMsg.id);
                                utils.scheduleMessageDeletion(newMsg.id, AI_ASSISTANT_ID);
                            })
                            .catch(err => {
                                console.error("Error marking AI message as seen:", err);
                            })
                            .finally(() => {
                                // Remove from processing set after a delay
                                setTimeout(() => {
                                    state.aiMessageProcessing.delete(newMsg.id);
                                }, 1000);
                            });
                    })
                    .subscribe((status, err) => {
                        if (status === 'SUBSCRIBED') {
                            console.log(`Successfully subscribed to ${chatChannelName}`);
                        } else if (status === 'CHANNEL_ERROR') {
                            console.error(`Error subscribing to ${chatChannelName}:`, err);
                        }
                    });

                // Optimized message sending with immediate UI feedback
                async function handleSend() {
                    const content = inputSafe.value.trim();
                    if (!content) return;

                    sendBtnSafe.disabled = true;
                    inputSafe.value = "";

                    // Create temporary message for immediate UI feedback
                    const tempMsgId = 'temp-' + Date.now();
                    const tempMsg = {
                        id: tempMsgId,
                        sender_id: state.currentUserId,
                        receiver_id: AI_ASSISTANT_ID,
                        content: content,
                        created_at: new Date().toISOString(),
                        seen: false,
                        temp: true
                    };

                    // Add to UI immediately
                    ui.appendMessage(chatBox, tempMsg, true);
                    ui.updateLastMessage(AI_ASSISTANT_ID, content, tempMsg.created_at);

                    // Show AI is typing
                    typingIndicator.textContent = "AI is typing...";

                    try {
                        // Send user message to database
                        const userMsgSaved = await utils.insertMessage(state.currentUserId, AI_ASSISTANT_ID, content);

                        if (!userMsgSaved) {
                            throw new Error("Failed to save user message");
                        }

                        // Remove temporary message
                        const tempElement = chatBox.querySelector(`[data-message-id="${tempMsgId}"]`);
                        if (tempElement) tempElement.remove();

                        // Get AI response
                        const aiResponse = await Promise.race([
                            aiAssistant.sendMessageToGemini(content),
                            new Promise((_, reject) =>
                                setTimeout(() => reject(new Error('AI timeout')), 10000)
                            )
                        ]);

                        // Create AI message object
                        const aiMsg = {
                            id: 'ai-' + Date.now(), // temporary ID
                            sender_id: AI_ASSISTANT_ID,
                            receiver_id: state.currentUserId,
                            content: aiResponse,
                            created_at: new Date().toISOString(),
                            seen: false
                        };

                        // Append AI message to UI immediately
                        ui.appendMessage(chatBox, aiMsg, false);
                        ui.updateLastMessage(AI_ASSISTANT_ID, aiResponse, aiMsg.created_at);

                        // Insert AI response to database in the background
                        utils.insertMessage(AI_ASSISTANT_ID, state.currentUserId, aiResponse)
                            .then(success => {
                                if (!success) {
                                    // If insertion failed, show an error
                                    const errorMsg = {
                                        id: 'error-' + Date.now(),
                                        sender_id: AI_ASSISTANT_ID,
                                        receiver_id: state.currentUserId,
                                        content: AI_ERROR_MESSAGE,
                                        created_at: new Date().toISOString(),
                                        seen: false
                                    };
                                    // Replace the AI message with error message
                                    const aiMsgElement = chatBox.querySelector(`[data-message-id="${aiMsg.id}"]`);
                                    if (aiMsgElement) {
                                        aiMsgElement.querySelector('.msg-text').innerHTML = utils.linkify(AI_ERROR_MESSAGE);
                                    }
                                    ui.updateLastMessage(AI_ASSISTANT_ID, AI_ERROR_MESSAGE, errorMsg.created_at);
                                }
                            })
                            .catch(err => {
                                console.error("Error inserting AI message:", err);
                            });

                    } catch (error) {
                        console.error("Error in handleSend:", error);
                        ui.showToast("Error sending message", "error");

                        // Remove temporary message if still exists
                        const tempElement = chatBox.querySelector(`[data-message-id="${tempMsgId}"]`);
                        if (tempElement) tempElement.remove();
                    } finally {
                        typingIndicator.textContent = "Online";
                        sendBtnSafe.disabled = false;
                        inputSafe.focus();
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
                        state.currentOpenChatId = null;

                        if (state.channels.chat) {
                            await client.removeChannel(state.channels.chat);
                            state.channels.chat = null;
                        }

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

                        friends.fetchFriends();
                    });
                }
            } catch (err) {
                console.error("Error opening AI chat:", err);
                ui.showToast("Failed to open AI chat.", "error");
            } finally {
                ui.hideLoading();
            }
        },

        async initialize() {
            try {
                this.initializeGeminiAPI();
                await this.ensureAIAssistantExists();
                await this.addAIAssistantToFriendsList();
                console.log("AI Assistant initialized successfully");
            } catch (error) {
                console.error("Error initializing AI Assistant:", error);
            }
        }
    };

    // Utility functions
    const utils = {
        withRetry: async (fn, maxRetries = RETRY_MAX_ATTEMPTS, initialDelay = RETRY_INITIAL_DELAY) => {
            let lastError;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    return await fn();
                } catch (error) {
                    lastError = error;
                    console.log(`Attempt ${attempt} failed:`, error.message);

                    if (attempt === maxRetries) break;

                    const delay = initialDelay * Math.pow(2, attempt - 1) + Math.random() * 200;
                    console.log(`Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            throw lastError;
        },

        ensureUserExists: async (userId) => {
            return utils.withRetry(async () => {
                if (userId === AI_ASSISTANT_ID) {
                    const { data: existingUser, error: checkError } = await client
                        .from("users")
                        .select("id")
                        .eq("id", userId)
                        .maybeSingle();

                    if (checkError) throw checkError;

                    if (existingUser) return true;

                    const { error: insertError } = await client
                        .from("users")
                        .insert([{
                            id: userId,
                            name: AI_ASSISTANT_NAME,
                            email: `${userId}@assistant.com`
                        }]);

                    if (insertError) throw insertError;
                    console.log("AI Assistant user created");
                    return true;
                }

                const { data: existingUser, error: checkError } = await client
                    .from("users")
                    .select("id")
                    .eq("id", userId)
                    .maybeSingle();

                if (checkError) throw checkError;

                if (existingUser) return true;

                console.log(`User ${userId} not found, attempting to create...`);

                const { data: profile, error: profileError } = await client
                    .from("user_profiles")
                    .select("user_name")
                    .eq("user_id", userId)
                    .maybeSingle();

                if (profileError) throw profileError;
                if (!profile) throw new Error("User profile not found");

                const { error: insertError } = await client
                    .from("users")
                    .insert([{
                        id: userId,
                        name: profile.user_name || "User",
                        email: `${userId}@placeholder.com`
                    }]);

                if (insertError) throw insertError;

                const { data: verifyUser, error: verifyError } = await client
                    .from("users")
                    .select("id")
                    .eq("id", userId)
                    .maybeSingle();

                if (verifyError || !verifyUser) throw new Error("User creation verification failed");

                console.log(`User ${userId} created successfully`);
                return true;
            });
        },

        // Optimized insertMessage with reduced retry attempts
        insertMessage: async (senderId, receiverId, content) => {
            try {
                console.log(`Inserting message from ${senderId} to ${receiverId}`);

                const senderExists = await utils.ensureUserExists(senderId);
                const receiverExists = await utils.ensureUserExists(receiverId);

                if (!senderExists || !receiverExists) {
                    console.error("Sender or receiver does not exist in users table");
                    return false;
                }

                const { data, error } = await client
                    .from("messages")
                    .insert([{
                        sender_id: senderId,
                        receiver_id: receiverId,
                        content
                    }])
                    .select()
                    .single();

                if (error) {
                    console.error("Error inserting message:", error);

                    if (error.code === '23503') {
                        console.log("Foreign key error, retrying after ensuring users exist");

                        await utils.ensureUserExists(senderId);
                        await utils.ensureUserExists(receiverId);

                        const { data: retryData, error: retryError } = await client
                            .from("messages")
                            .insert([{
                                sender_id: senderId,
                                receiver_id: receiverId,
                                content
                            }])
                            .select()
                            .single();

                        if (retryError) {
                            console.error("Error inserting message on retry:", retryError);
                            return false;
                        }

                        console.log("Message inserted successfully on retry");
                        return true;
                    } else if (error.code === '42501') {
                        console.error("Row-level security policy violation:", error);
                        return false;
                    } else {
                        console.error("Error inserting message:", error);
                        return false;
                    }
                }

                console.log("Message inserted successfully with ID:", data.id);
                return true;
            } catch (err) {
                console.error("Exception in insertMessage:", err);
                return false;
            }
        },

        sendMessage: async (friendId, content) => {
            if (!content || !content.trim()) return;

            try {
                await utils.ensureUserExists(state.currentUserId);
                await utils.ensureUserExists(friendId);

                const success = await utils.insertMessage(state.currentUserId, friendId, content);

                if (success) {
                    ui.updateLastMessage(friendId, content, new Date().toISOString());
                } else {
                    ui.showToast("Message failed to send. Please try again.", "error");
                }
            } catch (err) {
                console.error("Error in sendMessage:", err);
                ui.showToast("Message failed to send. Please try again.", "error");
            }
        },

        isAlreadyFriend: async (userId) => {
            if (!state.currentUserId || !userId) return false;

            try {
                const { data, error } = await client
                    .from("friends")
                    .select("*")
                    .or(`and(user1_id.eq.${state.currentUserId},user2_id.eq.${userId}),and(user1_id.eq.${userId},user2_id.eq.${state.currentUserId})`)
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
        },

        getUserProfile: async (userId) => {
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
        },

        getUserProfileForChat: async (userId) => {
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
        },

        userExistsInUsersTable: async (userId) => {
            try {
                const { data, error } = await client
                    .from("users")
                    .select("id")
                    .eq("id", userId)
                    .maybeSingle();

                if (error) {
                    console.error("Error checking if user exists in users table:", error);
                    return false;
                }

                return !!data;
            } catch (err) {
                console.error("Error in userExistsInUsersTable:", err);
                return false;
            }
        },

        ensureCurrentUserInUsersTable: async () => {
            if (!state.currentUserId) return false;

            try {
                const userExists = await utils.userExistsInUsersTable(state.currentUserId);

                if (!userExists) {
                    console.log("Current user not found in users table, adding...");

                    const { data: { user }, error: authError } = await client.auth.getUser();

                    if (authError || !user) {
                        console.error("Error getting user from auth:", authError);
                        return false;
                    }

                    const { error: insertError } = await client
                        .from("users")
                        .insert([{
                            id: state.currentUserId,
                            name: user.user_metadata?.full_name || user.email?.split('@')[0] || "User",
                            email: user.email || `${state.currentUserId}@placeholder.com`
                        }]);

                    if (insertError) {
                        console.error("Error adding user to users table:", insertError);
                        return false;
                    }

                    console.log("User added to users table successfully");
                }

                return true;
            } catch (err) {
                console.error("Error ensuring user in users table:", err);
                return false;
            }
        },

        setUserOnlineStatus: async (isOnline) => {
            if (!state.currentUserId) return;
            try {
                await client.from('user_profiles')
                    .upsert({ user_id: state.currentUserId, is_online: isOnline }, { onConflict: 'user_id' });
            } catch (err) {
                console.error("Error updating online status:", err);
            }
        },

        scheduleMessageDeletion: (messageId, friendId, delay = MESSAGE_DELETION_DELAY) => {
            try {
                if (state.deletionTimeouts[messageId]) {
                    clearTimeout(state.deletionTimeouts[messageId]);
                }

                state.deletionTimeouts[messageId] = setTimeout(async () => {
                    try {
                        const { error } = await client
                            .from("messages")
                            .update({ deleted_at: new Date().toISOString() })
                            .eq("id", messageId);

                        if (error) {
                            console.error("Error deleting message:", error);
                        } else {
                            console.log(`Message ${messageId} deleted after timeout`);
                            ui.updateLastMessageInChatList(friendId);
                        }
                    } catch (err) {
                        console.error("Error in scheduled message deletion:", err);
                    } finally {
                        delete state.deletionTimeouts[messageId];
                    }
                }, delay);
            } catch (error) {
                console.error("Error scheduling message deletion:", error);
            }
        },

        deleteSeenMessagesForChat: async (friendId) => {
            if (!state.currentUserId) return;

            try {
                const { data: seenMessages, error: fetchError } = await client
                    .from("messages")
                    .select("id")
                    .eq("receiver_id", state.currentUserId)
                    .eq("sender_id", friendId)
                    .eq("seen", true)
                    .is('deleted_at', null);

                if (fetchError) {
                    console.error("Error fetching seen messages for deletion:", fetchError);
                    return;
                }

                if (!seenMessages || seenMessages.length === 0) return;

                seenMessages.forEach(msg => {
                    if (state.deletionTimeouts[msg.id]) {
                        clearTimeout(state.deletionTimeouts[msg.id]);
                        delete state.deletionTimeouts[msg.id];
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
                    ui.updateLastMessageInChatList(friendId);
                }
            } catch (err) {
                console.error("deleteSeenMessagesForChat error:", err);
            }
        },

        linkify: (text) => {
            try {
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                return text.replace(urlRegex, function (url) {
                    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">${url}</a>`;
                });
            } catch (error) {
                console.error("Error linkifying text:", error);
                return text;
            }
        },

        generateChatLink: (friendId) => {
            try {
                const baseUrl = window.location.origin + window.location.pathname;
                return `${baseUrl}?chat=${friendId}`;
            } catch (error) {
                console.error("Error generating chat link:", error);
                return "#";
            }
        },

        requestNotificationPermission: async () => {
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
        },

        showNotification: async (title, options = {}) => {
            const hasPermission = await utils.requestNotificationPermission();

            if (hasPermission) {
                try {
                    const notif = new Notification(title, options);
                    return notif;
                } catch (err) {
                    console.warn("Error showing notification:", err);
                }
            }

            ui.showTopRightPopup(title, "info", options.icon);
            return null;
        }
    };

    // UI functions
    const ui = {
        showModal: (modalId) => {
            try {
                const modal = document.getElementById(modalId);
                if (!modal) {
                    console.error(`Modal with ID ${modalId} not found`);
                    return;
                }

                modal.classList.remove('hidden');
                modal.offsetHeight;
                modal.classList.add('show');
            } catch (error) {
                console.error("Error showing modal:", error);
            }
        },

        hideModal: (modalId) => {
            try {
                const modal = document.getElementById(modalId);
                if (!modal) {
                    console.error(`Modal with ID ${modalId} not found`);
                    return;
                }

                modal.classList.remove('show');
                setTimeout(() => {
                    modal.classList.add('hidden');
                }, 300);
            } catch (error) {
                console.error("Error hiding modal:", error);
            }
        },

        showToast: (message, type = "info") => {
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
        },

        showLoading: (message = 'Loading...') => {
            try {
                const overlay = document.getElementById("loading-overlay");
                const msgEl = document.getElementById("loading-message");
                if (!overlay) {
                    console.error("Loading overlay not found");
                    return;
                }

                if (msgEl) msgEl.textContent = message;
                overlay.classList.remove('hidden');
                overlay.offsetHeight;
                overlay.classList.add('show');
            } catch (error) {
                console.error("Error showing loading overlay:", error);
            }
        },

        hideLoading: () => {
            try {
                const overlay = document.getElementById("loading-overlay");
                if (!overlay) {
                    console.error("Loading overlay not found");
                    return;
                }

                overlay.classList.remove('show');
                setTimeout(() => overlay.classList.add("hidden"), 300);
            } catch (error) {
                console.error("Error hiding loading overlay:", error);
            }
        },

        activePopups: new Set(),

        showTopRightPopup: (message, type = "info", image = null) => {
            try {
                const popupKey = `${message}-${type}-${image || ''}`;
                if (ui.activePopups.has(popupKey)) return;

                ui.activePopups.add(popupKey);

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

                popup.querySelector(".popup-close").addEventListener("click", () => {
                    popup.style.animation = "slideOut 0.3s ease-out forwards";
                    setTimeout(() => {
                        popup.remove();
                        ui.activePopups.delete(popupKey);
                    }, 300);
                });

                setTimeout(() => {
                    if (popup.parentNode) {
                        popup.style.animation = "slideOut 0.3s ease-out forwards";
                        setTimeout(() => {
                            popup.remove();
                            ui.activePopups.delete(popupKey);
                        }, 300);
                    }
                }, 5000);

                popupContainer.appendChild(popup);
            } catch (error) {
                console.error("Error showing top-right popup:", error);
            }
        },

        showCopyPopup: (element) => {
            try {
                const popup = document.createElement("div");
                popup.className = "copy-popup";
                popup.textContent = "Copied!";
                popup.style.cssText = `
                    position: absolute;
                    background-color: #333;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    z-index: 1000;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.2s;
                `;

                document.body.appendChild(popup);

                const rect = element.getBoundingClientRect();
                popup.style.left = `${rect.left + rect.width / 2 - popup.offsetWidth / 2}px`;
                popup.style.top = `${rect.top - 30}px`;

                setTimeout(() => {
                    popup.style.opacity = "1";
                }, 10);

                setTimeout(() => {
                    popup.style.opacity = "0";
                    setTimeout(() => {
                        document.body.removeChild(popup);
                    }, 200);
                }, 1500);
            } catch (error) {
                console.error("Error showing copy popup:", error);
            }
        },

        createLoader: () => {
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
        },

        updateUnseenBadge: (friendId, count) => {
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
        },

        updateUnseenCountForFriend: async (friendId) => {
            try {
                const { count, error } = await client
                    .from("messages")
                    .select("*", { count: "exact", head: true })
                    .eq("sender_id", friendId)
                    .eq("receiver_id", state.currentUserId)
                    .eq("seen", false)
                    .is('deleted_at', null);

                if (error) {
                    console.error("Error updating unseen count:", error);
                    return;
                }

                const unseenCount = count || 0;
                state.unseenCounts[friendId] = unseenCount;
                ui.updateUnseenBadge(friendId, unseenCount);
            } catch (err) {
                console.error("updateUnseenCountForFriend error:", err);
            }
        },

        updateLastMessageInChatList: async (friendId) => {
            try {
                const { data: lastMsgData } = await client
                    .from("messages")
                    .select("content, created_at, sender_id, receiver_id")
                    .or(`and(sender_id.eq.${state.currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${state.currentUserId})`)
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
        },

        updateLastMessage: (friendId, content, createdAt) => {
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
        },

        updateMessageSeenStatus: (chatBox, messageId) => {
            try {
                const chatMessage = chatBox.querySelector(`.message[data-message-id="${messageId}"] .seen-status`);
                if (chatMessage) {
                    chatMessage.textContent = "✓✓";
                }
            } catch (error) {
                console.error("Error updating message seen status:", error);
            }
        },

        appendMessage: (chatBox, message, isMe) => {
            try {
                if (!chatBox) return;

                const friendAvatar = isMe ? null : (state.allFriends.get(message.sender_id)?.profile_image_url || AI_ASSISTANT_AVATAR);
                const messageDiv = ui.createMessageElement(message, isMe, friendAvatar);
                chatBox.appendChild(messageDiv);

                // Scroll to bottom
                setTimeout(() => {
                    chatBox.scrollTop = chatBox.scrollHeight;
                }, 50);
            } catch (error) {
                console.error("Error appending message:", error);
            }
        },

        createMessageElement: (message, isMe, friendAvatar) => {
            const msgDiv = document.createElement("div");
            msgDiv.className = `message ${isMe ? "sent" : "received"}`;
            msgDiv.setAttribute("data-message-id", message.id);

            const timeStr = message.created_at ? new Date(message.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            }) : "";

            const msgBubble = document.createElement("div");
            msgBubble.className = "msg-bubble";
            msgBubble.style.position = "relative";

            const msgText = document.createElement("span");
            msgText.className = "msg-text";
            msgText.innerHTML = utils.linkify(message.content);

            const msgMeta = document.createElement("div");
            msgMeta.className = "msg-meta";
            msgMeta.innerHTML = `
                <small class="msg-time">${timeStr}</small>
                ${isMe ? `<small class="seen-status">${message.seen ? "✓✓" : "✓"}</small>` : ""}
            `;

            msgBubble.appendChild(msgText);
            msgBubble.appendChild(msgMeta);

            const copyIcon = document.createElement("span");
            copyIcon.className = "copy-icon";
            copyIcon.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                </svg>
            `;

            const iconColor = isMe ? "#fff" : "#666";
            copyIcon.style.cssText = `
                position: relative;
                top: 5px;
                right: 5px;
                opacity: 0;
                cursor: pointer;
                transition: opacity 0.2s;
                color: ${iconColor};
            `;

            msgBubble.appendChild(copyIcon);

            msgBubble.addEventListener("mouseenter", () => {
                copyIcon.style.opacity = "1";
            });

            msgBubble.addEventListener("mouseleave", () => {
                copyIcon.style.opacity = "0";
            });

            copyIcon.addEventListener("click", (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(message.content).then(() => {
                    ui.showCopyPopup(copyIcon);
                }).catch(err => {
                    console.error("Failed to copy text: ", err);
                });
            });

            if (!isMe) {
                const avatarImg = document.createElement("img");
                avatarImg.src = friendAvatar;
                avatarImg.className = "msg-avatar";
                avatarImg.style.cssText = "width:25px;height:25px;border-radius:50%;margin-right:6px;";
                msgDiv.appendChild(avatarImg);
            }

            msgDiv.appendChild(msgBubble);
            return msgDiv;
        },

        renderChatMessages: (chatBox, msgs, friendAvatar) => {
            try {
                if (!chatBox) return;
                chatBox.innerHTML = "";

                const animationDelay = 50;

                msgs.forEach((msg, index) => {
                    const isMe = msg.sender_id === state.currentUserId;
                    const msgDiv = document.createElement("div");
                    msgDiv.className = `message ${isMe ? "sent" : "received"}`;
                    msgDiv.setAttribute("data-message-id", msg.id);
                    msgDiv.style.animationDelay = `${index * animationDelay}ms`;

                    const timeStr = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit"
                    }) : "";

                    const msgBubble = document.createElement("div");
                    msgBubble.className = "msg-bubble";
                    msgBubble.style.position = "relative";

                    const msgText = document.createElement("span");
                    msgText.className = "msg-text";
                    msgText.innerHTML = utils.linkify(msg.content);

                    const msgMeta = document.createElement("div");
                    msgMeta.className = "msg-meta";
                    msgMeta.innerHTML = `
                        <small class="msg-time">${timeStr}</small>
                        ${isMe ? `<small class="seen-status">${msg.seen ? "✓✓" : "✓"}</small>` : ""}
                    `;

                    msgBubble.appendChild(msgText);
                    msgBubble.appendChild(msgMeta);

                    const copyIcon = document.createElement("span");
                    copyIcon.className = "copy-icon";
                    copyIcon.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                        </svg>
                    `;

                    const iconColor = isMe ? "#fff" : "#666";
                    copyIcon.style.cssText = `
                        position: relative;
                        top: 5px;
                        right: 5px;
                        opacity: 0;
                        cursor: pointer;
                        transition: opacity 0.2s;
                        color: ${iconColor};
                    `;

                    msgBubble.appendChild(copyIcon);

                    msgBubble.addEventListener("mouseenter", () => {
                        copyIcon.style.opacity = "1";
                    });

                    msgBubble.addEventListener("mouseleave", () => {
                        copyIcon.style.opacity = "0";
                    });

                    copyIcon.addEventListener("click", (e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(msg.content).then(() => {
                            ui.showCopyPopup(copyIcon);
                        }).catch(err => {
                            console.error("Failed to copy text: ", err);
                        });
                    });

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

                setTimeout(() => {
                    chatBox.scrollTop = chatBox.scrollHeight;
                }, msgs.length * animationDelay);
            } catch (error) {
                console.error("Error rendering chat messages:", error);
            }
        },

        updateFriendUI: (friendId) => {
            try {
                let friendData = state.allFriends.get(friendId);
                if (!friendData) return;

                const chatLi = document.querySelector(`.chat[data-friend-id="${friendId}"]`);
                if (!chatLi) return;

                const avatarWrapper = chatLi.querySelector(".avatar-wrapper");
                if (avatarWrapper) {
                    const existingDot = avatarWrapper.querySelector(".online-dot");
                    if (existingDot) existingDot.remove();

                    if (friendData.is_online) {
                        const onlineDot = document.createElement("span");
                        onlineDot.className = "online-dot";
                        avatarWrapper.appendChild(onlineDot);
                    }
                }

                const avatarImg = chatLi.querySelector(".avatar-wrapper img");
                if (avatarImg && friendData.profile_image_url) {
                    avatarImg.src = friendData.profile_image_url;
                }

                const nameEl = chatLi.querySelector("h4");
                if (nameEl && friendData.user_name) {
                    nameEl.textContent = friendData.user_name;
                }

                if (state.currentOpenChatId === friendId) {
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
        },

        showConfirmPopup: (message, onConfirm, onCancel) => {
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
                    ui.hideModal("notification-popup");
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
        },

        showUserModal: (userId, userName, userAvatar) => {
            try {
                const modal = document.getElementById("user-modal");
                if (!modal) return;

                document.getElementById("user-modal-avatar").src = userAvatar || DEFAULT_PROFILE_IMG;
                document.getElementById("user-modal-username").textContent = userName || "Unknown User";
                document.getElementById("user-modal-bio").textContent = "Loading bio...";
                document.getElementById("user-modal-status").textContent = "Checking status...";
                document.getElementById("user-modal-status").className = "user-modal-status";

                utils.getUserProfile(userId).then(profile => {
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

                ui.showModal("user-modal");

                const closeModal = () => ui.hideModal("user-modal");
                modal.querySelector(".user-modal-close").addEventListener("click", closeModal);
                modal.querySelector("#user-modal-close-btn").addEventListener("click", closeModal);

                modal.querySelector("#user-modal-message-btn").addEventListener("click", () => {
                    closeModal();
                    if (userId === AI_ASSISTANT_ID) {
                        aiAssistant.openAIChat();
                    } else {
                        chat.openSpecificChat(userId);
                    }
                });
            } catch (error) {
                console.error("Error showing user modal:", error);
            }
        },

        enableFriendSearch: () => {
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

                                if (friendId === AI_ASSISTANT_ID) {
                                    aiAssistant.openAIChat();
                                } else {
                                    chat.openSpecificChat(friendId, {
                                        user_name: friendName,
                                        profile_image_url: friendAvatar
                                    });
                                }
                            }
                        }
                    }, 120);
                });
            } catch (error) {
                console.error("Error enabling friend search:", error);
            }
        },

        renderFriendRequests: () => {
            try {
                const messageList = document.getElementById("friend-requests-list");
                const unreadBadge = document.getElementById("unread-count");
                if (!messageList || !unreadBadge) return;

                messageList.innerHTML = "";
                if (!state.friendRequests || state.friendRequests.length === 0) {
                    const noRequestsItem = document.createElement("li");
                    noRequestsItem.className = "no-requests";
                    noRequestsItem.textContent = "No pending friend requests.";
                    messageList.appendChild(noRequestsItem);
                } else {
                    state.friendRequests.forEach((req) => {
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
                            await friendRequests.acceptRequest(req.requestId, req.senderId);
                        });
                        rejectBtn?.addEventListener("click", async () => {
                            await friendRequests.rejectRequest(req.requestId);
                        });
                        messageList.appendChild(li);
                    });
                }

                unreadBadge.textContent = (state.friendRequests && state.friendRequests.length) ? state.friendRequests.length : "0";
            } catch (error) {
                console.error("Error rendering friend requests:", error);
            }
        },

        renderRecentChats: (chats) => {
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
                        if (chat.user_id === AI_ASSISTANT_ID) {
                            aiAssistant.openAIChat();
                        } else {
                            chat.openSpecificChat(chat.user_id, {
                                user_name: chat.user_name,
                                profile_image_url: chat.avatar_url
                            });
                        }
                    });

                    recentChatsContainer.appendChild(chatElement);
                });
            } catch (error) {
                console.error("Error rendering recent chats:", error);
            }
        }
    };

    // Friend request functions
    const friendRequests = {
        acceptRequest: async (requestId, senderId) => {
            try {
                const alreadyFriends = await utils.isAlreadyFriend(senderId);
                if (alreadyFriends) {
                    ui.showToast("You are already friends with this user.", "info");
                    ui.showTopRightPopup("You are already friends with this user.", "info");
                    return;
                }

                const { error: updateError } = await client
                    .from("requests")
                    .update({ status: "accepted" })
                    .eq("id", requestId);

                if (updateError) {
                    console.error("Error updating request:", updateError.message || updateError);
                    return ui.showToast("Failed to accept request.", "error");
                }

                const { error: insertError } = await client
                    .from("friends")
                    .insert([{ user1_id: state.currentUserId, user2_id: senderId }]);

                if (insertError) {
                    console.error("Error inserting into friends:", insertError.message || insertError);
                    return ui.showToast("Failed to add friend.", "error");
                }

                ui.showToast("Friend request accepted!", "success");
                ui.showTopRightPopup("Friend request accepted!", "success");

                await friendRequests.fetchFriendRequests();
                await friends.fetchFriends();
                await chat.openSpecificChat(senderId);
                await friends.fetchRecentChats();

            } catch (err) {
                console.error("Unexpected error:", err);
                ui.showToast("An error occurred while accepting request.", "error");
            }
        },

        rejectRequest: async (requestId) => {
            try {
                const { error } = await client
                    .from("requests")
                    .update({ status: "rejected" })
                    .eq("id", requestId);

                if (error) {
                    console.error("Error rejecting request:", error.message || error);
                    return ui.showToast("Failed to reject request.", "error");
                }

                ui.showToast("Friend request rejected!", "info");
                ui.showTopRightPopup("Friend request rejected", "info");
                friendRequests.fetchFriendRequests();
            } catch (err) {
                console.error("Unexpected error rejecting request:", err);
                ui.showToast("Failed to reject friend request.", "error");
            }
        },

        sendFriendRequest: async (username) => {
            if (!username) return ui.showToast("Enter a username.", "error");

            console.log("Sending friend request to:", username);
            ui.showLoading("Sending friend request...");

            try {
                const { data: user, error: userError } = await client
                    .from("user_profiles")
                    .select("user_id")
                    .eq("user_name", username)
                    .maybeSingle();

                if (userError || !user) {
                    console.error("User not found:", userError);
                    ui.hideLoading();
                    return ui.showToast("User not found.", "error");
                }

                const receiverId = user.user_id;
                console.log("Found user with ID:", receiverId);

                if (receiverId === state.currentUserId) {
                    ui.hideLoading();
                    return ui.showToast("You cannot send a request to yourself.", "warning");
                }

                const alreadyFriends = await utils.isAlreadyFriend(receiverId);
                if (alreadyFriends) {
                    ui.hideLoading();
                    ui.showToast(`You are already friends with ${username}`, "info");
                    ui.showTopRightPopup(`You are already friends with ${username}`, "info");
                    return;
                }

                const { data: existing, error: existingError } = await client
                    .from("requests")
                    .select("id, status")
                    .or(`and(sender_id.eq.${state.currentUserId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${state.currentUserId})`)
                    .maybeSingle();

                if (existingError) {
                    console.error("Error checking existing request:", existingError);
                    ui.hideLoading();
                    return ui.showToast("Something went wrong. Try again.", "error");
                }

                if (existing) {
                    console.log("Existing request found:", existing);
                    ui.hideLoading();
                    if (existing.status === "pending") {
                        ui.showTopRightPopup(`You already have a pending request to ${username}`, "warning");
                        return ui.showToast("You have already sent a request.", "info");
                    }
                    if (existing.status === "accepted") {
                        ui.showToast(`You are already friends with ${username}`, "info");
                        ui.showTopRightPopup(`You are already friends with ${username}`, "info");
                        return;
                    }
                    if (existing.status === "rejected") {
                        ui.showTopRightPopup(`This user rejected your request before`, "warning");
                        return ui.showToast("This user rejected your request before.", "warning");
                    }
                }

                console.log("Creating new friend request...");
                const { data: newRequest, error: requestError } = await client
                    .from("requests")
                    .insert([{
                        sender_id: state.currentUserId,
                        receiver_id: receiverId,
                        status: "pending"
                    }])
                    .select()
                    .single();

                if (requestError) {
                    console.error("Error sending friend request:", requestError);
                    ui.hideLoading();
                    return ui.showToast("Failed to send friend request.", "error");
                }

                console.log("Friend request created successfully:", newRequest);
                ui.showToast("Friend request sent successfully!", "success");
                ui.showTopRightPopup(`Friend request sent to ${username}!`, "success");
            } catch (err) {
                console.error("Unexpected error in sendFriendRequest:", err);
                ui.showToast("Unexpected error. Please try again.", "error");
            } finally {
                ui.hideLoading();
            }
        },

        fetchFriendRequests: async () => {
            if (!state.currentUserId) return;

            console.log("Fetching friend requests for user:", state.currentUserId);
            ui.showLoading("Fetching friend requests...");

            try {
                const { data: requests, error } = await client
                    .from("requests")
                    .select("id, sender_id, status")
                    .eq("receiver_id", state.currentUserId)
                    .eq("status", "pending");

                if (error) {
                    console.error("Error fetching friend requests:", error);
                    throw error;
                }

                console.log("Friend requests data:", requests);
                state.friendRequests = [];

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

                        state.friendRequests.push({
                            text: `${senderName} sent you a friend request`,
                            requestId: req.id,
                            senderId: req.sender_id,
                            avatar: avatarUrl
                        });

                        console.log(`Added friend request from ${senderName}`);
                    }
                }

                console.log("Final friend requests list:", state.friendRequests);
                ui.renderFriendRequests();
            } catch (err) {
                console.error("Error fetching requests:", err);
                ui.showToast("Failed to fetch friend requests.", "error");
            } finally {
                ui.hideLoading();
            }
        }
    };

    // Friends functions
    const friends = {
        fetchFriends: async () => {
            ui.showLoading("Fetching friends...");
            if (!state.currentUserId) {
                ui.hideLoading();
                return;
            }

            try {
                const { data: friends, error } = await client
                    .from("friends")
                    .select("*")
                    .or(`user1_id.eq.${state.currentUserId},user2_id.eq.${state.currentUserId}`);

                if (error) throw error;

                const chatList = document.querySelector(".chat-list");
                if (!chatList) return;
                chatList.innerHTML = "";

                const friendIds = [...new Set(friends.map(f =>
                    f.user1_id === state.currentUserId ? f.user2_id : f.user1_id
                ))];

                const { data: profiles } = await client
                    .from("user_profiles")
                    .select("user_id, user_name, profile_image_url, is_online")
                    .in("user_id", friendIds);

                state.allFriends.clear();
                (profiles || []).forEach(p => {
                    state.allFriends.set(p.user_id, p);
                });

                const friendDataPromises = friendIds.map(async (friendId) => {
                    let profile = state.allFriends.get(friendId) || {};
                    let friendName, avatarUrl, isOnline;

                    friendName = profile.user_name || "Unknown";
                    avatarUrl = profile.profile_image_url || DEFAULT_PROFILE_IMG;
                    isOnline = profile.is_online || false;

                    const { data: lastMsgData } = await client
                        .from("messages")
                        .select("content, created_at, sender_id, receiver_id")
                        .or(`and(sender_id.eq.${state.currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${state.currentUserId})`)
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
                            .eq("receiver_id", state.currentUserId)
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

                    const li = document.createElement("li");
                    li.classList.add("chat");
                    li.setAttribute("data-friend-id", friendId);
                    li.innerHTML = `
                        <div class="avatar-wrapper" style="position:relative;">
                            <img src="${avatarUrl ? avatarUrl : DEFAULT_PROFILE_IMG}" alt="User" style="object-fit: cover; border-radius:50%;">
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
                        if (friendId === AI_ASSISTANT_ID) {
                            aiAssistant.openAIChat();
                        } else {
                            chat.openSpecificChat(friendId, {
                                user_name: friendName,
                                profile_image_url: avatarUrl
                            });
                        }

                        const chatArea = document.querySelector('.chat-area-main');
                        if (window.innerWidth <= 768) {
                            document.getElementById('message-notification')?.classList.add("hidden");
                            if (chatArea) chatArea.style.display = 'flex';
                        }
                    });

                    chatList.appendChild(li);
                    state.unseenCounts[friendId] = unseenCount || 0;
                });

                aiAssistant.renderInFriendsList();

                ui.enableFriendSearch();
            } catch (err) {
                console.error("Error fetching friends:", err);
                ui.showToast("Failed to load friends.", "error");
            } finally {
                ui.hideLoading();
            }
        },

        fetchRecentChats: async () => {
            try {
                const { data: friends, error: friendsError } = await client
                    .from("friends")
                    .select("*")
                    .or(`user1_id.eq.${state.currentUserId},user2_id.eq.${state.currentUserId}`);

                if (friendsError) throw friendsError;

                if (!friends || friends.length === 0) {
                    ui.renderRecentChats([]);
                    return;
                }

                const friendIds = [...new Set(friends.map(f =>
                    f.user1_id === state.currentUserId ? f.user2_id : f.user1_id
                ))];

                const { data: profiles, error: profilesError } = await client
                    .from("user_profiles")
                    .select("user_id, user_name, profile_image_url, is_online")
                    .in("user_id", friendIds);

                if (profilesError) throw profilesError;

                const recentChatsPromises = friendIds.map(async (friendId) => {
                    let profile, user_name, avatar_url, is_online;

                    profile = profiles?.find(p => p.user_id === friendId);
                    user_name = profile?.user_name || "Unknown";
                    avatar_url = profile?.profile_image_url || DEFAULT_PROFILE_IMG;
                    is_online = profile?.is_online || false;

                    const { data: lastMessage } = await client
                        .from("messages")
                        .select("content, created_at")
                        .or(`and(sender_id.eq.${state.currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${state.currentUserId})`)
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

                let recentChats = await Promise.all(recentChatsPromises);

                const { data: aiMessages } = await client
                    .from("messages")
                    .select("content, created_at")
                    .or(`and(sender_id.eq.${state.currentUserId},receiver_id.eq.${AI_ASSISTANT_ID}),and(sender_id.eq.${AI_ASSISTANT_ID},receiver_id.eq.${state.currentUserId})`)
                    .is('deleted_at', null)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (aiMessages) {
                    recentChats.unshift({
                        user_id: AI_ASSISTANT_ID,
                        user_name: AI_ASSISTANT_NAME,
                        avatar_url: AI_ASSISTANT_AVATAR,
                        is_online: true,
                        last_message: aiMessages.content || "How can I help you?",
                        last_message_time: aiMessages.created_at || null
                    });
                }

                recentChats.sort((a, b) => {
                    if (!a.last_message_time) return 1;
                    if (!b.last_message_time) return -1;
                    return new Date(b.last_message_time) - new Date(a.last_message_time);
                });

                ui.renderRecentChats(recentChats);
            } catch (err) {
                console.error("Error fetching recent chats:", err);
                ui.renderRecentChats([]);
            }
        }
    };

    // Chat functions
    const chat = {
        fetchMessages: async (friendId) => {
            if (!state.currentUserId || !friendId) return [];

            try {
                const { data, error } = await client
                    .from("messages")
                    .select("*")
                    .or(`and(sender_id.eq.${state.currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${state.currentUserId})`)
                    .is('deleted_at', null)
                    .order("created_at", { ascending: true });

                if (error) {
                    console.error("Error fetching messages:", error);
                    return [];
                }

                return data || [];
            } catch (err) {
                console.error("Error in fetchMessages:", err);
                return [];
            }
        },

        markMessagesAsSeen: async (friendId, chatBox, messages, friendAvatar) => {
            if (!state.currentUserId || !friendId) return;

            try {
                const { data: unseenMessages, error } = await client
                    .from("messages")
                    .select("id")
                    .eq("sender_id", friendId)
                    .eq("receiver_id", state.currentUserId)
                    .eq("seen", false)
                    .is('deleted_at', null);

                if (error) {
                    console.error("Error fetching unseen messages:", error);
                    return;
                }

                if (unseenMessages && unseenMessages.length > 0) {
                    const { error: updateError } = await client
                        .from("messages")
                        .update({ seen: true })
                        .in("id", unseenMessages.map(msg => msg.id));

                    if (updateError) {
                        console.error("Error marking messages as seen:", updateError);
                        return;
                    }

                    unseenMessages.forEach(unseenMsg => {
                        const msgIndex = messages.findIndex(m => m.id === unseenMsg.id);
                        if (msgIndex !== -1) {
                            messages[msgIndex].seen = true;
                        }
                        utils.scheduleMessageDeletion(unseenMsg.id, friendId);
                    });

                    ui.renderChatMessages(chatBox, messages, friendAvatar);
                }
            } catch (err) {
                console.error("Error in markMessagesAsSeen:", err);
            }
        },

        openSpecificChat: async (userId, profile = null) => {
            try {
                if (!state.currentUserId) {
                    const user = await auth.getCurrentUser();
                    if (!user) {
                        ui.showToast("You must be logged in to open a chat", "error");
                        return;
                    }
                }

                if (state.currentOpenChatId === userId) {
                    return;
                }

                if (userId === AI_ASSISTANT_ID) {
                    return aiAssistant.openAIChat();
                }

                let userProfile = profile;
                if (!userProfile) {
                    userProfile = await utils.getUserProfileForChat(userId);
                    if (!userProfile) {
                        ui.showToast("User not found", "error");
                        return;
                    }
                }

                chat.openChat(userId, userProfile.user_name, userProfile.profile_image_url);
            } catch (error) {
                console.error("Error opening specific chat:", error);
            }
        },

        openChat: async (friendId, friendName, friendAvatar, fromNotification = false) => {
            try {
                if (friendId === AI_ASSISTANT_ID) {
                    return aiAssistant.openAIChat();
                }

                state.currentOpenChatId = friendId;

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

                const chatHeader = chatContainer.querySelector(".chat-header img");
                if (chatHeader) {
                    const newChatHeader = chatHeader.cloneNode(true);
                    chatHeader.parentNode.replaceChild(newChatHeader, chatHeader);
                    newChatHeader.addEventListener("click", () => {
                        ui.showUserModal(friendId, friendName, friendAvatar);
                    });
                }

                if (window.innerWidth <= 768 || fromNotification) {
                    if (sidebar) sidebar.style.display = "none";
                    if (messageCon) messageCon.style.display = "none";
                    chatContainer.style.display = "flex";
                    defaultScreen.style.display = 'none';
                } else {
                    if (messageCon) messageCon.display = "flex";
                    chatContainer.style.display = "flex";
                }

                ui.showLoading("Loading chat...");

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

                const { data: profile } = await client
                    .from("user_profiles")
                    .select("is_online")
                    .eq("user_id", friendId)
                    .maybeSingle();

                typingIndicator.textContent = profile?.is_online ? "Online" : "Offline";

                const oldMessages = await chat.fetchMessages(friendId);
                ui.renderChatMessages(chatBox, oldMessages, friendAvatar);

                const setupChatSubscriptions = async () => {
                    try {
                        const chatChannelName = `chat:${[state.currentUserId, friendId].sort().join(":")}`;
                        state.channels.chat = client.channel(chatChannelName);

                        state.channels.chat
                            .on('postgres_changes', {
                                event: 'INSERT',
                                schema: 'public',
                                table: 'messages',
                                filter: `sender_id=eq.${state.currentUserId}`
                            }, (payload) => {
                                const newMsg = payload.new;
                                if (state.processingMessageIds.has(newMsg.id)) {
                                    return;
                                }
                                state.processingMessageIds.add(newMsg.id);

                                ui.appendMessage(chatBox, newMsg, true);
                                ui.updateLastMessage(friendId, newMsg.content, newMsg.created_at);

                                setTimeout(() => {
                                    state.processingMessageIds.delete(newMsg.id);
                                }, 1000);
                            })
                            .on('postgres_changes', {
                                event: 'INSERT',
                                schema: 'public',
                                table: 'messages',
                                filter: `sender_id=eq.${friendId}`
                            }, async (payload) => {
                                const newMsg = payload.new;
                                if (state.processingMessageIds.has(newMsg.id)) {
                                    return;
                                }
                                state.processingMessageIds.add(newMsg.id);

                                ui.appendMessage(chatBox, newMsg, false);
                                ui.updateLastMessage(friendId, newMsg.content, newMsg.created_at);

                                if (newMsg.receiver_id === state.currentUserId) {
                                    try {
                                        await client
                                            .from("messages")
                                            .update({ seen: true })
                                            .eq("id", newMsg.id);

                                        const idx = oldMessages.findIndex(m => m.id === newMsg.id);
                                        if (idx !== -1) {
                                            oldMessages[idx].seen = true;
                                        }
                                        ui.updateMessageSeenStatus(chatBox, newMsg.id);

                                        state.unseenCounts[newMsg.sender_id] = 0;
                                        ui.updateUnseenBadge(newMsg.sender_id, 0);
                                        utils.scheduleMessageDeletion(newMsg.id, friendId);
                                    } catch (err) {
                                        console.error("Error marking message as seen:", err);
                                    }
                                }

                                setTimeout(() => {
                                    state.processingMessageIds.delete(newMsg.id);
                                }, 1000);
                            })
                            .on('postgres_changes', {
                                event: 'UPDATE',
                                schema: 'public',
                                table: 'messages',
                                filter: `sender_id=eq.${state.currentUserId}`
                            }, (payload) => {
                                const updated = payload.new;

                                if (updated.deleted_at) {
                                    const idx = oldMessages.findIndex(m => m.id === updated.id);
                                    if (idx !== -1) {
                                        oldMessages.splice(idx, 1);
                                    }
                                    const messageElement = chatBox.querySelector(`.message[data-message-id="${updated.id}"]`);
                                    if (messageElement) messageElement.remove();

                                    ui.updateLastMessageInChatList(updated.sender_id);
                                    ui.updateLastMessageInChatList(updated.receiver_id);

                                    if (state.currentOpenChatId !== updated.sender_id) {
                                        ui.updateUnseenCountForFriend(updated.sender_id);
                                    }
                                    return;
                                }

                                const idx = oldMessages.findIndex(m => m.id === updated.id);
                                if (idx !== -1) {
                                    oldMessages[idx] = { ...oldMessages[idx], ...updated };
                                }

                                if (updated.sender_id === state.currentUserId && updated.seen === true) {
                                    ui.updateMessageSeenStatus(chatBox, updated.id);
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
                                    }
                                    const messageElement = chatBox.querySelector(`.message[data-message-id="${updated.id}"]`);
                                    if (messageElement) messageElement.remove();

                                    ui.updateLastMessageInChatList(updated.sender_id);
                                    ui.updateLastMessageInChatList(updated.receiver_id);

                                    if (state.currentOpenChatId !== updated.sender_id) {
                                        ui.updateUnseenCountForFriend(updated.sender_id);
                                    }
                                    return;
                                }

                                const idx = oldMessages.findIndex(m => m.id === updated.id);
                                if (idx !== -1) {
                                    oldMessages[idx] = { ...oldMessages[idx], ...updated };
                                }

                                if (updated.receiver_id === state.currentUserId && updated.seen === true) {
                                    state.unseenCounts[updated.sender_id] = 0;
                                    ui.updateUnseenBadge(updated.sender_id, 0);
                                }
                            })
                            .subscribe((status, err) => {
                                if (status === 'SUBSCRIBED') {
                                    console.log(`Successfully subscribed to ${chatChannelName}`);
                                } else if (status === 'CHANNEL_ERROR') {
                                    console.error(`Error subscribing to ${chatChannelName}:`, err);
                                }
                            });

                        const typingChannelName = `typing:${[state.currentUserId, friendId].sort().join(":")}`;
                        state.channels.typing = client.channel(typingChannelName);

                        state.channels.typing
                            .on('broadcast', { event: 'typing' }, (payload) => {
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
                            })
                            .subscribe((status, err) => {
                                if (status === 'SUBSCRIBED') {
                                    console.log(`Successfully subscribed to ${typingChannelName}`);
                                } else if (status === 'CHANNEL_ERROR') {
                                    console.error(`Error subscribing to ${typingChannelName}:`, err);
                                }
                            });

                        const statusChannelName = `user-status-${friendId}`;
                        state.channels.status = client.channel(statusChannelName);

                        state.channels.status
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

                        return { chatChannel: state.channels.chat, typingChannel: state.channels.typing, statusChannel: state.channels.status };
                    } catch (error) {
                        console.error("Error setting up chat subscriptions:", error);
                        return null;
                    }
                };

                const { chatChannel, typingChannel, statusChannel } = await setupChatSubscriptions();

                await chat.markMessagesAsSeen(friendId, chatBox, oldMessages, friendAvatar);
                ui.updateUnseenBadge(friendId, 0);
                state.unseenCounts[friendId] = 0;

                inputSafe.addEventListener("input", () => {
                    sendBtnSafe.disabled = !inputSafe.value.trim();
                    try {
                        if (state.channels.typing) {
                            state.channels.typing.send({
                                type: "broadcast",
                                event: "typing",
                                payload: {
                                    userId: state.currentUserId,
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

                    sendBtnSafe.disabled = true;
                    inputSafe.value = "";

                    const tempMsg = {
                        id: 'temp-' + Date.now(),
                        sender_id: state.currentUserId,
                        receiver_id: friendId,
                        content: content,
                        created_at: new Date().toISOString(),
                        seen: false,
                        temp: true
                    };

                    ui.appendMessage(chatBox, tempMsg, true);
                    ui.updateLastMessage(friendId, content, tempMsg.created_at);

                    try {
                        await utils.sendMessage(friendId, content);
                    } catch (error) {
                        console.error("Error in handleSend:", error);
                        ui.showToast("Error sending message", "error");
                        const tempElement = chatBox.querySelector(`[data-message-id="${tempMsg.id}"]`);
                        if (tempElement) tempElement.remove();
                    } finally {
                        sendBtnSafe.disabled = false;
                        inputSafe.focus();
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
                        state.currentOpenChatId = null;
                        await utils.deleteSeenMessagesForChat(friendId);

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
                            if (state.channels.chat) await client.removeChannel(state.channels.chat);
                            if (state.channels.typing) await client.removeChannel(state.channels.typing);
                            if (state.channels.status) await client.removeChannel(state.channels.status);
                        } catch (err) {
                            console.warn("Error removing channels:", err);
                        }
                        friends.fetchFriends();
                    });
                }
            } catch (err) {
                console.error("Error opening chat:", err);
                ui.showToast("Failed to open chat.", "error");
            } finally {
                ui.hideLoading();
            }
        },

        openChatFromUrl: () => {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const friendId = urlParams.get('chat');

                if (friendId && state.currentUserId) {
                    if (friendId === AI_ASSISTANT_ID) {
                        aiAssistant.openAIChat();
                    } else {
                        client.from("user_profiles")
                            .select("user_name, profile_image_url")
                            .eq("user_id", friendId)
                            .maybeSingle()
                            .then(({ data, error }) => {
                                if (!error && data) {
                                    chat.openSpecificChat(friendId, data);
                                }
                            });
                    }
                }
            } catch (error) {
                console.error("Error opening chat from URL:", error);
            }
        },

        handleNotificationRedirect: () => {
            try {
                if (!state.currentOpenChatId && state.notificationData.type === 'message' && state.notificationData.senderId) {
                    if (state.notificationData.senderId === AI_ASSISTANT_ID) {
                        aiAssistant.openAIChat();
                    } else {
                        client
                            .from("user_profiles")
                            .select("user_name, profile_image_url")
                            .eq("user_id", state.notificationData.senderId)
                            .maybeSingle()
                            .then(({ data, error }) => {
                                if (!error && data) {
                                    chat.openChat(state.notificationData.senderId, data.user_name, data.profile_image_url, true);
                                }
                            });
                    }
                }

                state.notificationData = {};
            } catch (error) {
                console.error("Error handling notification redirect:", error);
            }
        }
    };

    // Auth functions
    const auth = {
        getCurrentUser: async () => {
            try {
                const { data: { user }, error } = await client.auth.getUser();
                if (error || !user) {
                    ui.showToast("User not logged in", "error");
                    window.location.href = 'signup.html';
                    return null;
                }
                state.currentUserId = user.id;
                console.log("Current user ID:", state.currentUserId);

                await utils.ensureCurrentUserInUsersTable();

                await utils.setUserOnlineStatus(true);

                await auth.checkAndShowAdminRequestPopup();

                return user;
            } catch (err) {
                console.error("getCurrentUser error:", err);
                ui.showToast("Failed to get current user.", "error");
                return null;
            }
        },

        checkAndShowAdminRequestPopup: async () => {
            if (localStorage.getItem(ADMIN_REQUEST_KEY) === 'true') return;

            try {
                const { data: { user }, error: userError } = await client.auth.getUser();
                if (userError || !user) return;

                const createdAt = new Date(user.created_at);
                const now = new Date();
                const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);

                if (hoursSinceCreation > 24) {
                    localStorage.setItem(ADMIN_REQUEST_KEY, 'true');
                    return;
                }

                const { data: adminProfile, error: adminError } = await client
                    .from("user_profiles")
                    .select("user_id")
                    .eq("user_name", ADMIN_USERNAME)
                    .maybeSingle();

                if (adminError || !adminProfile) {
                    localStorage.setItem(ADMIN_REQUEST_KEY, 'true');
                    return;
                }

                const isAdminFriend = await utils.isAlreadyFriend(adminProfile.user_id);
                if (isAdminFriend) {
                    localStorage.setItem(ADMIN_REQUEST_KEY, 'true');
                    return;
                }

                ui.showConfirmPopup(
                    `Would you like to send a friend request to Admin ${ADMIN_USERNAME}?`,
                    async () => {
                        await friendRequests.sendFriendRequest(ADMIN_USERNAME);
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
        },

        fetchCurrentUserAvatar: async (profileImageSelector = '.profile-pic') => {
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
    };

    // Database functions
    const database = {
        initializeDatabaseSchema: async () => {
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
        },

        ensureUsersTableExists: async () => {
            try {
                const { data, error } = await client.rpc('exec_sql', {
                    sql: "SELECT to_regclass('public.users') as table_exists;"
                });

                if (error || !data || !data[0] || !data[0].table_exists) {
                    console.log("Users table doesn't exist, creating it...");

                    const { error: createError } = await client.rpc('exec_sql', {
                        sql: `
                            CREATE TABLE IF NOT EXISTS users (
                                id UUID PRIMARY KEY,
                                name TEXT,
                                email TEXT,
                                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                            );
                        `
                    });

                    if (createError) {
                        console.error("Error creating users table:", createError);
                        return false;
                    }

                    console.log("Users table created successfully");
                    return true;
                }

                return true;
            } catch (err) {
                console.error("Exception when checking users table:", err);
                return false;
            }
        },

        checkAndFixDatabaseSchema: async () => {
            try {
                console.log("Checking database schema...");

                await database.ensureUsersTableExists();

                try {
                    console.log("Attempting to add sender foreign key constraint...");
                    const { error: senderError } = await client.rpc('exec_sql', {
                        sql: `ALTER TABLE messages ADD CONSTRAINT IF NOT EXISTS messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;`
                    });

                    if (senderError) {
                        console.error("Error adding sender foreign key constraint:", senderError);
                    } else {
                        console.log("Sender foreign key constraint added successfully");
                    }
                } catch (senderErr) {
                    console.error("Exception when adding sender foreign key constraint:", senderErr);
                }

                try {
                    console.log("Attempting to add receiver foreign key constraint...");
                    const { error: receiverError } = await client.rpc('exec_sql', {
                        sql: `ALTER TABLE messages ADD CONSTRAINT IF NOT EXISTS messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE;`
                    });

                    if (receiverError) {
                        console.error("Error adding receiver foreign key constraint:", receiverError);
                    } else {
                        console.log("Receiver foreign key constraint added successfully");
                    }
                } catch (receiverErr) {
                    console.error("Exception when adding receiver foreign key constraint:", receiverErr);
                }

                return true;
            } catch (err) {
                console.error("Error checking database schema:", err);
                return false;
            }
        },

        checkAndFixForeignKeys: async () => {
            try {
                console.log("Checking foreign key constraints...");
                return true;
            } catch (err) {
                console.error("Error in checkAndFixForeignKeys:", err);
                return false;
            }
        }
    };

    // Realtime functions
    const realtime = {
        setupRealtimeSubscriptions: async () => {
            try {
                state.channels.globalMessages = client.channel('global-messages');

                state.channels.globalMessages
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'messages',
                        filter: `receiver_id=eq.${state.currentUserId}`
                    }, async (payload) => {
                        const newMsg = payload.new;
                        if (!newMsg || !state.currentUserId) return;

                        const senderId = newMsg.sender_id;

                        if (state.currentOpenChatId !== senderId) {
                            ui.updateUnseenCountForFriend(senderId);
                            ui.updateLastMessage(senderId, newMsg.content, newMsg.created_at);

                            try {
                                let senderName, senderAvatar;

                                const { data: senderProfile } = await client
                                    .from("user_profiles")
                                    .select("user_name, profile_image_url")
                                    .eq("user_id", senderId)
                                    .maybeSingle();

                                senderName = senderProfile?.user_name || "New Message";
                                senderAvatar = senderProfile?.profile_image_url || DEFAULT_PROFILE_IMG;

                                ui.showTopRightPopup(`New message from ${senderName}`, "info", senderAvatar);

                                if (Notification.permission === "granted") {
                                    const notif = new Notification(senderName, {
                                        body: newMsg.content,
                                        icon: senderAvatar,
                                        data: { type: 'message', senderId, senderName }
                                    });

                                    notif.addEventListener('click', () => {
                                        window.focus();
                                        if (senderId === AI_ASSISTANT_ID) {
                                            aiAssistant.openAIChat();
                                        } else {
                                            chat.openSpecificChat(senderId);
                                        }
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
                        filter: `receiver_id=eq.${state.currentUserId}`
                    }, (payload) => {
                        const updatedMsg = payload.new;
                        if (!updatedMsg || !state.currentUserId) return;

                        if (updatedMsg.deleted_at) {
                            ui.updateLastMessageInChatList(updatedMsg.sender_id);
                            ui.updateLastMessageInChatList(updatedMsg.receiver_id);

                            if (state.currentOpenChatId !== updatedMsg.sender_id) {
                                ui.updateUnseenCountForFriend(updatedMsg.sender_id);
                            }
                            return;
                        }

                        if (updatedMsg.receiver_id === state.currentUserId && updatedMsg.seen === true) {
                            const senderId = updatedMsg.sender_id;

                            if (state.currentOpenChatId !== senderId) {
                                ui.updateUnseenCountForFriend(senderId);
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

                state.channels.friendRequests = client.channel(`friend-requests-${state.currentUserId}`);

                state.channels.friendRequests
                    .on('postgres_changes', {
                        event: '*',
                        schema: 'public',
                        table: 'requests',
                        filter: `receiver_id=eq.${state.currentUserId}`
                    }, async (payload) => {
                        console.log("Friend request event received:", payload);
                        const { eventType, new: newRecord, old: oldRecord } = payload;

                        if (eventType === 'INSERT' && newRecord.status === "pending") {
                            console.log("New friend request received:", newRecord);

                            try {
                                const { data: senderProfile } = await client
                                    .from("user_profiles")
                                    .select("user_name, profile_image_url")
                                    .eq("user_id", newRecord.sender_id)
                                    .maybeSingle();

                                const senderName = senderProfile?.user_name || "Someone";
                                const senderAvatar = senderProfile?.profile_image_url || DEFAULT_PROFILE_IMG;

                                ui.showTopRightPopup(`${senderName} sent you a friend request`, "info", senderAvatar);

                                if (Notification.permission === "granted") {
                                    const notif = new Notification("Friend Request 👥", {
                                        body: `${senderName} sent you a request`,
                                        icon: senderAvatar,
                                        data: { type: 'friend_request', senderId: newRecord.sender_id }
                                    });

                                    notif.addEventListener('click', () => {
                                        window.focus();
                                        chat.openSpecificChat(newRecord.sender_id);
                                        notif.close();
                                    });
                                }
                            } catch (err) {
                                console.error("Error fetching sender profile for notification:", err);
                            }

                            friendRequests.fetchFriendRequests();
                        } else if (eventType === 'UPDATE') {
                            console.log("Friend request updated:", newRecord);

                            if (newRecord.status === "accepted") {
                                if (newRecord.sender_id === state.currentUserId) {
                                    ui.showTopRightPopup("Your friend request was accepted!", "success");
                                } else {
                                    ui.showTopRightPopup("You accepted a friend request!", "success");
                                }
                                friends.fetchFriends();
                            } else if (newRecord.status === "rejected") {
                                if (newRecord.sender_id === state.currentUserId) {
                                    ui.showTopRightPopup("Your friend request was rejected", "warning");
                                } else {
                                    ui.showTopRightPopup("You rejected a friend request", "info");
                                }
                            }

                            friendRequests.fetchFriendRequests();
                        } else if (eventType === 'DELETE') {
                            console.log("Friend request deleted:", oldRecord);
                            friendRequests.fetchFriendRequests();
                        }
                    })
                    .subscribe((status, err) => {
                        if (status === 'SUBSCRIBED') {
                            console.log('Successfully subscribed to friend requests');
                            friendRequests.fetchFriendRequests();
                        } else if (status === 'CHANNEL_ERROR') {
                            console.error('Error subscribing to friend requests:', err);
                        }
                    });

                state.channels.friendsUpdates = client.channel('friends-updates');

                state.channels.friendsUpdates
                    .on('postgres_changes', {
                        event: '*',
                        schema: 'public',
                        table: 'friends'
                    }, (payload) => {
                        console.log("Friends update event received:", payload);

                        const { eventType, new: newRecord, old: oldRecord } = payload;

                        const isRelevant = newRecord && (
                            newRecord.user1_id === state.currentUserId ||
                            newRecord.user2_id === state.currentUserId
                        ) || oldRecord && (
                            oldRecord.user1_id === state.currentUserId ||
                            oldRecord.user2_id === state.currentUserId
                        );

                        if (!isRelevant) return;

                        if (eventType === 'INSERT') {
                            console.log("New friend added:", newRecord);
                            friends.fetchFriends();
                        } else if (eventType === 'DELETE') {
                            console.log("Friend removed:", oldRecord);
                            friends.fetchFriends();
                        }
                    })
                    .subscribe((status, err) => {
                        if (status === 'SUBSCRIBED') {
                            console.log('Successfully subscribed to friends updates');
                        } else if (status === 'CHANNEL_ERROR') {
                            console.error('Error subscribing to friends updates:', err);
                        }
                    });

                state.channels.userProfilesUpdates = client.channel('user-profiles-updates');

                state.channels.userProfilesUpdates
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'user_profiles'
                    }, (payload) => {
                        console.log("User profile update event received:", payload);

                        const { new: newRecord } = payload;

                        if (state.allFriends.has(newRecord.user_id)) {
                            state.allFriends.set(newRecord.user_id, {
                                ...state.allFriends.get(newRecord.user_id),
                                ...newRecord
                            });

                            ui.updateFriendUI(newRecord.user_id);
                        }

                        if (newRecord.user_id === state.currentUserId) {
                            auth.fetchCurrentUserAvatar();
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
                setTimeout(realtime.setupRealtimeSubscriptions, 5000);
            }
        }
    };

    // Profile management functions
    const profile = {
        setupProfileElements: () => {
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

                    if (currentLength > MAX_BIO_LENGTH * 0.9) {
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
                        bioInput.value.length >= MAX_BIO_LENGTH &&
                        !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                    }
                });

                bioInput.addEventListener('paste', (e) => {
                    const paste = (e.clipboardData || window.clipboardData).getData('text');
                    if (bioInput.value.length + paste.length > MAX_BIO_LENGTH) {
                        e.preventDefault();
                    }
                });
            }

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

                    if (currentLength > MAX_USERNAME_LENGTH * 0.9) {
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
                        newUsernameInput.value.length >= MAX_USERNAME_LENGTH &&
                        !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                    }
                });

                newUsernameInput.addEventListener('paste', (e) => {
                    const paste = (e.clipboardData || window.clipboardData).getData('text');
                    if (newUsernameInput.value.length + paste.length > MAX_USERNAME_LENGTH) {
                        e.preventDefault();
                    }
                });
            }

            profilePic?.addEventListener("click", async () => {
                try {
                    if (!profilePopup) return;
                    ui.showModal("profile-popup");

                    try {
                        const { data: profile, error } = await client
                            .from("user_profiles")
                            .select("profile_image_url, bio, user_name")
                            .eq("user_id", state.currentUserId)
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
                        ui.showToast("Failed to load profile details.", "error");
                    }
                } catch (error) {
                    console.error("Error handling profile pic click:", error);
                }
            });

            closeProfile?.addEventListener("click", () => {
                try {
                    ui.hideModal("profile-popup");
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
                    saveProfileBtn.appendChild(ui.createLoader());

                    try {
                        let imageUrl = profilePreview?.src || DEFAULT_PROFILE_IMG;
                        const bio = bioInput?.value.trim() || "";

                        const file = profileUpload?.files[0];
                        if (file) {
                            const fileName = `${state.currentUserId}_${Date.now()}_${file.name}`;
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
                            .eq("user_id", state.currentUserId);

                        if (error) throw error;

                        saveProfileBtn.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                                <path d="M20 6L9 17l-5 5"></path>
                            </svg>
                            Saved!
                        `;

                        ui.showToast("Profile updated successfully!", "success");
                        ui.showTopRightPopup("Profile updated successfully!", "success");

                        setTimeout(() => {
                            saveProfileBtn.disabled = false;
                            saveProfileBtn.innerHTML = originalContent;
                            ui.hideModal("profile-popup");
                        }, 1500);

                        auth.fetchCurrentUserAvatar();
                        friends.fetchFriends();
                    } catch (err) {
                        console.error("Error updating profile:", err);
                        ui.showToast(`Failed to update profile: ${err.message || err}`, "error");

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
                    ui.showConfirmPopup(
                        "Are you sure you want to logout?",
                        async () => {
                            ui.showLoading("Logging out...");
                            try {
                                await utils.setUserOnlineStatus(false);
                                await client.auth.signOut();
                                ui.showToast("Logged out!", "info");
                                ui.showTopRightPopup("Logged out successfully!", "info");
                                window.location.href = "signup.html";
                            } catch (err) {
                                console.error("Logout error:", err);
                                ui.showToast("Logout failed.", "error");
                            } finally {
                                ui.hideLoading();
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
                    ui.hideModal("profile-popup");
                    ui.showModal("username-popup");
                } catch (error) {
                    console.error("Error handling change username click:", error);
                }
            });

            closeUsername?.addEventListener("click", () => {
                try {
                    ui.hideModal("username-popup");
                } catch (error) {
                    console.error("Error handling close username click:", error);
                }
            });

            cancelUsername?.addEventListener("click", () => {
                try {
                    ui.hideModal("username-popup");
                } catch (error) {
                    console.error("Error handling cancel username click:", error);
                }
            });

            saveUsernameBtn?.addEventListener("click", async () => {
                try {
                    const newUsername = newUsernameInput?.value.trim();
                    if (!newUsername) {
                        ui.showToast("Username cannot be empty!", "error");
                        return;
                    }

                    const originalContent = saveUsernameBtn.innerHTML;

                    saveUsernameBtn.disabled = true;
                    saveUsernameBtn.innerHTML = '';
                    saveUsernameBtn.appendChild(ui.createLoader());

                    try {
                        const { error } = await client
                            .from("user_profiles")
                            .update({ user_name: newUsername })
                            .eq("user_id", state.currentUserId);

                        if (error) throw error;

                        saveUsernameBtn.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                                <path d="M20 6L9 17l-5 5"></path>
                            </svg>
                            Saved!
                        `;

                        ui.showToast("Username updated!", "success");
                        ui.showTopRightPopup("Username updated successfully!", "success");
                        profileUsername.textContent = newUsername;

                        setTimeout(() => {
                            saveUsernameBtn.disabled = false;
                            saveUsernameBtn.innerHTML = originalContent;
                            ui.hideModal("username-popup");
                        }, 1500);

                        friends.fetchFriends();
                    } catch (err) {
                        console.error("Error updating username:", err);
                        ui.showToast(`Failed to update username: ${err.message || err}`, "error");

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
        }
    };

    // Event listeners setup
    const setupEventListeners = () => {
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

        document.querySelector(".submit-friend")?.addEventListener("click", () => {
            try {
                const username = document.querySelector(".friend-input")?.value.trim();
                friendRequests.sendFriendRequest(username);
            } catch (error) {
                console.error("Error handling submit friend request click:", error);
            }
        });

        document.querySelector(".addFriends")?.addEventListener("click", () => {
            try {
                ui.showModal("friendModal");
            } catch (error) {
                console.error("Error handling add friends click:", error);
            }
        });

        document.querySelector("#friendModal .close")?.addEventListener("click", () => {
            try {
                ui.hideModal("friendModal");
            } catch (error) {
                console.error("Error handling close friend modal click:", error);
            }
        });

        document.querySelector("#friend-requests-popup .popup-close")?.addEventListener("click", () => {
            try {
                document.getElementById("friend-requests-popup").classList.remove("show");
            } catch (error) {
                console.error("Error handling close friend requests popup click:", error);
            }
        });

        window.addEventListener('beforeunload', () => {
            utils.setUserOnlineStatus(false);
            Object.values(state.deletionTimeouts).forEach(timeoutId => clearTimeout(timeoutId));

            Object.values(state.channels).forEach(channel => {
                if (channel) client.removeChannel(channel);
            });

            if (state.statusInterval) {
                clearInterval(state.statusInterval);
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                utils.setUserOnlineStatus(true);
            } else {
                utils.setUserOnlineStatus(false);
            }
        });
    };

    window.openChatWithUser = async function (userId) {
        try {
            if (!state.currentUserId) return;

            if (userId === AI_ASSISTANT_ID) {
                aiAssistant.openAIChat();
                return;
            }

            const { data: profile, error } = await client
                .from("user_profiles")
                .select("user_name, profile_image_url")
                .eq("user_id", userId)
                .maybeSingle();

            if (error) throw error;

            if (profile) {
                chat.openSpecificChat(userId, profile);
            } else {
                ui.showToast("User not found", "error");
            }
        } catch (err) {
            console.error("Error opening chat with user:", err);
            ui.showToast("Failed to open chat", "error");
        }
    };

    const initializeApp = async () => {
        try {
            console.log("Starting application initialization...");

            await database.checkAndFixForeignKeys();

            const me = await auth.getCurrentUser();
            if (me) {
                await utils.ensureCurrentUserInUsersTable();

                await database.checkAndFixDatabaseSchema();
                await database.initializeDatabaseSchema();

                await aiAssistant.initialize();

                await friends.fetchFriends();
                await friendRequests.fetchFriendRequests();

                await realtime.setupRealtimeSubscriptions();
                await friends.fetchRecentChats();

                if (Object.keys(state.notificationData).length > 0) {
                    chat.handleNotificationRedirect();
                }

                chat.openChatFromUrl();

                const updateOnlineStatus = async () => {
                    try {
                        await utils.setUserOnlineStatus(true);
                        console.log("Online status updated");
                    } catch (error) {
                        console.error("Error updating online status:", error);
                    }
                };

                state.statusInterval = setInterval(updateOnlineStatus, 30000);
            }
        } catch (error) {
            console.error("Error initializing app:", error);
            ui.showToast("Failed to initialize application. Please refresh the page.", "error");
        }
    };

    initializeApp();
    profile.setupProfileElements();
    setupEventListeners();
    await utils.requestNotificationPermission();
    auth.fetchCurrentUserAvatar();
});