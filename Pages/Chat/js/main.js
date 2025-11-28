import { 
    chatContainer,
    messageInput,
    sendBtn,
    renderChatList, 
    renderMessages, 
    appendMessageToUI, 
    updateChatHeader,
    scrollToBottom,
    messageContainer,
    prependMessagesToUI
} from './ui.js';

import { 
    getLocalConversations, 
    saveConversations, 
    getLocalMessages, 
    saveMessages ,
    deleteMessage,
    updateSingleConversation
} from './db.js';

import { 
    targetUserProfileCleanUp,
    targetUserProfile 
} from './profile.js';

const BASE_URL = "http://localhost:8000";
const socket = io(BASE_URL, { withCredentials: true });
const chatHeader = document.querySelector(".chat-header")
export let allConversations = [];
let selectedChatId = null; 
const notifyMap = new Map(); 
export const currentUser = JSON.parse(window.localStorage.getItem("user"));

let hasMoreMessages = true; 
let isLoadingHistory = false;

socket.on("connect", async () => {
    console.log("✅ Connection restored! Starting Background Sync...");

    if (selectedChatId) {
        const localMsgs = await getLocalMessages(selectedChatId._id);
        const pendingMsgs = localMsgs.filter(m => 
            m._id &&  m._id.startsWith("temp_")
        );
        
        if (pendingMsgs.length > 0) {
            console.log(`Resending ${pendingMsgs.length} pending messages...`);
            pendingMsgs.forEach(msg => emitMessageWithAck(msg));
        }
    }
    
    await getAllConversations(); 

    console.log("Checking all chats for synchronization...");

    for (const chat of allConversations) {
        if (!chat.lastMessage || !chat.lastMessage.createdAt) continue;

        const localMsgs = await getLocalMessages(chat._id);
        
        if (localMsgs.length === 0) {
            console.log(`Chat ${chat.name} is empty locally. Syncing...`);
            await loadMessages(chat._id);
            continue;
        }

        localMsgs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        const realLocalMsgs = localMsgs.filter(m => !m._id.startsWith("temp_"));
        const lastLocalMsg = realLocalMsgs[realLocalMsgs.length - 1];

        if (!lastLocalMsg || lastLocalMsg._id !== chat.lastMessage._id) {
            console.log(`Syncing ${chat.name || "Chat"} (Server is newer)...`);
            await loadMessages(chat._id);
            
            if (!selectedChatId || selectedChatId._id !== chat._id) {
                notifyMap.set(chat._id, chat.unreadCount || 0);
            }
        }
    }
    
    renderChatList(allConversations, notifyMap, selectedChatId, currentUser);
});
document.addEventListener("DOMContentLoaded", async () => {
    if (!currentUser) return console.error("User not found in localStorage");
    console.log("Logged in as:", currentUser.userName);
    selectedChatId=null;
    await getAllConversations();
});

export const getAllConversations = async (conversationId) => {

    try {
        const localData = await getLocalConversations();
        if (localData.length > 0) {
            console.log(" Rendering from IndexedDB (Offline Cache)");
            allConversations = localData;
            allConversations.forEach(c => notifyMap.set(c._id, c.unreadCount || 0));
            renderChatList(allConversations, notifyMap, selectedChatId, currentUser);
        }
    } catch (e) {
        console.error("IDB Read Error:", e);
    }

    try {
        const response = await axios.get(`${BASE_URL}/api/v1/conversation`, { withCredentials: true });
        
        if (response.data && response.data.data) {
            const serverData = response.data.data;
            console.log("Network Data Received. Updating Cache.");
            allConversations = serverData;
            await saveConversations(serverData);
            allConversations.forEach(c => {
                notifyMap.set(c._id, c.unreadCount || 0);
            });
            // console.log(allConversations);
            
            if(conversationId){
                const foundChat = allConversations.find(c => c._id === conversationId);
                if (foundChat) {
                    selectedChatId = foundChat;
                    updateChatHeader(selectedChatId, currentUser);
                    loadMessages(conversationId); 
                }
            }

            renderChatList(allConversations, notifyMap, selectedChatId, currentUser);
        }
    } catch (error) {
        console.error("Error fetching conversations:", error);
    }
};

