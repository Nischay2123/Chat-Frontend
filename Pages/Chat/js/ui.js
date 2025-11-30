export const chatContainer = document.querySelector(".chat-items-container");
export const messageContainer = document.querySelector(".messages-area");
export const messageInput = document.querySelector(".message-input");
export const sendBtn = document.querySelector(".send-btn");
export const profileContainer = document.querySelector(".column-profile");
export const statusImage = document.querySelector(".status-image img");
export const statusName = document.querySelector(".status-name");

import { openSearchModal } from "./seen.js";

export function renderChatList(conversations, notifyMap, selectedChatId, currentUser) {
    const validIds = new Set();

    conversations.forEach(chat => {
        validIds.add(chat._id);

        const targetUser = getTargetUser(chat, currentUser);
        const unreadCount = notifyMap.get(chat._id) || 0;
        const isActive = selectedChatId && chat._id === selectedChatId._id;

        let previewText = "Start a conversation";
        if (chat.lastMessage && chat.lastMessage.text) {
            previewText = chat.lastMessage.text.length > 25 
                ? chat.lastMessage.text.substring(0, 25) + "..." 
                : chat.lastMessage.text;
        }

        let chatItem = chatContainer.querySelector(`.chat-item[data-id="${chat._id}"]`);

        if (chatItem) {
            const nameEl = chatItem.querySelector(".name");
            const previewEl = chatItem.querySelector(".preview");
            const imgEl = chatItem.querySelector("img");

            if (nameEl.textContent !== targetUser.name) nameEl.textContent = targetUser.name;
            if (previewEl.textContent !== previewText) previewEl.textContent = previewText;
            
            const newImgSrc = targetUser.photo || 'default-avtar.png';
            if (imgEl.src !== newImgSrc) imgEl.src = newImgSrc;

            if (isActive) chatItem.classList.add("active");
            else chatItem.classList.remove("active");

            let badge = chatItem.querySelector(".chat-notify");
            
            if (unreadCount > 0) {
                if (badge) {
                    badge.querySelector(".c-notify").textContent = unreadCount;
                } else {
                    chatItem.insertAdjacentHTML('beforeend', `<div class="chat-notify"><span class="c-notify">${unreadCount}</span></div>`);
                }
            } else {
                if (badge) badge.remove();
            }

        } else {
            const html = `
                <div class="chat-item ${isActive ? 'active' : ''}" data-id="${chat._id}">
                    <div class="avatar">
                        <img src="${targetUser.photo || 'default-avtar.png'}" alt="${targetUser.name}">
                    </div>
                    <div class="chat-info">
                        <span class="name">${targetUser.name}</span>
                        <span class="preview">${previewText}</span>
                    </div>
                    ${unreadCount > 0 ? `<div class="chat-notify"><span class="c-notify">${unreadCount}</span></div>` : ''}
                </div>
            `;
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html.trim();
            chatItem = tempDiv.firstChild;
        }

        chatContainer.appendChild(chatItem);
    });

    Array.from(chatContainer.children).forEach(child => {
        const id = child.getAttribute("data-id");
        if (!validIds.has(id)) {
            child.remove();
        }
    });
}

export function renderMessages(messages, currentUser,participants) {
    messageContainer.innerHTML = ""; 
    
    if(!messages || messages.length === 0) {
        messageContainer.innerHTML = "<p style='text-align:center; padding:20px; opacity:0.6'>No messages yet</p>";
        return;
    }

    messages.forEach(msg => appendMessageToUI(msg, currentUser,participants));
    scrollToBottom();
}

