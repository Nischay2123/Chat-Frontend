// import { clearDB } from "./db.js";

const logout = document.querySelector(".logout-btn");

logout.addEventListener("click",async(e)=>{
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
        window.localStorage.removeItem("user");
        alert("Logged out successfully");
        window.location.href="http://localhost:5500/ChatApplication/Frontend/Pages/Login/login.html";
    } catch (error) {
        console.log("Error while logout outside: ",error.message);
        
    }
})

// document.querySelector(".logout-btn").addEventListener("click", async () => {
//     // 1. Clear Local Storage
//     window.localStorage.removeItem("user");
    
//     // 2. Clear IndexedDB (The Fix)
//     await clearDB();
    
//     // 3. Redirect
//     window.location.href = "/login.html"; 
// });
