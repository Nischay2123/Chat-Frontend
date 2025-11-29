
import { currentUser } from "./main.js";
import { getTargetUser } from "./ui.js";

const profile =document.querySelector(".column-profile");
const image = document.querySelector(".profile-image");
const userName = document.querySelector(".profile-name");
const fullName = document.querySelector(".profile-fullname");
const email = document.querySelector(".profile-email");
const btns = document.querySelector(".profile-btns")
const logOut = document.querySelector(".logout-btn-profile")



export function targetUserProfile(e,selectedChatId) {
    e.preventDefault(); 
    
    profile.style.display=profile.style.display == "flex"?"none":"flex";
    const isCurrentUser =selectedChatId._id==currentUser._id 
    // console.log(isCurrentUser);
    
    let targetUser ;
    if(isCurrentUser){
        targetUser={
            name:currentUser.userName,
            photo:currentUser.photo,
            fullName:currentUser.fullName,
            email:currentUser.email
        }
    }else targetUser= getTargetUser(selectedChatId, currentUser);
    console.log(isCurrentUser,  targetUser);


    image.src=targetUser.photo ?? `default-avtar.png`;
    userName.innerHTML=targetUser.name
    fullName.innerHTML =targetUser.fullName
    email.innerHTML=targetUser.email;
    btns.style.display=isCurrentUser ?"":"none";
}

logOut.addEventListener("click",async(e)=>{
    e.preventDefault();
    const wantToLogout = confirm("Do you want to logout");
    if (!wantToLogout) {
        return;
    }
    try {
        const response = await axios.post(`http://localhost:8000/api/v1/users/logout`,{},{
            withCredentials: true
        });
        if (!response.data.success) {
            console.log("Error while logout: ", response);
            return;
        }
        alert("Logged out successfully");
        window.location.href="http://localhost:5500/ChatApplication/Frontend/Pages/Login/login.html";
    } catch (error) {
        console.log("Error while logout outside: ",error.message);
        
    }
})

export function targetUserProfileCleanUp() {
    profile.style.display="none";
    image.src="";
    userName.innerHTML="";
    fullName.innerHTML ="";
    email.innerHTML="";
}

const profileInput = document.getElementById('profile-upload-input');
const profileImageEl = document.querySelector('.profile-image');
const uploadBtn = document.querySelector('.upload-btn'); 


if (profileInput) {
    profileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file); 

        uploadBtn.innerText = "Uploading...";
        uploadBtn.disabled = true;

        try {
            const response = await axios.put('http://localhost:8000/api/v1/users/userUpdate', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                withCredentials: true
            });

            if (response.data.success) {
                const newImageSrc = response.data.data;
                
                profileImageEl.src = newImageSrc;

                let storedUser = JSON.parse(window.localStorage.getItem("user"));
                if (storedUser) {
                    storedUser.photo = newImageSrc;
                    window.localStorage.setItem("user", JSON.stringify(storedUser));
                }

                uploadBtn.innerText = "Upload Profile Image";
                uploadBtn.disabled = false;

                alert("Profile photo updated successfully!");
            }
        } catch (error) {
            console.error("Upload Error:", error);
            alert("Failed to upload image. Please try again.");
            
            uploadBtn.innerText = "Upload Profile Image";
            uploadBtn.disabled = false;
        }
    });
}