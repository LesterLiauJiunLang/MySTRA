// ==============================================================================
// MySTRA STANDALONE OPERATOR REGISTRATION & OTP ENGINE
// ==============================================================================

const SUPABASE_URL = "https://lpovahpueihltaclwzzy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxwb3ZhaHB1ZWlobHRhY2x3enp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MDI0NjgsImV4cCI6MjEwMjQ3ODQ2OH0.TtSAsdEhn5ZOLiqEsLcXxB5RoPn2XIv6hd4l6v906sU";

const EMAILJS_PUBLIC_KEY = "UEZfL0Wy1O7IHQh89";
const EMAILJS_SERVICE_ID = "service_skz401b";
const EMAILJS_TEMPLATE_ID = "template_obq7co9";

function getSupabaseClient() {
  if (window.supabaseClient) return window.supabaseClient;
  if (window.supabase && typeof window.supabase.createClient === "function") {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.supabaseClient;
  }
  return null;
}

document.addEventListener("DOMContentLoaded", () => {
  // Initialize EmailJS
  if (window.emailjs) {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }

  // DOM Elements
  const registerForm = document.getElementById("register-form");
  const otpForm = document.getElementById("otp-form");

  const passwordInput = document.getElementById("reg-password");
  const confirmInput = document.getElementById("reg-confirm-password");
  const criteriaBox = document.getElementById("password-criteria-box");
  const confirmError = document.getElementById("confirm-password-error");

  const stepRegister = document.getElementById("step-register");
  const stepOtp = document.getElementById("step-otp");
  const resendBtn = document.getElementById("link-resend-otp");

  // State Variables
  let tempUserData = {
    email: "",
    password: "",
    fullName: "",
    businessName: "",
    phone: ""
  };
  let currentGeneratedOTP = null;

  // ----------------------------------------------------------------------------
  // A. EYE TOGGLES FOR PASSWORDS
  // ----------------------------------------------------------------------------
  function setupEyeToggle(inputId, toggleBtnId) {
    const input = document.getElementById(inputId);
    const toggleBtn = document.getElementById(toggleBtnId);
    if (input && toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const isPassword = input.getAttribute("type") === "password";
        input.setAttribute("type", isPassword ? "text" : "password");
        toggleBtn.textContent = isPassword ? "🙈" : "👁️";
      });
    }
  }

  setupEyeToggle("reg-password", "toggle-reg-password");
  setupEyeToggle("reg-confirm-password", "toggle-reg-confirm-password");

  // ----------------------------------------------------------------------------
  // B. 6-DIGIT OTP BOX AUTO-ADVANCE LOGIC
  // ----------------------------------------------------------------------------
  function setupOtpInputs(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const inputs = container.querySelectorAll(".otp-digit");

    inputs.forEach((input, index) => {
      input.addEventListener("input", (e) => {
        // Automatically jump to the next input field upon typing a digit
        if (e.target.value.length === 1 && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }
      });

      input.addEventListener("keydown", (e) => {
        // Go back to the previous input field on Backspace
        if (e.key === "Backspace" && !e.target.value && index > 0) {
          inputs[index - 1].focus();
        }
      });
    });
  }
  setupOtpInputs("otp-container");

  function getEnteredOtp(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return "";
    const inputs = container.querySelectorAll(".otp-digit");
    let code = "";
    inputs.forEach((inp) => (code += inp.value.trim()));
    return code;
  }

  // ----------------------------------------------------------------------------
  // C. LIVE PASSWORD CRITERIA & CONFIRM MATCH CHECKER
  // ----------------------------------------------------------------------------
  const rules = {
    length: document.getElementById("rule-length"),
    uppercase: document.getElementById("rule-uppercase"),
    number: document.getElementById("rule-number"),
    special: document.getElementById("rule-special")
  };

  function isPasswordSecure(pass) {
    const passLength = pass.length >= 8;
    const passUpper = /[A-Z]/.test(pass);
    const passNumber = /[0-9]/.test(pass);
    const passSpecial = /[@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?!]/.test(pass);
    return passLength && passUpper && passNumber && passSpecial;
  }

  function validatePasswordUI() {
    if (!passwordInput) return;
    const val = passwordInput.value;

    const checks = {
      length: val.length >= 8,
      uppercase: /[A-Z]/.test(val),
      number: /[0-9]/.test(val),
      special: /[@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?!]/.test(val)
    };

    if (rules.length) {
      rules.length.textContent = checks.length ? "✔ At least 8 characters" : "❌ At least 8 characters";
      rules.length.className = checks.length ? "rule-valid" : "rule-invalid";
    }
    if (rules.uppercase) {
      rules.uppercase.textContent = checks.uppercase ? "✔ An uppercase letter (A–Z)" : "❌ An uppercase letter (A–Z)";
      rules.uppercase.className = checks.uppercase ? "rule-valid" : "rule-invalid";
    }
    if (rules.number) {
      rules.number.textContent = checks.number ? "✔ A number (0–9)" : "❌ A number (0–9)";
      rules.number.className = checks.number ? "rule-valid" : "rule-invalid";
    }
    if (rules.special) {
      rules.special.textContent = checks.special ? "✔ A special character (@ # $ % ^ & * etc.)" : "❌ A special character (@ # $ % ^ & * etc.)";
      rules.special.className = checks.special ? "rule-valid" : "rule-invalid";
    }

    const allFulfilled = checks.length && checks.uppercase && checks.number && checks.special;
    if (criteriaBox) {
      if (val.length === 0 || allFulfilled) {
        criteriaBox.classList.add("hidden");
      } else {
        criteriaBox.classList.remove("hidden");
      }
    }

    // Confirm password matching check
    if (confirmInput && confirmInput.value.length > 0) {
      if (confirmInput.value !== passwordInput.value) {
        if (confirmError) confirmError.classList.remove("hidden");
      } else {
        if (confirmError) confirmError.classList.add("hidden");
      }
    }
  }

  if (passwordInput) {
    passwordInput.addEventListener("focus", validatePasswordUI);
    passwordInput.addEventListener("input", validatePasswordUI);
  }

  if (confirmInput) {
    confirmInput.addEventListener("input", () => {
      if (confirmInput.value !== passwordInput.value) {
        if (confirmError) confirmError.classList.remove("hidden");
      } else {
        if (confirmError) confirmError.classList.add("hidden");
      }
    });
  }

  // Helper function to transmit EmailJS OTPs
  async function sendOtpEmail(targetEmail, otpCode) {
    return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: targetEmail,
      otp_code: otpCode
    });
  }

  // ----------------------------------------------------------------------------
  // D. REGISTRATION FORM SUBMIT
  // ----------------------------------------------------------------------------
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = document.getElementById("reg-email")?.value.trim().toLowerCase() || "";
      const password = document.getElementById("reg-password")?.value || "";
      const confirmPassword = document.getElementById("reg-confirm-password")?.value || "";
      const fullName = document.getElementById("reg-fullname")?.value.trim() || "";
      const businessName = document.getElementById("reg-business-name")?.value.trim() || "";
      const phone = document.getElementById("reg-phone")?.value.trim() || "";

      // Security & Password Match Checks
      if (password !== confirmPassword) {
        alert("❌ Passwords do not match.");
        return;
      }

      if (!isPasswordSecure(password)) {
        alert("❌ Password does not meet security criteria.");
        return;
      }

      // Store form data temporarily until OTP verification succeeds
      tempUserData = { email, password, fullName, businessName, phone };

      // Generate 6-digit OTP
      currentGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();

      try {
        await sendOtpEmail(email, currentGeneratedOTP);

        // Hide Step 1, Show Step 2
        if (stepRegister) stepRegister.classList.add("hidden");
        if (stepOtp) stepOtp.classList.remove("hidden");

        alert("✅ Verification code sent to " + email);
      } catch (err) {
        alert("❌ Failed to send OTP email: " + (err.text || err.message));
      }
    });
  }

  // ----------------------------------------------------------------------------
  // E. RESEND OTP BUTTON
  // ----------------------------------------------------------------------------
  if (resendBtn) {
    resendBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!tempUserData.email) {
        alert("❌ Email missing. Please try registering again.");
        return;
      }

      currentGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();
      try {
        await sendOtpEmail(tempUserData.email, currentGeneratedOTP);
        alert("✅ A new verification code has been sent to " + tempUserData.email);
      } catch (err) {
        alert("❌ Failed to resend OTP: " + (err.text || err.message));
      }
    });
  }

  // ----------------------------------------------------------------------------
  // F. OTP FORM SUBMIT & SUPABASE INGESTION
  // ----------------------------------------------------------------------------
  if (otpForm) {
    otpForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const enteredOtp = getEnteredOtp("otp-container");

      if (enteredOtp !== currentGeneratedOTP) {
        alert("❌ Invalid or expired verification code.");
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        alert("❌ Connection error: Supabase client unavailable.");
        return;
      }

      try {
        // 1. Sign up user in Supabase Auth
        const { data: authData, error: signUpError } = await client.auth.signUp({
          email: tempUserData.email,
          password: tempUserData.password,
          options: {
            data: {
              full_name: tempUserData.fullName,
              business_name: tempUserData.businessName,
              phone_no: tempUserData.phone,
              is_verified: false
            }
          }
        });

        if (signUpError) {
          alert("❌ Registration Error: " + signUpError.message);
          return;
        }

        const userId = authData?.user?.id;
        if (!userId) {
          alert("❌ Unable to retrieve registered user ID.");
          return;
        }

        // Establish session if not automatically returned
        if (!authData.session) {
          await client.auth.signInWithPassword({
            email: tempUserData.email,
            password: tempUserData.password
          });
        }

        // 2. Insert record into `profiles` table
        const { error: profileErr } = await client
          .from("profiles")
          .upsert([
            {
              id: userId,
              full_name: tempUserData.fullName,
              business_name: tempUserData.businessName,
              phone_no: tempUserData.phone,
              role: "operator",
              is_verified: false
            }
          ]);

        if (profileErr) {
          console.error("Profile creation error:", profileErr);
        }

        alert("✅ Account registered successfully! Please log in.");
        window.location.href = "login.html";

      } catch (err) {
        alert("❌ Registration process failed: " + err.message);
      }
    });
  }
});