async function loadMessages(conversationId) {
    const chatObj = allConversations.find(c => c._id === conversationId);
    const participants = chatObj ? chatObj.participants : [];

    const isChatOpen = selectedChatId && selectedChatId._id === conversationId;
    if (isChatOpen) {
        hasMoreMessages = true;
        isLoadingHistory = false;
    }

    const localMsgs = await getLocalMessages(conversationId);

    if (localMsgs.length > 0 && isChatOpen) {
        
        renderMessages(localMsgs, currentUser);
    }
    try {
        const response = await axios.get(`${BASE_URL}/api/v1/messages/${conversationId}?limit=20`, {
            withCredentials: true
        });
        
        const messages = response.data.data || [];
        
        if (isChatOpen) {
            renderMessages(messages, currentUser, participants);
            
            if (messages.length > 0) {
                 axios.put(`${BASE_URL}/api/v1/messages/seen/${conversationId}`, {}, {
                    withCredentials: true
                }).catch(err => console.error("Failed to mark seen:", err));
            }
        }

        if (messages.length > 0) await saveMessages(messages);

    } catch (err) {
        console.error("Error loading messages:", err);
    }
}

chatContainer.addEventListener("click", async (e) => {
    targetUserProfileCleanUp();

    const item = e.target.closest(".chat-item");
    if (!item) return;
    
    const convoId = item.getAttribute("data-id");
    if (selectedChatId && selectedChatId._id === convoId) return;

    selectedChatId = allConversations.find(c => c._id === convoId);
    console.log("Chat container, ",selectedChatId._id);
    
    notifyMap.set(convoId, 0); 
    
    renderChatList(allConversations, notifyMap, selectedChatId, currentUser);
    updateChatHeader(selectedChatId, currentUser);

    socket.emit("JOIN_CONVERSATION", { conversationId: convoId });

    await loadMessages(convoId);
    // console.log("done");
    

    allConversations.forEach(c=>{
        if (c._id === convoId) {
            c.unreadCount=0;
        }
    })
});

sendBtn.addEventListener("click", handleSendMessage);
messageInput.addEventListener("keypress",(e)=>{
    if (e.key === "Enter") {
        e.preventDefault(); 
        handleSendMessage();
    }
})

async function handleSendMessage() {
    const text = messageInput.value.trim();
    if (!text || !selectedChatId) return;

    const members = selectedChatId.participants.map(e => e._id.toString()); 
    const tempId = "temp_" + Date.now(); 

    const messagePayload = {
        _id: tempId, 
        conversationId: selectedChatId._id,
        text,
        members,
        sender: currentUser._id,
        tempId: tempId, 
        createdAt: new Date().toISOString(),
        seen: [],
        status: "pending"
    };
    updateConversationList(selectedChatId._id, text, new Date());
    appendMessageToUI(messagePayload, currentUser, selectedChatId.participants);
    await saveMessages([messagePayload]); 

    messageInput.value = "";
    scrollToBottom();

    emitMessageWithAck(messagePayload);
}

socket.on("NEW_MESSAGE", ({ message }) => {
    const senderId = message.sender._id || message.sender;
    if (senderId.toString() === currentUser._id.toString()) return; 
    
    // 🟢 FIX: Ensure participants are available
    const chatObj = allConversations.find(c => c._id === message.conversationId);
    const participants = chatObj ? chatObj.participants : [];
    
    const isChatOpen = selectedChatId && selectedChatId._id === message.conversationId;

    if (isChatOpen) {
        appendMessageToUI(message, currentUser, participants);
        socket.emit("MESSAGE_SEEN", { conversationId: message.conversationId, messageId: message._id });
    } else {
        const currentCount = notifyMap.get(message.conversationId) || 0;
        notifyMap.set(message.conversationId, currentCount + 1);
    }
    
    saveMessages([message]); 
    updateConversationList(message.conversationId, message.text, message.createdAt);
});

socket.on("MESSAGE_SEEN", ({ messageId, userId, name, seenAt }) => {
    const msgEl = document.querySelector(`.message-wrapper[data-id="${messageId}"]`);
    
    if (msgEl) {
        let seenList = JSON.parse(msgEl.getAttribute("data-seen") || "[]");
        
        const exists = seenList.some(u => String(u.userId) === String(userId));
        
        if (!exists) {
            seenList.push({ userId, name, seenAt });
            msgEl.setAttribute("data-seen", JSON.stringify(seenList));
            
            const modal = document.getElementById('seen-modal');
            if (modal.style.display === "flex") {
                 console.log(`Updated seen list for message ${messageId}`);
            }
        }
    }
});