export function appendMessageToUI(msg, currentUser, participants) {
    const senderId =  msg.sender; 
    const isOutgoing = senderId === currentUser._id;
    
    let nameHTML = "";
    if (!isOutgoing && participants && participants.length > 0) {
        const senderDetails = participants.find(p => p._id.toString() === senderId.toString());
        const senderName = senderDetails ? (senderDetails.name || senderDetails.userName):"";
        if (senderName) nameHTML = `<span class="sender-name">${senderName}</span>`;
    }

    const messageWrapper = document.createElement("div");
    messageWrapper.setAttribute("data-id", msg._id); 
    messageWrapper.setAttribute("data-time", msg.createdAt); 
    messageWrapper.setAttribute("data-seen", JSON.stringify(msg.seen || [])); 
    messageWrapper.classList.add("message-wrapper", isOutgoing ? "outgoing" : "incoming");
    
    const timeVal = new Date(msg.createdAt) ;
    const timeString = timeVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isPending = msg._id && msg._id.toString().startsWith("temp_");
    const statusHTML =  (isOutgoing && isPending) ? `<span class="msg-status-icon">🕒</span>` :"";
                        // (isOutgoing && msg.seen.length==participants.length)?`<span class="msg-status-icon">✔</span>`:
                        // `<span class="msg-status-icon">✔</span>`;

    messageWrapper.innerHTML = `
        ${nameHTML}
        <div class="bubble">
            ${msg.text}
            ${statusHTML}
        </div>
        <span class="timestamp">${timeString}</span>
    `;
    messageContainer.appendChild(messageWrapper);
    messageContainer.addEventListener("click", (e) => {
        const wrapper = e.target.closest(".message-wrapper");
        
        if (!wrapper) return;

        e.preventDefault();

        const realId = wrapper.getAttribute("data-id");
        
        const msgObj = { _id: realId };

        openSearchModal(e, msgObj);
    });
    scrollToBottom();
}

export function prependMessagesToUI(messages , currentUser, participants){
        const oldHeight = messageContainer.scrollHeight;
        const currentScroll = messageContainer.scrollTop;

        messages.forEach(msg =>{
            const senderId = msg.sender._id || msg.sender; 
            const isOutgoing = senderId === currentUser._id;
            let nameHTML = "";
            if (!isOutgoing && participants && participants.length > 0) {
                const senderDetails = participants.find(p => p._id.toString() === senderId.toString());
                const senderName = senderDetails ? (senderDetails.name || senderDetails.userName):"";
                if (senderName) nameHTML = `<span class="sender-name">${senderName}</span>`;
            }

            const messageWrapper = document.createElement("div");
            messageWrapper.setAttribute("data-id", msg._id); 
            messageWrapper.setAttribute("data-time", msg.createdAt); 
            messageWrapper.setAttribute("data-seen", JSON.stringify(msg.seen || [])); 
            messageWrapper.classList.add("message-wrapper", isOutgoing ? "outgoing" : "incoming");
            
            const timeVal = new Date(msg.createdAt);
            const timeString = timeVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            messageWrapper.innerHTML = `
                ${nameHTML}
                <div class="bubble">${msg.text}</div>
                <span class="timestamp">${timeString}</span>
            `;
            messageWrapper.addEventListener("click",(e)=>{
                e.preventDefault();
                openSearchModal(e,msg);
            })
            messageContainer.insertBefore(messageWrapper, messageContainer.firstChild);
        })

        const newHeight = messageContainer.scrollHeight;
        messageContainer.scrollTop = currentScroll + (newHeight - oldHeight);
}

export function updateChatHeader(chat, currentUser) {
    const targetUser = getTargetUser(chat, currentUser);
    statusImage.src = targetUser.photo || 'default-avtar.png';
    statusName.textContent = targetUser.name;
}

export function scrollToBottom() {
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

export function getTargetUser(chat, currentUser) {
    if (chat.name !== "One-to-One") {
        return { name: chat.name, photo: null };
    }
    
    const other = chat.participants.find(p => {
        const pId = p._id.toString() 
        return pId !== currentUser._id.toString();
    });

    if (!other) return { name: "Unknown", photo: null };
//     console.log({ 
//         name: other.userName, 
//         photo: other.photo ,
//         fullName: `${other.firstName} ${other.lastName}`,
//         email: other.email
//     });
    
    return { 
        name: other.userName, 
        photo: other.photo ,
        fullName: `${other.firstName} ${other.lastName}`,
        email: other.email
    };
}