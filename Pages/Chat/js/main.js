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
    prependMessagesToUI,
    syncReadReceipts
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
import { refreshCurrentSeenModal } from './seen.js';

const BASE_URL = "http://localhost:8000";
const socket = io(BASE_URL, { withCredentials: true });

const chatHeader = document.querySelector(".chat-header");

export let allConversations = [];
export const currentUser = JSON.parse(window.localStorage.getItem("user"));
let selectedChatId = null; 
const notifyMap = new Map(); 
let hasMoreMessages = true; 
let isLoadingHistory = false;

document.addEventListener("DOMContentLoaded", async () => {
    if (!currentUser) return console.error("User not found in localStorage");
    console.log("Logged in as:", currentUser.userName);
    selectedChatId=null;
    await getAllConversations();
});

socket.on("connect", async () => {
    console.log("✅ Connection restored! Starting Background Sync...");

    await getAllConversations(); 

    if (!selectedChatId) return;

    const currentChat = allConversations.find(c => c._id === selectedChatId._id);
    if (!currentChat) return; 

    const localMsgs = await getLocalMessages(currentChat._id);
    
    const pendingMsgs = localMsgs.filter(m => m._id && m._id.startsWith("temp_"));
    
    if (pendingMsgs.length > 0) {
        console.log(`Resending ${pendingMsgs.length} pending messages...`);
        pendingMsgs.forEach(msg => emitMessageWithAck(msg));
    }

    const realLocalMsgs = localMsgs
        .filter(m => !m._id.toString().startsWith("temp_"))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const lastLocalMsg = realLocalMsgs[realLocalMsgs.length - 1];
    const serverLastMsgId = currentChat.lastMessage?._id || currentChat.lastMessage;

    if (serverLastMsgId) {
        if (!lastLocalMsg || lastLocalMsg._id !== serverLastMsgId) {
            console.log(`Syncing active chat (Server is newer)...`);
            await loadMessages(currentChat._id);
        } else {
            console.log("Active chat is already up to date.");
        }
    }

    syncReadReceipts(currentChat._id);
});

socket.on("NEW_MESSAGE", ({ message }) => {
    const senderId =  message.sender.toString();
    if (senderId.toString() === currentUser._id.toString()) return; 
    
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
    updateConversationList(message.conversationId, message.text, message.createdAt,senderId);
});

socket.on("MESSAGE_SEEN", ({ messageId, userId, name, seenAt }) => {
    let msgEl = document.querySelector(`.message-wrapper[data-id="${messageId}"]`);
    
    
    if (msgEl) {
        let seenList = JSON.parse(msgEl.getAttribute("data-seen") || "[]");
        
        const exists = seenList.find(u => String(u.userId) === String(userId));
        
        if (!exists) {
            seenList.push({ userId, name, seenAt });
            msgEl.setAttribute("data-seen", JSON.stringify(seenList));
            
            const modal = document.getElementById('seen-modal');
            if (modal && modal.style.display === "flex") {
                refreshCurrentSeenModal();
            }
        }
    }
});

chatContainer.addEventListener("click", async (e) => {
    targetUserProfileCleanUp();
    document.querySelector(".no-chat-placeholder").style.display="none";
    document.querySelector(".column-active-chat").style.display="flex";
    const isMobile = window.matchMedia("(max-width: 425px)").matches;

    if(isMobile){
        document.querySelector(".column-active-chat").style.display="flex";
        document.querySelector(".column-chat-list ").style.display="none";
    }
    const item = e.target.closest(".chat-item");
    if (!item) return;
    // console.log(item);
    
    const convoId = item.getAttribute("data-id");
    if (selectedChatId && selectedChatId._id === convoId) return;

    selectedChatId = allConversations.find(c => c._id === convoId);
    // console.log("Chat container, ",selectedChatId._id);
    
    notifyMap.set(convoId, 0); 
    
    renderChatList(allConversations, notifyMap, selectedChatId, currentUser);
    updateChatHeader(selectedChatId, currentUser);
    renderMessages([], currentUser, []);

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
});

chatHeader.addEventListener("click",(e)=>{
    console.log(chatHeader);
    targetUserProfile(e,selectedChatId)
});

document.querySelector(".profile-btn").addEventListener("click",e=> targetUserProfile(e,currentUser));

