import { client } from "../../supabase.js";

const loaderContainer = document.querySelector(".loader-container");
const popupElement = document.getElementById("popup");
const popupMessageElement = document.getElementById("popup-message");
const popupCloseButton = document.querySelector(".popup-close");

function showLoader() {
    loaderContainer && (loaderContainer.style.display = "flex");
}
function hideLoader() {
    loaderContainer && (loaderContainer.style.display = "none");
}
function showPopup(message) {
    if (popupMessageElement && popupElement) {
        popupMessageElement.textContent = message;
        popupElement.classList.remove("hidden");
    }
}
function hidePopup() {
    popupElement && popupElement.classList.add("hidden");
}
popupCloseButton?.addEventListener("click", hidePopup);

async function handleGoogleAuth() {
    showLoader();

    try {
        // 1. Check for active session after OAuth redirect
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        
        if (sessionError || !session) {
            showPopup("No active session. Redirecting to login...");
            setTimeout(() => (window.location.href = "login.html"), 1500);
            return;
        }

        const user = session.user;
        
        // 2. Check if user exists in private_users table (create if not exists)
        const { data: existingUser, error: userCheckError } = await client
            .from("private_users")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();
            
        if (userCheckError) {
            showPopup("Error checking user: " + userCheckError.message);
            return;
        }
        
        // Create user in private_users if not exists
        if (!existingUser) {
            const { error: insertUserError } = await client
                .from("private_users")
                .insert([{
                    id: user.id,
                    name: user.user_metadata?.full_name || user.user_metadata?.name || "",
                    email: user.email
                }]);
                
            if (insertUserError) {
                showPopup("Error creating user record: " + insertUserError.message);
                return;
            }
        }

        // 3. Check if profile exists in user_profiles
        const { data: profile, error: profileError } = await client
            .from("user_profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

        if (profileError) {
            showPopup("Error checking profile: " + profileError.message);
            return;
        }

        // 4. Redirect based on profile existence
        if (profile) {
            window.location.href = "dashboard.html";
        } else {
            window.location.href = "setupProfile.html";
        }
    } catch (err) {
        showPopup("Unexpected error: " + err.message);
        console.error(err);
    } finally {
        hideLoader();
    }
}

// Wait for DOM to be fully loaded before executing
document.addEventListener('DOMContentLoaded', handleGoogleAuth);