function updateConversationList(conversationId, text, time) {
    let targetConvo = null;
    const otherConvos = [];

    allConversations.forEach(c => {
        if (c._id === conversationId) {
            c.lastMessage = { text, createdAt: time };
            targetConvo = c;
        } else {
            otherConvos.push(c);
        }
    });

    if (targetConvo) {
        allConversations = [targetConvo, ...otherConvos];
        renderChatList(allConversations, notifyMap, selectedChatId, currentUser);
        updateSingleConversation(targetConvo).catch(err => console.error("Failed to save convo update", err));
    }
}

chatHeader.addEventListener("click",(e)=>{
    console.log(chatHeader);
    
    targetUserProfile(e,selectedChatId)
})
document.querySelector(".profile-btn").addEventListener("click",e=> targetUserProfile(e,currentUser))

socket.on("MESSAGE_CONFIRMED", async ({ tempId, savedMessage }) => {
    await saveMessages([savedMessage]);
    await deleteMessage("temp_" + tempId); 
});


socket.on("MESSAGE_CONFIRMED", async ({ tempId, savedMessage }) => {
    await saveMessages([savedMessage]);
    
    await deleteMessage("temp_" + tempId); 
});

async function fetchOlderMessages() {
    if (isLoadingHistory || !hasMoreMessages || !selectedChatId) return;

    const topMsg = messageContainer.firstElementChild;
    if (!topMsg) return;

    const lastTime = topMsg.getAttribute("data-time");
    if (!lastTime) return;

    isLoadingHistory = true;

    try {
        const response = await axios.get(
            `${BASE_URL}/api/v1/messages/${selectedChatId._id}?limit=20&before=${lastTime}`, 
            { withCredentials: true }
        );

        const olderMessages = response.data.data || [];

        if (olderMessages.length > 0) {
            // Prepend to UI (Don't save to DB)
            prependMessagesToUI(olderMessages, currentUser, selectedChatId.participants);
        } else {
            hasMoreMessages = false; 
        }
        
        if(olderMessages.length < 20) hasMoreMessages = false;

    } catch (error) {
        console.error("History error:", error);
    } finally {
        isLoadingHistory = false;
    }
}

if(messageContainer) {
    messageContainer.addEventListener("scroll", () => {
        if (messageContainer.scrollTop === 0 && hasMoreMessages) {
            fetchOlderMessages();
        }
    });
}


function emitMessageWithAck(payload) {
    if (!socket.connected) return; 

    const { _id, ...serverPayload } = payload;

    socket.timeout(5000).emit("SEND_MESSAGE", serverPayload, async (err, response) => {
        if (err) {
            console.warn(`Timeout: Server did not ACK ${payload.tempId}`);
            markMessageFailed(payload);
            return; 
        }

        if (!response || !response.success) {
            console.error(`Server Error: ${response?.error}`);
            markMessageFailed(payload);
            return;
        }

        await swapTempForReal(payload._id, response.savedMessage);
    });
}

async function swapTempForReal(tempId, realMessage) {
    await deleteMessage(tempId);       
    await saveMessages([realMessage]); 

    const msgElement = document.querySelector(`[data-id="${tempId}"]`);
    if (msgElement) {
        msgElement.setAttribute("data-id", realMessage._id);
        const icon = msgElement.querySelector(".msg-status-icon");
        if(icon) icon.innerHTML = ""; 
    }
}

function markMessageFailed(payload) {
    const msgEl = document.querySelector(`[data-id="${payload._id}"]`);
    if (!msgEl) return;

    msgEl.classList.add("failed");

    const iconEl = msgEl.querySelector(".msg-status-icon");
    if (iconEl) {
        iconEl.innerText = "❗"; 
        
        const newIcon = iconEl.cloneNode(true);
        iconEl.parentNode.replaceChild(newIcon, iconEl);
        
        newIcon.addEventListener("click", (e) => {
            e.stopPropagation(); 
            msgEl.classList.remove("failed");
            newIcon.innerText = "🕒";
            emitMessageWithAck(payload);
        });
    }
}