if(messageContainer) {
    messageContainer.addEventListener("scroll", () => {
        if (messageContainer.scrollTop === 0 && hasMoreMessages) {
            fetchOlderMessages();
        }
    });
}


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
    console.log(conversationId,"load");
    
    const chatObj = allConversations.find(c => c._id === conversationId);
    const participants = chatObj ? chatObj.participants : [];

    const isChatOpen = selectedChatId && selectedChatId._id === conversationId;
    if (isChatOpen) {
        hasMoreMessages = true;
        isLoadingHistory = false;
    }

    const localMsgs = await getLocalMessages(conversationId);

    if (localMsgs.length > 0 && isChatOpen) {
        console.log("laod loacla",localMsgs);
        
        renderMessages(localMsgs, currentUser,participants);
    }
    try {
        const response = await axios.get(`${BASE_URL}/api/v1/messages/${conversationId}?limit=20`, {
            withCredentials: true
        });
        
        let messages = response.data.data || [];
        
        const isStillSelected = selectedChatId && selectedChatId._id === conversationId;
        
        if (isStillSelected) {
            messages = markMessagesAsSeenOptimistically(messages);

            renderMessages(messages, currentUser, participants);
            
            if (messages.length > 0) {
                axios.put(`${BASE_URL}/api/v1/messages/seen/${conversationId}`, {}, {
                    withCredentials: true
                }).catch(err => console.error("Failed to mark seen:", err));
            }
        } 
        console.log("network load", messages);
        

        if (messages.length > 0) await saveMessages(messages);

    } catch (err) {
        console.error("Error loading messages:", err);
    }
}

async function handleSendMessage() {
    const text = messageInput.value.trim();
    if (!text || !selectedChatId) return;

    const members = selectedChatId.participants.map(e => e._id.toString()); 
    const tempId = "temp_" + Date.now(); 
    const frozenTime = new Date().toISOString();

    const messagePayload = {
        _id: tempId, 
        conversationId: selectedChatId._id,
        text,
        members,
        sender: currentUser._id,
        tempId: tempId, 
        createdAt: frozenTime,
        seen: [{
            userId: currentUser._id,
            name: currentUser.userName || currentUser.firstName,
            seenAt: new Date().toISOString()
        }],
    };
    updateConversationList(selectedChatId._id, text, frozenTime,currentUser._id);
    appendMessageToUI(messagePayload, currentUser, selectedChatId.participants);
    await saveMessages([messagePayload]); 

    messageInput.value = "";
    scrollToBottom();

    emitMessageWithAck(messagePayload);
}

function updateConversationList(conversationId, text, time,sender) {
    let targetConvo = null;
    const otherConvos = [];

    allConversations.forEach(c => {
        if (c._id === conversationId) {
            c.lastMessage = { text, createdAt: time ,sender};
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


async function emitMessageWithAck(payload) {
    if (socket.connected){
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

    
}

async function swapTempForReal(tempId, realMessage) {
    await deleteMessage(tempId);        
    await saveMessages([realMessage]); 

    const msgElement = document.querySelector(`[data-id="${tempId}"]`);
    
    if (msgElement) {
        console.log(`Swapping ${tempId} -> ${realMessage._id}`);
        
        msgElement.setAttribute("data-id", realMessage._id);
        
        const serverSeenData = JSON.stringify(realMessage.seen || []);
        msgElement.setAttribute("data-seen", serverSeenData);

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

function markMessagesAsSeenOptimistically(messages) {
    const now = new Date().toISOString();
    return messages.map(msg => {
        const seenList = msg.seen || [];
        const foundUser = seenList.find(u => {
            const idToCheck = u.userId || u._id; 
            return String(idToCheck) === String(currentUser._id);
        });
        const amIHere = !!foundUser;
        if (!amIHere) {
            const newSeenList = [...seenList];
            newSeenList.push({
                userId: currentUser._id,
                name: currentUser.userName || currentUser.firstName,
                seenAt: now
            });
            msg.seen = newSeenList;
        }
        return msg;
    });
}

axios.interceptors.response.use(
    (response) => { 
        return response;
    }, 
    async (error) => {
        const originalRequest = error.config;
        
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true; 
            console.log('🔄 Access Token expired. Attempting refresh...');
            
            try {
                const refreshUrl = `${BASE_URL}/api/v1/users/refresh-token`;
                
                await axios.post(refreshUrl, {}, { withCredentials: true });
                
                console.log('✅ Refresh successful. Retrying original request.');

                return axios(originalRequest);

            } catch (refreshError) {
                console.error("❌ Refresh failed. Logging out...", refreshError);
                window.location.href="/ChatApplication/Frontend/Pages/Login/login.html";
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);