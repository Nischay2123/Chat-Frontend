import { currentUser } from "./main.js";
import { getTargetUser } from "./ui.js";

const profile =document.querySelector(".column-profile");
const image = document.querySelector(".profile-image");
const userName = document.querySelector(".profile-name");
const fullName = document.querySelector(".profile-fullname");
const email = document.querySelector(".profile-email");



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
}

export function targetUserProfileCleanUp() {
    profile.style.display="none";
    image.src="";
    userName.innerHTML="";
    fullName.innerHTML ="";
    email.innerHTML="";
}