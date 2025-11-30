import { allConversations, currentUser, getAllConversations } from "./main.js";

const createGroupBtn = document.querySelector(".create-group-btn");
const modal = document.getElementById('addNewGroup');
const closeModalBtn = document.getElementById("close-modal-btn");
const modalInput = document.getElementById('newGroupInput');
const modalTitle = document.getElementById('modal-title');
const searchResultsList = document.getElementById('user-search-results');
const finalizeGroupBtn = document.getElementById('finalize-group-btn');

let selectedParticipants = [];

createGroupBtn.addEventListener("click", openSearchModal);
closeModalBtn.addEventListener("click", closeSearchModal);

window.addEventListener("click", (e) => {
    if (e.target === modal) {
        closeSearchModal();
    }
});

finalizeGroupBtn.addEventListener("click", async () => {
    const groupName = modalInput.value.trim();

    if (!groupName) {
        alert("Please enter a Group Name");
        modalInput.focus();
        return;
    }

    if (selectedParticipants.length === 0) {
        alert("Please select at least one member");
        return;
    }

    const originalBtnText = finalizeGroupBtn.innerText;
    finalizeGroupBtn.disabled = true;
    finalizeGroupBtn.innerText = "Creating...";

    const memberIds = selectedParticipants.map(user => user._id);
    
    const payload = {
        name: groupName,
        participants: memberIds 
    };

    try {
        const response = await axios.post(`http://localhost:8000/api/v1/conversation/group`, payload, { withCredentials: true });
        
        if(response.data.success) {
           closeSearchModal();
           await getAllConversations();
        }
    } catch (error) {
        console.error("Group creation failed:", error);
        alert("Failed to create group. Please try again.");
    } finally {
        finalizeGroupBtn.disabled = false;
        finalizeGroupBtn.innerText = originalBtnText;
    }
});

function openSearchModal(e) {
    e.preventDefault();
    
    modalTitle.innerHTML = "Create New Group";
    modalInput.placeholder = "Enter Group Name...";
    modal.style.display = "flex";
    
    selectedParticipants = []; 
    
    const uniqueUsersMap = new Map();
    const currentUserIdStr = currentUser._id.toString();

    allConversations.forEach((chat) => {
        if (chat.name === "One-to-One" && chat.participants) {
            chat.participants.forEach((p) => {
                const pId = (p._id || p).toString();

                if (pId !== currentUserIdStr) {
                    if (!uniqueUsersMap.has(pId)) {
                        uniqueUsersMap.set(pId, {
                            firstName: p.firstName,
                            lastName: p.lastName,
                            _id: pId,
                            userName: p.userName,
                            photo: p.photo
                        });
                    }
                }
            })
        }
    });

    const uniqueUserList = Array.from(uniqueUsersMap.values());
    
    renderUserList(uniqueUserList);
    modalInput.focus();
}

function closeSearchModal() {
    modal.style.display = "none";
    modalInput.value = ""; 
    searchResultsList.innerHTML = "";
    selectedParticipants = [];
}

function renderUserList(users) {
    searchResultsList.innerHTML = '';
    
    if (users.length === 0) {
        searchResultsList.innerHTML = '<li style="padding:15px; text-align:center; color:#888;">No contacts found to add.</li>';
        return;
    }

    const fragment = document.createDocumentFragment();

    users.forEach(participant => {
        const li = document.createElement("li");
        li.className = 'search-item'; 

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `checkbox-${participant._id}`; 
        checkbox.value = JSON.stringify(participant);
        
        checkbox.addEventListener("change", (e) => {
            const payload = JSON.parse(e.target.value);
            
            if (e.target.checked) {
                selectedParticipants.push(payload);
            } else {
                selectedParticipants = selectedParticipants.filter(p => p._id !== payload._id);
            }
        });

        const avatarSrc = participant.photo ?? 'default-avtar.png';
        const img = document.createElement('img');
        img.src = avatarSrc;
        img.alt = participant.userName || "User";

        const div = document.createElement('div');
        div.className = 'search-details';
        
        const fullName = `${participant.firstName || ''} ${participant.lastName || ''}`.trim() || participant.userName;
        
        div.innerHTML = `
            <span class="search-name">${fullName}</span>
            <span class="search-email">@${participant.userName}</span>
        `;

        li.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });

        li.appendChild(checkbox);
        li.appendChild(img);
        li.appendChild(div);

        fragment.appendChild(li);
    });

    searchResultsList.appendChild(fragment);
}