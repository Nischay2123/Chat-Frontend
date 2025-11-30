

const modal = document.getElementById('seen-modal');
const closeModalBtn = document.getElementById('close-modal-btn-seen');
const searchResultsList = document.getElementById('user-seen-results');
const modalTitle = document.getElementById('modal-title-seen'); 
let currentOpenMessageId = null;

closeModalBtn.addEventListener("click", closeSearchModal);

window.addEventListener("click", (e) => {
    if (e.target === modal) {
        closeSearchModal();
    }
});

export function openSearchModal(e,msg) {
    e.preventDefault();
    if(modalTitle) modalTitle.innerText = "Seen By:";
    modal.style.display = "flex";
    
    const messageElement = e.target.closest(".message-wrapper");
    if (!messageElement) return;

    const realId = messageElement.getAttribute("data-id");
    currentOpenMessageId = realId;

    const currentSeenData = JSON.parse(messageElement.getAttribute("data-seen") || "[]");
    // console.log(currentSeenData);
    
    renderSeenList(currentSeenData);
}

function closeSearchModal() {
    modal.style.display = "none";
    searchResultsList.innerHTML = "";
}


function renderSeenList(seenArray) {
    searchResultsList.innerHTML = "";

    seenArray.forEach(user => {
            const li = document.createElement('li');
            li.className = 'search-item';
            const fullName = `${user.name}`;

            li.innerHTML = `
                <div class="search-details">
                    <span class="search-name">${fullName}</span>
                    <span class="search-time" style="font-size:12px; color:#888;">
                       ${user.seenAt ? new Date(user.seenAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                    </span>
                </div>
            `;
            searchResultsList.appendChild(li);
    });
}

export function refreshCurrentSeenModal() {
    if (modal.style.display === "flex" && currentOpenMessageId) {
        
        const messageElement = document.querySelector(`.message-wrapper[data-id="${currentOpenMessageId}"]`);
        
        if (messageElement) {
            const updatedSeenData = JSON.parse(messageElement.getAttribute("data-seen") || "[]");
            
            renderSeenList(updatedSeenData);
        }
    }
}