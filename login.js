// ==============================================================================
// 🔑 MySTRA LOGIN AUTHENTICATION & CLIENT-SIDE LOCKOUT ENGINE
// ==============================================================================

// Direct global function for inline button onclick
window.togglePasswordVisibility = function() {
  const pwdInput = document.getElementById("password");
  const pwdBtn = document.getElementById("toggle-login-password");

  if (pwdInput) {
    const isPassword = pwdInput.type === "password";
    pwdInput.type = isPassword ? "text" : "password";
    if (pwdBtn) {
      pwdBtn.textContent = isPassword ? "🙈" : "👁️";
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  if (!loginForm) return;

  const emailInput = document.getElementById("email");
  const pwdInput = document.getElementById("password");
  const rememberCheckbox = document.getElementById("remember-me");

  const MAX_ATTEMPTS = 5;
  const LOCKOUT_TIME_MS = 15 * 60 * 1000;
  const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

  // Pre-fill remembered email on page load
  const savedEmail = localStorage.getItem("mystra_remembered_email");
  if (savedEmail && emailInput && rememberCheckbox) {
    emailInput.value = savedEmail;
    rememberCheckbox.checked = true;
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
    const password = pwdInput ? pwdInput.value : "";

    if (!email || !password) {
      alert("Please enter both your email and password.");
      return;
    }

    const now = Date.now();
    let attemptsData = JSON.parse(localStorage.getItem("mystra_login_attempts") || "{}");
    let userAttempts = attemptsData[email] || { count: 0, firstAttemptTime: now, lockUntil: 0 };

    if (userAttempts.lockUntil && now < userAttempts.lockUntil) {
      alert("Too many failed attempts. Please try again in 15 minutes.");
      return;
    }

    if (now - userAttempts.firstAttemptTime > ATTEMPT_WINDOW_MS) {
      userAttempts = { count: 0, firstAttemptTime: now, lockUntil: 0 };
    }

    const client = typeof getSupabaseClient === "function" ? getSupabaseClient() : window.supabaseClient;
    if (!client) {
      alert("Connection error: Supabase client unavailable.");
      return;
    }

    try {
      const { data: authData, error: authError } = await client.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (authError) {
        userAttempts.count += 1;
        if (userAttempts.count === 1) {
          userAttempts.firstAttemptTime = now;
        }

        if (userAttempts.count >= MAX_ATTEMPTS) {
          userAttempts.lockUntil = now + LOCKOUT_TIME_MS;
          attemptsData[email] = userAttempts;
          localStorage.setItem("mystra_login_attempts", JSON.stringify(attemptsData));
          alert("Too many failed attempts. Please try again in 15 minutes.");
          return;
        }

        attemptsData[email] = userAttempts;
        localStorage.setItem("mystra_login_attempts", JSON.stringify(attemptsData));

        alert("Invalid email or password.");
        return;
      }

      delete attemptsData[email];
      localStorage.setItem("mystra_login_attempts", JSON.stringify(attemptsData));

      if (emailInput && rememberCheckbox && rememberCheckbox.checked) {
        localStorage.setItem("mystra_remembered_email", email);
      } else {
        localStorage.removeItem("mystra_remembered_email");
      }

      const { data: profile } = await client
        .from("profiles")
        .select("role, is_verified")
        .eq("id", authData.user.id)
        .single();

      // Show success alert first
      const userRole = profile?.role || "user";
      alert(`Login Successful! Welcome back, ${authData.user.email}`);

      // Route based on role
      if (profile && (profile.role === "admin" || profile.role === "gov_admin")) {
        window.location.href = "gov-admin-dashboard.html";
      } else {
        window.location.href = "mystra-code-control.html";
      }

    } catch (err) {
      alert("Login Error: " + err.message);
    }
  });
});